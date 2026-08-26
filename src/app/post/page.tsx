import { SiteHeader } from "@/components/site-header";
import { Window } from "@/components/window";
import { requireProfile } from "@/lib/auth";
import { PostFlow } from "./post-flow";

export default async function PostEventPage() {
  const profile = await requireProfile();

  return (
    <>
      <SiteHeader profile={profile} />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 p-4">
        <Window title="post an event">
          <p className="mb-4 font-sans text-sm text-ink/80">
            Paste the link to something you&apos;re going to. Friends see it as
            an invite, then click through to register themselves.
          </p>
          <PostFlow />
        </Window>
      </main>
    </>
  );
}
