"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button, Field } from "@/components/ui";
import { authenticate, type AuthMode, type LoginState } from "./actions";

const INITIAL: LoginState = { status: "idle" };

function SubmitButton({ mode }: { mode: AuthMode }) {
  const { pending } = useFormStatus();
  const label = mode === "signin" ? "sign in" : "create account";
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "…" : label}
    </Button>
  );
}

function ModeTab({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`font-display border-ink flex-1 px-3 py-1.5 text-sm leading-none ${
        active ? "bg-cobalt text-white" : "bg-paper text-ink hover:bg-grid"
      }`}
    >
      {children}
    </button>
  );
}

export function LoginForm({
  next,
  linkError,
}: {
  next: string;
  linkError?: string;
}) {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [state, formAction] = useActionState(authenticate, INITIAL);

  if (state.status === "check_email") {
    return (
      <div className="space-y-3">
        <p className="font-display text-lg">check your email</p>
        <p className="font-sans text-sm text-ink/80">
          We sent a confirmation link. Open it and you&apos;re in.
        </p>
      </div>
    );
  }

  const isSignup = mode === "signup";

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <ModeTab active={!isSignup} onClick={() => setMode("signin")}>
          sign in
        </ModeTab>
        <ModeTab active={isSignup} onClick={() => setMode("signup")}>
          create account
        </ModeTab>
      </div>

      {/* Remount on mode change so a stale error doesn't hang around. */}
      <form key={mode} action={formAction} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="mode" value={mode} />

        <Field
          label="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
        />

        <Field
          label="password"
          name="password"
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          required
          minLength={isSignup ? 8 : undefined}
          hint={isSignup ? "At least 8 characters." : undefined}
        />

        {isSignup ? (
          <Field
            label="display name"
            name="display_name"
            autoComplete="name"
            required
            placeholder="how friends know you"
          />
        ) : null}

        <SubmitButton mode={mode} />

        {linkError ? (
          <p className="font-mono text-xs text-poppy">
            {linkError === "invalid_link"
              ? "That link expired or was already used."
              : "Something was missing from that link."}
          </p>
        ) : null}

        {state.status === "error" ? (
          <p className="font-mono text-xs text-poppy">{state.message}</p>
        ) : null}
      </form>
    </div>
  );
}
