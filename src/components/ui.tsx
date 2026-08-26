import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

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
  error,
  required,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="font-display mb-1 block text-sm text-ink">
        {label}
        {required ? (
          <span aria-hidden className="text-poppy">
            {" "}
            *
          </span>
        ) : null}
      </span>
      <input
        required={required}
        aria-invalid={error ? true : undefined}
        className={`bg-white w-full px-3 py-2 font-sans text-ink outline-none ${
          error
            ? "border-poppy-error focus:shadow-[3px_3px_0_0_var(--color-poppy)]"
            : "border-ink focus:shadow-[3px_3px_0_0_var(--color-cobalt)]"
        } ${className}`}
        {...props}
      />
      {error ? (
        <span className="mt-1 block font-mono text-xs text-poppy">{error}</span>
      ) : hint ? (
        <span className="mt-1 block font-mono text-xs text-ink/60">{hint}</span>
      ) : null}
    </label>
  );
}

/** Same frame as Field, but a multi-line textarea with an optional live counter. */
export function Textarea({
  label,
  hint,
  error,
  required,
  className = "",
  maxLength,
  value,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
  error?: string;
}) {
  const length = typeof value === "string" ? value.length : 0;

  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between gap-2">
        <span className="font-display text-sm text-ink">
          {label}
          {required ? (
            <span aria-hidden className="text-poppy">
              {" "}
              *
            </span>
          ) : null}
        </span>
        {maxLength ? (
          <span className="font-mono text-xs text-ink/50">
            {length}/{maxLength}
          </span>
        ) : null}
      </span>
      <textarea
        required={required}
        aria-invalid={error ? true : undefined}
        className={`bg-white w-full resize-none px-3 py-2 font-sans text-ink outline-none ${
          error
            ? "border-poppy-error focus:shadow-[3px_3px_0_0_var(--color-poppy)]"
            : "border-ink focus:shadow-[3px_3px_0_0_var(--color-cobalt)]"
        } ${className}`}
        maxLength={maxLength}
        value={value}
        {...props}
      />
      {error ? (
        <span className="mt-1 block font-mono text-xs text-poppy">{error}</span>
      ) : hint ? (
        <span className="mt-1 block font-mono text-xs text-ink/60">{hint}</span>
      ) : null}
    </label>
  );
}

/**
 * A labeled row of mutually-exclusive buttons that can also be fully unset.
 * Clicking the already-selected option clears it back to null — there's no
 * separate "clear" control, and no option is pre-selected by default.
 */
export function ToggleGroup<Value extends string>({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  options: { value: Value; label: string }[];
  value: Value | null;
  onChange: (value: Value | null) => void;
}) {
  return (
    <div>
      <span className="font-display mb-1 block text-sm text-ink">{label}</span>
      <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <Button
              key={option.value}
              type="button"
              variant={selected ? "primary" : "plain"}
              aria-pressed={selected}
              className="px-3 py-1.5 text-sm"
              onClick={() => onChange(selected ? null : option.value)}
            >
              {option.label}
            </Button>
          );
        })}
      </div>
      {hint ? (
        <span className="mt-1 block font-mono text-xs text-ink/60">{hint}</span>
      ) : null}
    </div>
  );
}

/** Indeterminate, deliberately chunky progress bar for waiting states. */
export function ProgressBar({ label }: { label?: string }) {
  return (
    <div aria-live="polite">
      <div className="border-ink h-5 w-full overflow-hidden bg-white">
        <div
          className="h-full w-1/3 animate-[dither-slide_1.1s_linear_infinite]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, var(--color-cobalt) 0 4px, var(--color-ink) 4px 8px)",
          }}
        />
      </div>
      {label ? (
        <p className="mt-1 font-mono text-xs text-ink/60">{label}</p>
      ) : null}
    </div>
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
