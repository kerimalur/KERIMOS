import * as React from "react";

type Div = React.HTMLAttributes<HTMLDivElement>;

export const cx = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(" ");

/** Weiche Karte: heller als der Grund, Kante nur angedeutet. */
export function Card({ className, ...props }: Div) {
  return (
    <div
      className={cx(
        "rounded-2xl border border-line/70 bg-card p-6",
        className
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: Div) {
  return (
    <div
      className={cx(
        "mb-4 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted",
        className
      )}
      {...props}
    />
  );
}

export function Stat({
  label, value, sub, tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const toneClass = {
    neutral: "text-ink", good: "text-good", warn: "text-warn", bad: "text-bad",
  }[tone];
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
        {label}
      </div>
      <div className={cx("tabular mt-1.5 text-[26px] font-medium leading-tight", toneClass)}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-ink-muted">{sub}</div>}
    </div>
  );
}

export const inputClass =
  "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink " +
  "placeholder:text-ink-faint outline-none transition " +
  "hover:border-line-strong focus:border-accent focus:ring-2 focus:ring-accent/15";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputClass, props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputClass, props.className)} />;
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cx("mb-1.5 block text-xs text-ink-muted", className)} {...props} />
  );
}

export function Button({
  variant = "primary", className, ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium " +
    "transition disabled:cursor-not-allowed disabled:opacity-40";
  const variants = {
    primary: "bg-accent text-white hover:bg-accent-soft",
    ghost: "border border-line bg-card text-ink-soft hover:border-line-strong hover:text-ink",
    danger: "border border-line text-bad hover:bg-bad-tint",
  };
  return <button {...props} className={cx(base, variants[variant], className)} />;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-sand/60 px-4 py-10 text-center text-sm text-ink-muted">
      {children}
    </div>
  );
}

export function Badge({
  children, tone = "neutral", title,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad" | "accent";
  /** Tooltip, z.B. die Begründung hinter dem Badge. */
  title?: string;
}) {
  const tones = {
    neutral: "bg-sand text-ink-soft",
    good: "bg-good-tint text-good",
    warn: "bg-warn-tint text-warn",
    bad: "bg-bad-tint text-bad",
    accent: "bg-accent-tint text-accent-soft",
  };
  return (
    <span
      title={title}
      className={cx("rounded-md px-2 py-0.5 text-[11px] font-medium", tones[tone])}
    >
      {children}
    </span>
  );
}
