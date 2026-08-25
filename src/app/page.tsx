import { SiteHeader } from "@/components/site-header";
import { Window } from "@/components/window";
import { requireProfile } from "@/lib/auth";

export default async function FeedPage() {
  const profile = await requireProfile();

  return (
    <>
      <SiteHeader profile={profile} />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 p-4">
        <Window title="feed">
          <p className="font-display text-lg">
            hey {profile.display_name.toLowerCase()}
          </p>
          <p className="mt-2 font-sans text-sm text-ink/80">
            Nothing here yet — the feed lands in build step 4, once events and
            interest are wired up.
          </p>
        </Window>
      </main>
    </>
  );
}
