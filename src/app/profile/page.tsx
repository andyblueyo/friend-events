import { SiteHeader } from "@/components/site-header";
import { Window } from "@/components/window";
import { requireProfile } from "@/lib/auth";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const profile = await requireProfile();

  return (
    <>
      <SiteHeader profile={profile} />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 p-4">
        <Window title="your profile">
          <div className="space-y-4">
            <p className="font-mono text-xs text-ink/60">{profile.email}</p>
            <ProfileForm profile={profile} />
          </div>
        </Window>
      </main>
    </>
  );
}
