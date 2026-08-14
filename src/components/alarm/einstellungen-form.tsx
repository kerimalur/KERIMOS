"use client";
import { useActionState } from "react";
import { Button, Input, Label, cx } from "@/components/ui";
import {
  speichereAlarmEinstellungen, sendeAlarmTest, pruefeTelegramVerbindung,
} from "@/lib/alarm-actions";
import { LEER, type AktionsErgebnis } from "@/lib/alarm/ergebnis";
import {
  ALARMARTEN, ART_LABEL, ART_BESCHREIBUNG, type AlarmEinstellungen,
} from "@/lib/alarm/regeln";

/**
 * Ein Formular, drei Aktionen.
 *
 * Speichern, Testmeldung und Verbindungsprüfung hängen alle am selben
 * Formular — die Prüfung braucht das Chat-ID-Feld, noch bevor es gespeichert
 * ist. React 19 macht das über `formAction` am Knopf; jede Aktion hat ihren
 * eigenen Zustand, angezeigt wird der zuletzt gelaufene (Zeitstempel).
 */

function Schalter({
  name, checked, titel, hinweis,
}: { name: string; checked: boolean; titel: string; hinweis?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-sand/50 p-3 transition hover:bg-sand">
      <input type="checkbox" name={name} defaultChecked={checked}
        className="mt-0.5 h-4 w-4 shrink-0 accent-accent" />
      <span>
        <span className="block text-sm text-ink">{titel}</span>
        {hinweis && <span className="mt-0.5 block text-xs text-ink-muted">{hinweis}</span>}
      </span>
    </label>
  );
}

function Abschnitt({
  titel, hinweis, children,
}: { titel: string; hinweis?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line/70 pt-5 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-medium text-ink">{titel}</h3>
      {hinweis && <p className="mt-0.5 max-w-2xl text-xs text-ink-muted">{hinweis}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function EinstellungenForm({
  werte, telegramMoeglich,
}: { werte: AlarmEinstellungen; telegramMoeglich: boolean }) {
  const [gespeichert, speichern, speichertGerade] =
    useActionState(speichereAlarmEinstellungen, LEER);
  const [getestet, testen, testetGerade] =
    useActionState(sendeAlarmTest, LEER);
  const [geprueft, pruefen, pruefetGerade] =
    useActionState(pruefeTelegramVerbindung, LEER);

  const laeuft = speichertGerade || testetGerade || pruefetGerade;
  const neueste: AktionsErgebnis = [gespeichert, getestet, geprueft]
    .reduce((a, b) => (b.stempel > a.stempel ? b : a), LEER);

  return (
    <form action={speichern} className="space-y-5">
      <Abschnitt
        titel="Kanäle"
        hinweis="Beide dürfen gleichzeitig an sein — dann kommt jede Meldung doppelt, was bei Treffern gewollt sein kann."
      >
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Schalter name="push_an" checked={werte.push_an}
            titel="Web-Push"
            hinweis="An die auf dieser Seite angemeldeten Geräte. Hängt an der installierten App." />
          <Schalter name="telegram_an" checked={werte.telegram_an}
            titel="Telegram"
            hinweis={telegramMoeglich
              ? "Über denselben Bot wie der GVA-Screener."
              : "Auf dem Server fehlt noch TELEGRAM_BOT_TOKEN."} />
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-2.5">
          <div className="min-w-[16rem] flex-1">
            <Label htmlFor="telegram_chat_id">Chat-ID (leer = TELEGRAM_CHAT_ID vom Server)</Label>
            <Input id="telegram_chat_id" name="telegram_chat_id" inputMode="numeric"
              defaultValue={werte.telegram_chat_id ?? ""} placeholder="z. B. 123456789" />
          </div>
          <Button type="submit" variant="ghost" formAction={pruefen} disabled={laeuft}>
            {pruefetGerade ? "prüfe…" : "Verbindung prüfen"}
          </Button>
        </div>
      </Abschnitt>

      <Abschnitt titel="Welche Alarme" hinweis="Gilt für alle Linien gemeinsam. Was hier aus ist, wird gar nicht erst geprüft.">
        <div className="grid gap-2.5 sm:grid-cols-3">
          {ALARMARTEN.map((art) => (
            <Schalter key={art} name={`art_${art}`} checked={werte.arten.includes(art)}
              titel={ART_LABEL[art]} hinweis={ART_BESCHREIBUNG[art]} />
          ))}
        </div>
      </Abschnitt>

      <Abschnitt
        titel="Paare"
        hinweis="Leer lassen heisst: alle. Sonst nur diese — Linien anderer Paare bleiben still, ohne dass man es merkt."
      >
        <Input name="paare" defaultValue={werte.paare.join(", ")}
          placeholder="leer = alle · sonst z. B. EURUSD, GBPJPY, XAUUSD" />
      </Abschnitt>

      <Abschnitt
        titel="Ruhezeit"
        hinweis="Darf über Mitternacht gehen (22:00–07:00). Beide Felder leer = keine Ruhezeit."
      >
        <div className="flex flex-wrap items-end gap-2.5">
          <div>
            <Label htmlFor="ruhe_von">von</Label>
            <Input id="ruhe_von" name="ruhe_von" type="time"
              defaultValue={werte.ruhe_von ?? ""} className="w-32" />
          </div>
          <div>
            <Label htmlFor="ruhe_bis">bis</Label>
            <Input id="ruhe_bis" name="ruhe_bis" type="time"
              defaultValue={werte.ruhe_bis ?? ""} className="w-32" />
          </div>
        </div>
        <div className="mt-2.5">
          <Schalter name="ruhe_ausser_hit" checked={werte.ruhe_ausser_hit}
            titel="Treffer trotzdem durchlassen"
            hinweis="Der Treffer ist die Meldung, für die man nachts aufwacht. Vorwarnung und Erinnerung bleiben in der Ruhezeit still." />
        </div>
      </Abschnitt>

      <Abschnitt titel="Bremsen" hinweis="Gegen Lärm an Tagen, an denen viele Linien gleichzeitig nah sind.">
        <div className="flex flex-wrap items-end gap-2.5">
          <div>
            <Label htmlFor="max_pro_tag">Höchstens pro Tag (0 = ohne Grenze)</Label>
            <Input id="max_pro_tag" name="max_pro_tag" type="number" min="0" step="1"
              defaultValue={werte.max_pro_tag} className="w-40" />
          </div>
          <div>
            <Label htmlFor="stumm_bis">Alles stumm bis einschliesslich</Label>
            <Input id="stumm_bis" name="stumm_bis" type="date"
              defaultValue={werte.stumm_bis ?? ""} className="w-44" />
          </div>
        </div>
      </Abschnitt>

      <div className="flex flex-wrap items-center gap-2.5 border-t border-line/70 pt-5">
        <Button type="submit" disabled={laeuft}>
          {speichertGerade ? "speichere…" : "Speichern"}
        </Button>
        <Button type="submit" variant="ghost" formAction={testen} disabled={laeuft}>
          {testetGerade ? "sende…" : "Testmeldung senden"}
        </Button>
        <span className="text-xs text-ink-faint">
          Der Test nimmt den <strong>gespeicherten</strong> Stand — Änderungen vorher speichern.
        </span>
      </div>

      {neueste.text && (
        <p className={cx(
          "rounded-xl px-3.5 py-2.5 text-sm",
          neueste.ok ? "bg-good-tint text-good-bright" : "bg-bad-tint text-bad-bright",
        )}>
          {neueste.text}
        </p>
      )}
    </form>
  );
}
