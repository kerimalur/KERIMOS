import "server-only";
import { sendePush } from "@/lib/push";
import { sendeTelegram, chatIdFuer, basisUrl } from "./kanaele";
import { pruefe, type AlarmEinstellungen, type Lage } from "./regeln";
import {
  baueTelegramText, fasseZusammen,
  type Meldung, type VersandErgebnis,
} from "./text";

/**
 * Eine Meldung, zwei Kanäle, eine Entscheidung.
 *
 * Vorher entschied `api/gva-alarm` selbst, was rausgeht, und rief `sendePush`
 * direkt auf. Damit gab es keine Stelle, an der man einen Kanal dazunehmen
 * oder eine Ruhezeit einbauen konnte, ohne die Alarmlogik anzufassen. Hier
 * ist diese Stelle: `regeln.ts` sagt ob, `text.ts` sagt wie es aussieht,
 * diese Datei bringt es weg.
 */

export type { Meldung, VersandErgebnis } from "./text";
export { irgendwoAngekommen, baueTelegramText, fasseZusammen } from "./text";

export async function verschicke(
  m: Meldung, einst: AlarmEinstellungen, lage: Omit<Lage, "art" | "pair">,
): Promise<VersandErgebnis> {
  const ergebnis: VersandErgebnis = {
    unterdrueckt: null,
    push: { versucht: false, gesendet: 0, entfernt: 0, fehler: [] },
    telegram: { versucht: false, ok: false, fehler: null },
    zeile: "",
  };

  const urteil = pruefe(einst, { ...lage, art: m.art, pair: m.pair });
  if (!urteil.erlaubt) {
    ergebnis.unterdrueckt = urteil.grund;
    ergebnis.zeile = fasseZusammen(m, ergebnis);
    return ergebnis;
  }

  // Beide Kanäle gleichzeitig: sie sind voneinander unabhängig, und ein
  // langsamer Push-Dienst soll die Telegram-Meldung nicht verzögern.
  const aufgaben: Promise<void>[] = [];

  if (einst.push_an) {
    ergebnis.push.versucht = true;
    aufgaben.push((async () => {
      const p = await sendePush({
        title: m.titel,
        body: m.text,
        tag: m.tag,
        url: m.url ?? "/trading",
        requireInteraction: m.wichtig,
      });
      ergebnis.push.gesendet = p.gesendet;
      ergebnis.push.entfernt = p.entfernt;
      ergebnis.push.fehler = p.fehler;
    })());
  }

  if (einst.telegram_an) {
    ergebnis.telegram.versucht = true;
    aufgaben.push((async () => {
      const t = await sendeTelegram(
        baueTelegramText(m, basisUrl()),
        chatIdFuer(einst.telegram_chat_id),
      );
      ergebnis.telegram.ok = t.ok;
      ergebnis.telegram.fehler = t.fehler;
    })());
  }

  await Promise.all(aufgaben);
  ergebnis.zeile = fasseZusammen(m, ergebnis);
  return ergebnis;
}
