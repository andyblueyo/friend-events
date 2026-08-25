import { SiteHeader } from "@/components/site-header";
import { Window } from "@/components/window";
import { requireProfile } from "@/lib/auth";

export default async function PostEventPage() {
  const profile = await requireProfile();

  return (
    <>
      <SiteHeader profile={profile} />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 p-4">
        <Window title="post an event">
          <p className="font-sans text-sm text-ink/80">
            Paste-a-link scraping (JSON-LD → Open Graph) and the confirm/edit
            screen come next.
          </p>
        </Window>
      </main>
    </>
  );
}
