import Link from "next/link";
import { EinstellungenTabs } from "@/components/einstellungen-tabs";

/**
 * Rahmen der Einstellungen. Ein Ort für alles, was man einmal einrichtet —
 * siehe components/einstellungen-tabs.tsx für die Begründung.
 */
export default function EinstellungenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="py-6">
      <div className="mb-4">
        <Link href="/" className="text-xs text-ink-muted transition hover:text-ink-soft">
          ← Startseite
        </Link>
        <h1 className="font-display mt-1 text-2xl font-bold leading-tight text-ink">
          Einstellungen
        </h1>
      </div>

      <EinstellungenTabs />

      <div className="mt-5 space-y-5">{children}</div>
    </div>
  );
}
