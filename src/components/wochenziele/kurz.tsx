import Link from "next/link";
import { cx } from "@/components/ui";
import type { Wochenziel } from "@/lib/wochenziele/typen";

/**
 * Die Wochenziele auf der Startseite: nur die Titel, dringende zuerst,
 * Fertiges durchgestrichen. Bearbeitet wird im Tab.
 */
export function WochenzieleKurz({ ziele }: { ziele: Wochenziel[] }) {
  const fertig = ziele.filter((z) => z.status === "fertig").length;
  const reihe = [
    ...ziele.filter((z) => z.status !== "fertig"),
    ...ziele.filter((z) => z.status === "fertig"),
  ];

  return (
    <div>
      <Link href="/wochenziele"
        className="mb-1.5 flex items-baseline justify-between text-[11px] font-medium uppercase
                   tracking-[0.12em] text-ink-muted hover:text-ink-soft">
        <span>Wochenziele →</span>
        {ziele.length > 0 && <span className="tabular normal-case tracking-normal">{fertig}/{ziele.length}</span>}
      </Link>
      {ziele.length === 0 ? (
        <Link href="/wochenziele" className="text-sm text-accent-soft hover:underline">
          Noch keine Ziele für diese Woche — jetzt festlegen
        </Link>
      ) : (
        <ul className="space-y-1">
          {reihe.map((z) => (
            <li key={z.id} className="flex items-start gap-2 text-sm">
              <span className={cx("mt-[7px] h-2 w-2 shrink-0 rounded-full",
                z.status === "fertig" ? "bg-good" : z.status === "angefangen" ? "bg-accent" : "border border-ink-faint")} />
              <span className={cx("min-w-0 flex-1",
                z.status === "fertig" ? "text-ink-faint line-through" : "text-ink-soft")}>
                {z.titel}
              </span>
              {z.dringend && z.status !== "fertig" && (
                <span className="shrink-0 rounded bg-bad-tint px-1 text-[10px] font-semibold uppercase text-bad-bright">
                  dringend
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
