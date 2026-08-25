import type { ReactNode } from "react";

/**
 * The Win95-style panel every surface in the app is built from: cobalt title
 * bar with `_ □ x` glyphs, sharp ink-navy border, hard drop shadow.
 */
export function Window({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`border-ink bg-paper shadow-[6px_6px_0_0_var(--color-ink)] ${className}`}
    >
      <header className="bg-cobalt flex items-center justify-between border-b-[2.5px] border-ink px-3 py-1.5">
        <h2 className="font-display text-base leading-none text-white">
          {title}
        </h2>
        <span
          aria-hidden
          className="font-display select-none text-base leading-none tracking-[0.2em] text-white"
        >
          _ □ x
        </span>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}
