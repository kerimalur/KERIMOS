"use server";
import { revalidatePath } from "next/cache";

/**
 * Ein getroffenes Paar im Screener abhaken.
 *
 * Der Screener hält einen Treffer „sticky": einmal getroffen bleibt das Paar
 * auf HIT, bis jemand entscheidet. Genau dafür gibt es im Render-Backend
 * `/api/mark` mit zwei Aktionen:
 *
 *   pending  Setup läuft noch — das Paar bleibt auf der Beobachtung.
 *   done     Setup fertig — die Linie gilt als verbraucht, der Screener
 *            sucht ab sofort die nächste.
 *
 * Bewusst über das Backend statt über eine eigene Tabelle in KerimOS: sonst
 * hätte man zwei Wahrheiten, und der Screener würde weiter HIT melden,
 * während KerimOS das Paar für erledigt hält.
 */

function basis(): string {
  return (process.env.GVA_API_URL ?? "https://gva-screener.onrender.com")
    .replace(/\/+$/, "");
}

export async function gvaMarkieren(fd: FormData): Promise<void> {
  const pair = String(fd.get("pair") ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  const aktion = String(fd.get("aktion") ?? "");
  if (!pair || (aktion !== "pending" && aktion !== "done")) return;

  try {
    // 8 Sekunden: das Backend auf Render schläft nach Inaktivität ein und
    // braucht beim Aufwachen bis zu einer Minute. Länger warten würde die
    // Seite blockieren; der nächste Klick trifft ein waches Backend.
    await fetch(`${basis()}/api/mark`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pair, action: aktion }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
  } catch {
    // Still: /api/mark ist idempotent und meldet auch bei einem bereits
    // gelösten Paar Erfolg. Ein fehlgeschlagener Aufruf heisst hier nur,
    // dass der Treffer beim nächsten Laden noch dasteht — kein Datenverlust.
  }

  revalidatePath("/trading/radar");
  revalidatePath("/trading/cockpit");
  revalidatePath("/trading/cockpit/board");
}
