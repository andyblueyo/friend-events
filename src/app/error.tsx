"use client";

import { Button } from "@/components/ui";
import { Window } from "@/components/window";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Window title="error">
          <p className="font-display text-lg">that didn&apos;t work</p>
          <p className="mt-2 font-mono text-xs break-words text-ink/80">
            {error.message}
          </p>
          <Button onClick={reset} className="mt-4">
            try again
          </Button>
        </Window>
      </div>
    </main>
  );
}
