import Link from "next/link";
import { GymTabs } from "@/components/gym-tabs";
import { gymConfigured } from "@/lib/supabase/gym";
import { countGarminVorschau } from "@/lib/supabase/garmin";

/**
 * Rahmen des Gym-Bereichs. Planung und Verwaltung leben ab hier in KerimOS;
 * das eigentliche Training läuft weiterhin in der Gym-App - dort stören
 * Timer und Satz-Erfassung niemanden und ein Deploy hier bringt sie nicht
 * mitten im Training durcheinander.
 */
export default async function GymLayout({ children }: { children: React.ReactNode }) {
  const offeneImporte = gymConfigured() ? await countGarminVorschau() : 0;

  return (
    <div className="py-6">
      <div className="mb-4">
        <Link href="/" className="text-xs text-ink-muted transition hover:text-ink-soft">
          ← Startseite
        </Link>
        <h1 className="font-display mt-1 text-2xl font-bold leading-tight text-ink">Gym</h1>
      </div>

      <GymTabs offeneImporte={offeneImporte} />

      <div className="mt-5 space-y-5">{children}</div>
    </div>
  );
}
