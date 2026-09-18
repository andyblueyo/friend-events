import Link from "next/link";

import { Button } from "@/components/ui";

const STEPS = [
  {
    title: "paste a link",
    body: "Drop in a Partiful, Luma, or Eventbrite link. We pull the title, date, and location automatically.",
  },
  {
    title: "friends see it",
    body: "It shows up in your friends' feed, framed as an invite from you — not a neutral listing.",
  },
  {
    title: "tap interested",
    body: "A soft yes, visible to the group. Then everyone follows the original link to actually register.",
  },
];

/** Public marketing page shown at `/` to signed-out visitors. */
export function LandingPage() {
  return (
    <>
      <header className="border-b-[2.5px] border-ink bg-cobalt">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-2">
          <span className="font-display text-base text-white sm:text-lg">
            eventswithfriends
          </span>
          <Link href="/login">
            <Button variant="plain" className="px-3 py-1.5 text-xs sm:text-sm">
              sign in
            </Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-12 p-4 py-10 sm:py-16">
        <section className="relative">
          <span
            aria-hidden
            className="border-ink bg-sunflower absolute -top-3 right-6 z-10 rotate-[-5deg] px-2 py-1 font-display text-xs leading-none text-ink"
          >
            open to company
          </span>

          <div className="border-ink bg-paper shadow-[6px_6px_0_0_var(--color-ink)]">
            <div className="bg-cobalt flex items-center justify-between gap-2 border-b-[2.5px] border-ink px-3 py-1.5">
              <h1 className="font-display text-base leading-none text-white">
                eventswithfriends
              </h1>
              <span
                aria-hidden
                className="font-display text-base leading-none tracking-[0.2em] text-white"
              >
                _ □ x
              </span>
            </div>

            <div className="space-y-5 p-6 sm:p-10">
              <h2 className="font-display text-3xl leading-tight text-ink sm:text-4xl">
                I&apos;m going — come if you want.
              </h2>
              <p className="max-w-xl font-sans text-base text-ink/80">
                Post the events you&apos;re already going to. Friends see them
                in one feed, tap &ldquo;interested&rdquo; if they&apos;re in,
                then book through the original link themselves. No ticketing,
                no RSVPs, no algorithm — just a heads up from people you
                actually know.
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <Link href="/login">
                  <Button className="px-5 py-2.5 text-base">
                    create account
                  </Button>
                </Link>
                <Link href="/login">
                  <Button variant="plain" className="px-5 py-2.5 text-base">
                    sign in
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-5 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <div
              key={step.title}
              className="border-ink bg-paper shadow-[4px_4px_0_0_var(--color-ink)]"
            >
              <div className="bg-cobalt border-b-[2.5px] border-ink px-3 py-1.5">
                <span className="font-mono text-xs text-white">
                  step {i + 1}
                </span>
              </div>
              <div className="space-y-2 p-4">
                <h3 className="font-display text-lg text-ink">
                  {step.title}
                </h3>
                <p className="font-sans text-sm text-ink/75">{step.body}</p>
              </div>
            </div>
          ))}
        </section>

        <section className="border-ink bg-paper shadow-[4px_4px_0_0_var(--color-ink)]">
          <div className="bg-cobalt border-b-[2.5px] border-ink px-3 py-1.5">
            <h2 className="font-display text-base text-white">
              why not just use a group chat
            </h2>
          </div>
          <div className="p-5">
            <p className="font-sans text-sm text-ink/80">
              Because event links get buried in fifteen unrelated messages
              within an hour. This is a lightweight signal layer, not a
              listing board: reverse-chronological, no ranking, no public
              discovery — just what your actual friends are going to.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t-[1.5px] border-ink/10 py-6 text-center font-mono text-xs text-ink/50">
        mutual friends only · no ticketing in-app · your data stays with your
        friends
      </footer>
    </>
  );
}
