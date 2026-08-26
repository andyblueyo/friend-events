import * as cheerio from "cheerio";

import { fetchHtml, parseHttpUrl, UnsafeUrlError } from "@/lib/safe-fetch";

export type ScrapeStatus = "ok" | "partial" | "failed";

export type ScrapeResult = {
  title: string | null;
  event_datetime: string | null; // ISO string
  location: string | null;
  image_url: string | null;
  source_url: string;
  scrape_status: ScrapeStatus;
};

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function isObject(value: Json | undefined): value is { [key: string]: Json } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstString(value: Json | undefined): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstString(item);
      if (found) return found;
    }
  }
  return null;
}

/** schema.org has many Event subtypes — MusicEvent, SocialEvent, and so on. */
function isEventNode(node: Json): node is { [key: string]: Json } {
  if (!isObject(node)) return false;

  const type = node["@type"];
  const types = Array.isArray(type) ? type : [type];

  return types.some(
    (t) => typeof t === "string" && /(^|:)[A-Za-z]*Event$/.test(t.trim()),
  );
}

/**
 * Flattens the shapes JSON-LD shows up in: a bare object, an array of them, or
 * an @graph wrapper (common on WordPress and Luma-style pages).
 */
function flattenNodes(parsed: Json, depth = 0): Json[] {
  if (depth > 4) return [];

  if (Array.isArray(parsed)) {
    return parsed.flatMap((item) => flattenNodes(item, depth + 1));
  }

  if (isObject(parsed)) {
    const graph = parsed["@graph"];
    if (graph !== undefined) {
      return [parsed, ...flattenNodes(graph, depth + 1)];
    }
    return [parsed];
  }

  return [];
}

function parseDate(value: Json | undefined): string | null {
  const raw = firstString(value);
  if (!raw) return null;

  const parsed = new Date(raw);
  // Scrapers see plenty of junk dates — a bad one just means the user fills it
  // in themselves.
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseAddress(address: Json | undefined): string | null {
  const direct = firstString(address);
  if (direct) return direct;

  if (Array.isArray(address)) {
    for (const item of address) {
      const found = parseAddress(item);
      if (found) return found;
    }
    return null;
  }

  if (!isObject(address)) return null;

  // PostalAddress
  const parts = [
    firstString(address.streetAddress),
    firstString(address.addressLocality),
    firstString(address.addressRegion),
    firstString(address.postalCode),
  ].filter(Boolean);

  return parts.length ? parts.join(", ") : null;
}

function parseLocation(location: Json | undefined): string | null {
  const direct = firstString(location);
  if (direct) return direct;

  if (Array.isArray(location)) {
    for (const item of location) {
      const found = parseLocation(item);
      if (found) return found;
    }
    return null;
  }

  if (!isObject(location)) return null;

  // Name first, address second, per the spec.
  return firstString(location.name) ?? parseAddress(location.address);
}

function parseImage(image: Json | undefined): string | null {
  const direct = firstString(image);
  if (direct) return direct;

  if (Array.isArray(image)) {
    for (const item of image) {
      const found = parseImage(item);
      if (found) return found;
    }
    return null;
  }

  if (!isObject(image)) return null;

  // ImageObject
  return firstString(image.url) ?? firstString(image.contentUrl);
}

function resolveUrl(value: string | null, base: URL): string | null {
  if (!value) return null;
  try {
    return new URL(value, base).toString();
  } catch {
    return null;
  }
}

type Extracted = Pick<
  ScrapeResult,
  "title" | "event_datetime" | "location" | "image_url"
>;

/** Exported for testing against fixture HTML without hitting the network. */
export function extractFromHtml(html: string, finalUrl: URL): Extracted {
  const $ = cheerio.load(html);

  const result: Extracted = {
    title: null,
    event_datetime: null,
    location: null,
    image_url: null,
  };

  // --- JSON-LD first: the most reliable source when it's there. ---
  const blocks = $('script[type="application/ld+json"]')
    .toArray()
    .map((el) => $(el).text());

  for (const block of blocks) {
    let parsed: Json;
    try {
      parsed = JSON.parse(block);
    } catch {
      continue; // malformed JSON-LD is common; just skip the block
    }

    const eventNode = flattenNodes(parsed).find(isEventNode);
    if (!eventNode) continue;

    result.title = firstString(eventNode.name);
    result.event_datetime = parseDate(eventNode.startDate);
    result.location = parseLocation(eventNode.location);
    result.image_url = resolveUrl(parseImage(eventNode.image), finalUrl);
    break; // first Event node wins
  }

  // --- Open Graph fallback for whatever is still missing. ---
  const meta = (property: string) =>
    firstString(
      $(`meta[property="${property}"]`).attr("content") ??
        $(`meta[name="${property}"]`).attr("content") ??
        null,
    );

  if (!result.title) {
    // <title> as a last resort: title is required to post, so an empty one
    // means the user has to retype something the page already told us.
    result.title = meta("og:title") ?? firstString($("title").first().text());
  }

  if (!result.image_url) {
    result.image_url = resolveUrl(meta("og:image"), finalUrl);
  }

  // Deliberately no date/location guessing from og:description — a wrong date
  // that looks confident is worse than an empty field the user fills in.

  return result;
}

/**
 * Fetches and scrapes an event page. Never throws for a page-level problem:
 * a failed scrape still returns source_url so the user can fill in the rest by
 * hand.
 */
export async function scrapeEventUrl(rawUrl: string): Promise<ScrapeResult> {
  // A malformed or private URL is the user's problem to fix, so this one does
  // throw — the action turns it into an inline message.
  const url = parseHttpUrl(rawUrl);
  const sourceUrl = url.toString();

  let html: string;
  let finalUrl: URL;

  try {
    ({ html, finalUrl } = await fetchHtml(url));
  } catch (error) {
    if (error instanceof UnsafeUrlError) throw error;

    return {
      title: null,
      event_datetime: null,
      location: null,
      image_url: null,
      source_url: sourceUrl,
      scrape_status: "failed",
    };
  }

  let extracted: Extracted;
  try {
    extracted = extractFromHtml(html, finalUrl);
  } catch {
    return {
      title: null,
      event_datetime: null,
      location: null,
      image_url: null,
      source_url: sourceUrl,
      scrape_status: "failed",
    };
  }

  // "ok" means the three fields that make a usable card all came through.
  // Image is excluded — plenty of real events don't have one.
  const complete =
    Boolean(extracted.title) &&
    Boolean(extracted.event_datetime) &&
    Boolean(extracted.location);

  return {
    ...extracted,
    source_url: sourceUrl,
    scrape_status: complete ? "ok" : "partial",
  };
}
