import type { ButtonHTMLAttributes, InputHTMLAttributes } from "react";

const BUTTON_BASE =
  "font-display border-ink inline-flex items-center justify-center px-4 py-2 text-base leading-none " +
  "shadow-[3px_3px_0_0_var(--color-ink)] transition-transform " +
  "active:translate-x-[3px] active:translate-y-[3px] active:shadow-none " +
  "disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-none disabled:active:shadow-[3px_3px_0_0_var(--color-ink)]";

/** Solid cobalt fill, white text, thick border, sharp corners. */
export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "plain";
}) {
  const tone =
    variant === "primary"
      ? "bg-cobalt text-white"
      : "bg-paper text-ink hover:bg-grid";

  return <button className={`${BUTTON_BASE} ${tone} ${className}`} {...props} />;
}

export function Field({
  label,
  hint,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="font-display mb-1 block text-sm text-ink">{label}</span>
      <input
        className={`border-ink bg-white w-full px-3 py-2 font-sans text-ink outline-none focus:shadow-[3px_3px_0_0_var(--color-cobalt)] ${className}`}
        {...props}
      />
      {hint ? (
        <span className="mt-1 block font-mono text-xs text-ink/60">{hint}</span>
      ) : null}
    </label>
  );
}

/** Square avatar chip with a thick border — never a circle. */
export function AvatarChip({
  name,
  src,
  size = 32,
}: {
  name: string;
  src?: string | null;
  size?: number;
}) {
  const initials = name.trim().slice(0, 2).toUpperCase() || "??";

  return (
    <span
      className="border-ink bg-poppy inline-flex shrink-0 items-center justify-center overflow-hidden align-middle"
      style={{ width: size, height: size }}
      title={name}
    >
      {src ? (
        // Remote avatar hosts aren't known ahead of time, so this stays a
        // plain <img> rather than next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          width={size}
          height={size}
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          className="font-display leading-none text-white"
          style={{ fontSize: Math.round(size * 0.4) }}
        >
          {initials}
        </span>
      )}
    </span>
  );
}
