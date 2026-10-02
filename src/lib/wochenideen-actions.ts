"use server";

import { revalidatePath } from "next/cache";
import { createTradingClient } from "@/lib/supabase/trading";
import { tradingUserId } from "@/lib/trading/journal";
import { erstelleWochenideen, werteWochenideenAus } from "@/lib/makro/wochenideen";
import { rechneZurueck } from "@/lib/makro/rueckrechnung";

/**
 * Schreibzugriffe der Wochenaussicht (29.09.2026): Kerims Einschätzung zu
 * einer Idee, und „jetzt anlegen", falls der Montagslauf noch nicht war.
 */

const EINSCHAETZUNGEN = ["zustimmen", "zweifel", "dagegen"];

export async function einschaetzungSpeichern(fd: FormData): Promise<void> {
  if (!(await tradingUserId())) return;
  const db = createTradingClient();
  if (!db) return;
  const id = String(fd.get("id") ?? "");
  const e = String(fd.get("einschaetzung") ?? "");
  const notiz = String(fd.get("notiz") ?? "").trim().slice(0, 1000);
  if (!id) return;
  await db.from("makro_wochenideen").update({
    einschaetzung: EINSCHAETZUNGEN.includes(e) ? e : null,
    notiz: notiz || null,
  }).eq("id", id);
  revalidatePath("/trading/fundamentals/wochenideen");
}

export async function wochenideenJetzt(): Promise<void> {
  if (!(await tradingUserId())) return;
  await erstelleWochenideen();
  await werteWochenideenAus();
  revalidatePath("/trading/fundamentals/wochenideen");
}

/** Rückrechnung (Backtest des Makro-Modells) sofort neu rechnen — dauert bis zu einige Minuten. */
export async function rueckrechnungJetzt(): Promise<void> {
  if (!(await tradingUserId())) return;
  await rechneZurueck();
  revalidatePath("/trading/fundamentals/rueckrechnung");
  revalidatePath("/trading/fundamentals/wochenideen");
}

/** Varianten-Vergleich des Makro-Modells neu rechnen (Makro-Backtest). */
export async function variantenJetzt(): Promise<void> {
  if (!(await tradingUserId())) return;
  const { rechneVarianten } = await import("@/lib/makro/varianten");
  await rechneVarianten();
  revalidatePath("/trading/fundamentals/rueckrechnung");
}
