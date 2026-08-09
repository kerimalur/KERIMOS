"use server";
import { revalidatePath } from "next/cache";
import { createTradingClient } from "@/lib/supabase/trading";
import { sendePush } from "@/lib/push";

/** Ein Gerät anmelden. Kommt aus dem Browser, deshalb Werte statt FormData. */
export async function speicherePushAbo(abo: {
  endpoint: string; p256dh: string; auth: string; label?: string;
}): Promise<string> {
  const supabase = createTradingClient();
  if (!supabase) return "Trading-Datenbank nicht verbunden.";

  // Upsert auf endpoint: derselbe Browser liefert bei erneuter Anmeldung
  // denselben endpoint - sonst gäbe es Duplikate und doppelte Alarme.
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert({
      endpoint: abo.endpoint, p256dh: abo.p256dh, auth: abo.auth,
      label: abo.label ?? null,
    }, { onConflict: "endpoint" });

  if (error) return `Anmeldung fehlgeschlagen: ${error.message}`;

  revalidatePath("/trading/alarme");
  return "Gerät angemeldet. Benachrichtigungen sind aktiv.";
}

export async function loeschePushAbo(endpoint: string): Promise<string> {
  const supabase = createTradingClient();
  if (!supabase) return "Trading-Datenbank nicht verbunden.";

  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  revalidatePath("/trading/alarme");
  return "Gerät abgemeldet.";
}

/** Testknopf: schickt sofort eine Benachrichtigung an alle Geräte. */
export async function sendeTestBenachrichtigung(): Promise<string> {
  const ergebnis = await sendePush({
    title: "KerimOS Test",
    body: "Wenn du das auf dem Handy siehst, funktionieren die Alarme.",
    tag: "test",
    url: "/trading/alarme",
  });

  if (ergebnis.gesendet === 0) {
    return `Nichts gesendet. ${ergebnis.fehler.join(" · ") || "Kein Gerät angemeldet."}`;
  }
  const zusatz = ergebnis.entfernt > 0
    ? ` ${ergebnis.entfernt} abgelaufene Anmeldung(en) entfernt.` : "";
  const probleme = ergebnis.fehler.length > 0
    ? ` Probleme: ${ergebnis.fehler.join(" · ")}` : "";

  return `An ${ergebnis.gesendet} Gerät(e) gesendet.${zusatz}${probleme}`;
}
