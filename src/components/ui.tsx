import * as React from "react";

type Div = React.HTMLAttributes<HTMLDivElement>;

export const cx = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(" ");

/** Die fünf Lebensbereiche haben je einen eigenen Ton. */
export type Area = "geld" | "zeit" | "gym" | "essen" | "trading" | "accent";

/** Farbgrund, Textton und Schatten pro Bereich — an einer Stelle gepflegt. */
export const AREA: Record<Area, { bg: string; text: string; ring: string; shadow: string; dot: string }> = {
  geld: { bg: "bg-geld-bg", text: "text-geld-bright", ring: "border-geld/25", shadow: "shadow-glow-geld", dot: "bg-geld" },
  zeit: { bg: "bg-zeit-bg", text: "text-zeit-bright", ring: "border-zeit/25", shadow: "shadow-glow-zeit", dot: "bg-zeit" },
  gym: { bg: "bg-gym-bg", text: "text-gym-bright", ring: "border-gym/25", shadow: "shadow-glow-gym", dot: "bg-gym" },
  essen: { bg: "bg-essen-bg", text: "text-essen-bright", ring: "border-essen/25", shadow: "shadow-glow-essen", dot: "bg-essen" },
  trading: { bg: "bg-trading-bg", text: "text-trading-bright", ring: "border-trading/25", shadow: "shadow-glow-trading", dot: "bg-trading" },
  accent: { bg: "bg-accent-tint", text: "text-accent-soft", ring: "border-accent/25", shadow: "shadow-glow-accent", dot: "bg-accent" },
};

/**
 * Weiche Karte: eine Stufe heller als der Grund, tiefer weicher Sockel,
 * Kante nur angedeutet. Mit `area` bekommt sie den Farbgrund des Bereichs.
 */
export function Card({
  className, area, flat, ...props
}: Div & { area?: Area; flat?: boolean }) {
  const a = area ? AREA[area] : null;
  return (
    <div
      className={cx(
        "rounded-2xl border p-6 animate-pop",
        a ? cx(a.bg, a.ring, a.shadow) : "border-line/70 bg-card",
        !a && !flat && "shadow-card",
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
  label, value, sub, tone = "neutral", area,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad";
  /** Übersteuert `tone` mit der Farbe eines Bereichs. */
  area?: Area;
}) {
  const toneClass = area
    ? AREA[area].text
    : {
        neutral: "text-ink", good: "text-good-bright",
        warn: "text-accent", bad: "text-bad-bright",
      }[tone];
  // Die grosse Zahl bekommt einen leisen Schein in ihrer eigenen Farbe —
  // auf dem dunklen Grund liest sie sich dadurch als Leuchtziffer.
  const glow = {
    neutral: undefined, good: "0 0 20px rgba(95,194,166,.33)",
    warn: "0 0 20px rgba(231,169,107,.33)", bad: "0 0 20px rgba(226,139,114,.33)",
  }[tone];
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
        {label}
      </div>
      <div
        className={cx("tabular mt-1.5 font-display text-[26px] font-bold leading-tight", toneClass)}
        style={glow && !area ? { textShadow: glow } : undefined}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-ink-muted">{sub}</div>}
    </div>
  );
}

export const inputClass =
  "w-full rounded-xl border border-line bg-field px-3 py-2 text-sm text-ink " +
  "placeholder:text-ink-faint outline-none transition " +
  "hover:border-line-strong focus:border-accent focus:ring-2 focus:ring-accent/20";

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
  // Der leichte Rückstoss beim Drücken ist das, was den Tactile-Stil
  // ausmacht: die Fläche gibt kurz nach, statt nur die Farbe zu wechseln.
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium " +
    "transition duration-150 ease-tactile active:scale-[0.96] " +
    "disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100";
  const variants = {
    primary: "bg-accent text-ink-on shadow-glow-accent hover:bg-accent-soft",
    ghost: "border border-line bg-sand text-ink-soft hover:border-line-strong hover:text-ink",
    danger: "border border-bad/30 bg-bad-tint text-bad-bright hover:border-bad/60",
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
    good: "bg-good-tint text-good-bright",
    warn: "bg-warn-tint text-accent",
    bad: "bg-bad-tint text-bad-bright",
    accent: "bg-accent-tint text-accent-soft",
  };
  return (
    <span
      title={title}
      className={cx("rounded-lg px-2 py-0.5 text-[11px] font-medium", tones[tone])}
    >
      {children}
    </span>
  );
}

/**
 * Waagrechter Fortschrittsbalken, der beim Erscheinen aufläuft.
 * Ersetzt die vielen handgebauten Balken-Divs im Projekt.
 */
export function Bar({
  pct, color = "#E7A96B", className,
}: { pct: number; color?: string; className?: string }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className={cx("h-[7px] overflow-hidden rounded-full bg-sand", className)}>
      <div
        className="h-full animate-revealW rounded-full"
        style={{ width: `${w}%`, ["--w" as string]: `${w}%`, background: color }}
      />
    </div>
  );
}
