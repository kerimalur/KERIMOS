import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Noch nicht zugeordnete Ausgaben, gebündelt nach Empfänger.
 *
 * Warum gebündelt: In den Rohdaten stecken über 200 offene Buchungen, aber
 * nur ein paar Dutzend verschiedene Empfänger - "Migros Solothurn" taucht
 * dreissigmal auf, jedes Mal mit anderem Datum im Text. Einzeln zuordnen
 * hiesse dieselbe Entscheidung dreissigmal treffen.
 */

export interface OffeneGruppe {
  /** Normalisierter Empfänger, dient als Anzeige und Gruppenschlüssel. */
  empfaenger: string;
  ids: string[];
  anzahl: number;
  summe: number;
  /** Jüngstes Datum der Gruppe, ISO. */
  zuletzt: string;
  /** Ein Originaltext als Beleg, damit die Zuordnung überprüfbar bleibt. */
  beispiel: string;
}

/**
 * Aus dem Buchungstext den Empfänger herausschälen.
 *
 * Die Raiffeisen-Texte folgen dem Muster
 * "<Vorgang> <Empfänger> <Datum>, <Zeit> <Betrag>". Datum, Zeit, Beträge und
 * Kartennummern sind pro Buchung verschieden und müssen weg, sonst ist jede
 * Buchung ihre eigene Gruppe.
 */
export function empfaengerAus(text: string): string {
  let t = text;

  // Führende Vorgangsart - sie sagt nichts über den Empfänger
  t = t.replace(
    /^(Einkauf|Online Einkauf|Zahlung|Zahlung Ausland|Dauerauftrag|Bancomat Bezug|Lastschrift|Gutschrift|Überweisung|Ueberweisung|E-Banking)\s+/i,
    "",
  );
  t = t.replace(/^TWINT\s+/i, "TWINT ");

  // Datum, Uhrzeit, Währungsbeträge, lange Ziffernfolgen
  t = t.replace(/\d{1,2}\.\d{1,2}\.\d{2,4}/g, " ");
  t = t.replace(/\d{1,2}:\d{2}(:\d{2})?/g, " ");
  t = t.replace(/\b(CHF|EUR|USD)\s*[\d'’.,]+/gi, " ");
  t = t.replace(/\b\d[\d'’.,]{2,}\b/g, " ");
  t = t.replace(/[,;]+/g, " ");
  t = t.replace(/\s{2,}/g, " ").trim();

  // Sehr lange Reste kürzen - der Anfang trägt die Information
  if (t.length > 38) t = t.slice(0, 38).trim();
  return t || "Ohne Bezeichnung";
}

export async function fetchOffeneGruppen(): Promise<OffeneGruppe[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("transactions")
    .select("id, description, amount, occurred_on")
    .is("category_id", null)
    .eq("is_transfer", false)
    .lt("amount", 0)
    .order("occurred_on", { ascending: false })
    .limit(1000);

  if (error) return [];

  const gruppen = new Map<string, OffeneGruppe>();

  for (const t of data ?? []) {
    const text = String(t.description ?? "");
    const key = empfaengerAus(text).toLowerCase();

    const vorhanden = gruppen.get(key);
    if (vorhanden) {
      vorhanden.ids.push(t.id as string);
      vorhanden.anzahl += 1;
      vorhanden.summe += Math.abs(Number(t.amount));
      if (String(t.occurred_on) > vorhanden.zuletzt) {
        vorhanden.zuletzt = String(t.occurred_on);
      }
    } else {
      gruppen.set(key, {
        empfaenger: empfaengerAus(text),
        ids: [t.id as string],
        anzahl: 1,
        summe: Math.abs(Number(t.amount)),
        zuletzt: String(t.occurred_on),
        beispiel: text,
      });
    }
  }

  // Grösste Summe zuerst: dort bringt die Zuordnung am meisten.
  return [...gruppen.values()].sort((a, b) => b.summe - a.summe);
}
