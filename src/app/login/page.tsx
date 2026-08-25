import { Window } from "@/components/window";
import { safeNextPath } from "@/lib/safe-redirect";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNextPath(
    typeof params.next === "string" ? params.next : null,
  );
  const linkError = typeof params.error === "string" ? params.error : undefined;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="font-display text-3xl text-ink">eventswithfriends</h1>
          <p className="mt-1 font-mono text-xs text-ink/70">
            I&apos;m going — come if you want.
          </p>
        </div>

        <Window title="sign in">
          <LoginForm next={next} linkError={linkError} />
        </Window>
      </div>
    </main>
  );
}
