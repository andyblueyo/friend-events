import { SiteHeader } from "@/components/site-header";
import { Window } from "@/components/window";
import { requireProfile } from "@/lib/auth";

export default async function FriendsPage() {
  const profile = await requireProfile();

  return (
    <>
      <SiteHeader profile={profile} />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 p-4">
        <Window title="friends">
          <p className="font-sans text-sm text-ink/80">
            Search, pending requests and the accepted list come next — the
            friendships table and its policies are already in place.
          </p>
        </Window>
      </main>
    </>
  );
}
