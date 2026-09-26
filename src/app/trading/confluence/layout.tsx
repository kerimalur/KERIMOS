/**
 * Monty — Commercials gegen Retail, Saisonalität, Kalibrierung.
 *
 * Seit dem 26.09.2026 ohne Reiterleiste und ohne Eintrag in der Navigation:
 * der Einstieg ist die Gegenprobe auf der Fundamentals-Seite, diese Seite ist
 * die Tiefe dahinter. Das Layout bleibt trotzdem stehen — es hält den Abstand
 * zwischen den Karten und die Rückverbindung nach oben.
 */
import Link from "next/link";

export default function ConfluenceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <Link href="/trading/fundamentals"
        className="text-xs text-accent-soft transition hover:underline">
        ← Fundamentals
      </Link>
      {children}
    </div>
  );
}
