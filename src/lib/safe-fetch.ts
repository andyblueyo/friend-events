import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Guarded HTML fetcher for user-supplied URLs.
 *
 * The scrape action lets any signed-in user make our server issue a request to
 * an address they choose, which is textbook SSRF: without a guard, someone can
 * point it at 169.254.169.254 (cloud metadata) or a service on the private
 * network and read the response back off the confirm screen. So we resolve the
 * host first and refuse anything that isn't a public address, re-checking on
 * every redirect hop.
 *
 * Known residual risk: DNS rebinding. We validate the resolved address, then
 * fetch by hostname, so a hostile resolver could return a public IP for our
 * check and a private one for the real connection. Closing that needs a custom
 * undici dispatcher pinned to the validated IP — worth doing if this ever
 * becomes a public endpoint.
 */

const TIMEOUT_MS = 9_000;
const MAX_REDIRECTS = 3;
const MAX_BYTES = 2_000_000;

// Some event sites (Eventbrite in particular) serve a block page to unknown
// user agents.
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/** A problem with the URL itself — safe to show to the user verbatim. */
export class UnsafeUrlError extends Error {}

/** Parses and sanity-checks a pasted URL before anything touches the network. */
export function parseHttpUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) throw new UnsafeUrlError("Paste a link first.");

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new UnsafeUrlError("That doesn't look like a link.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Only http:// and https:// links work.");
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("Links with a username or password aren't allowed.");
  }

  return url;
}

/**
 * True when the host is a literal IP in a non-public range.
 *
 * For URLs we only ever *store* and hand to the browser (source_url,
 * image_url) rather than fetch. Hygiene, not a security boundary — a hostname
 * that resolves privately still passes, since checking that needs DNS. It
 * costs nothing and keeps a posted "open link" from pointing at someone's
 * router.
 */
export function isBlockedIpLiteral(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "");
  const family = isIP(host);
  if (!family) return false;
  return family === 4 ? ipv4IsBlocked(host) : ipv6IsBlocked(host);
}

function ipv4IsBlocked(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  // Anything we can't read confidently is treated as blocked.
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }

  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true; // this-network, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 192 && b === 0) return true; // IETF protocol assignments / TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51) return true; // TEST-NET-2
  if (a === 203 && b === 0) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast, reserved, broadcast

  return false;
}

function ipv6IsBlocked(ip: string): boolean {
  const addr = ip.toLowerCase().split("%")[0]; // drop any zone index
  if (addr === "::" || addr === "::1") return true;

  const mapped = addr.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return ipv4IsBlocked(mapped[1]);

  const head = parseInt(addr.split(":")[0] || "0", 16);
  if (Number.isNaN(head)) return true;
  if ((head & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((head & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
  if ((head & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (addr.startsWith("2001:db8")) return true; // documentation

  return false;
}

async function assertPublicHost(hostname: string) {
  // URL.hostname keeps the brackets on IPv6 literals ("[::1]"), which isIP()
  // doesn't recognise — strip them so literals hit the IP check instead of
  // falling through to a DNS lookup that just happens to fail.
  const host = hostname.replace(/^\[|\]$/g, "");
  const literalFamily = isIP(host);

  const addresses = literalFamily
    ? [{ address: host, family: literalFamily }]
    : await lookup(host, { all: true, verbatim: true }).catch(() => {
        throw new UnsafeUrlError("Couldn't find that domain.");
      });

  if (!addresses.length) {
    throw new UnsafeUrlError("Couldn't find that domain.");
  }

  // Every resolved address has to be public — one private answer is enough to
  // reach an internal service.
  for (const { address, family } of addresses) {
    const blocked = family === 4 ? ipv4IsBlocked(address) : ipv6IsBlocked(address);
    if (blocked) {
      throw new UnsafeUrlError("That link points at a private address.");
    }
  }
}

async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    total += value.length;
    if (total > MAX_BYTES) {
      // A truncated document still parses fine — <head> is all we need.
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }

  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}

/**
 * Fetches HTML from a validated public URL, following redirects by hand so
 * each hop gets the same address check.
 */
export async function fetchHtml(
  startUrl: URL,
): Promise<{ html: string; finalUrl: URL }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let url = startUrl;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublicHost(url.hostname);

      const response = await fetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent": BROWSER_UA,
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new Error(`redirect ${response.status} with no location`);

        const nextUrl = new URL(location, url);
        if (nextUrl.protocol !== "http:" && nextUrl.protocol !== "https:") {
          throw new UnsafeUrlError("That link redirects somewhere we can't follow.");
        }
        url = nextUrl;
        continue;
      }

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const contentType = response.headers.get("content-type") ?? "";
      if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
        throw new Error(`not an HTML page (${contentType})`);
      }

      return { html: await readCapped(response), finalUrl: url };
    }

    throw new Error("too many redirects");
  } finally {
    clearTimeout(timer);
  }
}
