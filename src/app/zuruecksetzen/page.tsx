import Link from "next/link";
import { getDataCounts } from "@/lib/actions";
import { ResetPanel } from "@/components/reset-panel";

export const dynamic = "force-dynamic";

export default async function ZuruecksetzenPage() {
  const counts = await getDataCounts();

  return (
    <div className="space-y-5 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium text-ink">Zurücksetzen</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Geld und Zeit werden strikt getrennt gelöscht — eine Aktion auf der einen
            Seite rührt die andere nie an. Was du hier löschst, ist endgültig weg;
            es gibt keinen Papierkorb.
          </p>
        </div>
        <Link href="/" className="text-sm text-accent-soft transition hover:underline">
          ← Zur Startseite
        </Link>
      </div>

      <ResetPanel counts={counts} />

      <p className="text-xs text-ink-muted">
        Deine Kacheln auf der Startseite und dein Konto bleiben in jedem Fall bestehen.
      </p>
    </div>
  );
}
