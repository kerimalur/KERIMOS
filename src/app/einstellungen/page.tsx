import { ladeOberflaeche, AKZENTE } from "@/lib/oberflaeche";
import { oberflaecheSpeichern } from "@/lib/oberflaeche-actions";
import { Button, Card, CardTitle, cx } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Design — die Hausfarbe und der Hintergrund.
 *
 * Bewusst wenig. Jede weitere Stellschraube (Schriftgrösse, Dichte, Radien)
 * ist ein Weg, die Oberfläche in einen Zustand zu bringen, aus dem man ohne
 * Zurücksetzen nicht mehr herausfindet — und dafür ein Gegenwert, den man
 * nach einer Woche nicht mehr bemerkt.
 */
export default async function DesignPage() {
  const { akzent, ambient } = await ladeOberflaeche();

  return (
    <>
      <Card>
        <CardTitle>Hausfarbe</CardTitle>
        <p className="mb-4 max-w-2xl text-sm text-ink-muted">
          Färbt Knöpfe, aktive Reiter, den Schein darunter und die grosse
          Wolke im Hintergrund. Acht geprüfte Töne statt eines freien
          Farbwählers: der Akzent trägt dunklen Text, und ein zu dunkler Ton
          macht Knopfbeschriftungen unlesbar — was einem erst zwei Seiten
          später auffällt.
        </p>

        <form action={oberflaecheSpeichern} className="space-y-5">
          <div className="flex flex-wrap gap-2">
            {AKZENTE.map((a) => (
              <label key={a.wert}
                className={cx(
                  "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2",
                  "transition duration-150 ease-tactile active:scale-95",
                  a.wert === akzent
                    ? "border-line-strong bg-sand"
                    : "border-line/70 bg-card hover:border-line-strong")}>
                <input type="radio" name="akzent" value={a.wert}
                  defaultChecked={a.wert === akzent} className="sr-only" />
                <span className="h-5 w-5 rounded-full" style={{ background: a.wert }} />
                <span className={cx("text-sm",
                  a.wert === akzent ? "font-medium text-ink" : "text-ink-soft")}>
                  {a.name}
                </span>
              </label>
            ))}
          </div>

          <div className="border-t border-line/50 pt-4">
            <label className="flex max-w-2xl cursor-pointer items-start gap-3">
              <input type="checkbox" name="ambient" value="1" defaultChecked={ambient}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--akzent,#E7A96B)]" />
              <span>
                <span className="block text-sm text-ink">Farbnebel im Hintergrund</span>
                <span className="mt-0.5 block text-xs text-ink-muted">
                  Die langsam driftenden Wolken hinter der Oberfläche. Rein
                  dekorativ — auf einem schwachen Gerät kosten sie Bildrate,
                  dann lohnt es sich, sie auszuschalten.
                </span>
              </span>
            </label>
          </div>

          <Button type="submit">Speichern</Button>
        </form>
      </Card>

      <Card>
        <CardTitle>Was hier bewusst fehlt</CardTitle>
        <p className="max-w-2xl text-sm leading-relaxed text-ink-soft">
          Hell/Dunkel gibt es nicht. KerimOS ist auf einen warmen dunklen
          Grund hin gebaut — die Kartenstufen, die Schatten und die
          Textabstufungen sind darauf abgestimmt. Ein heller Modus wäre nicht
          dieselbe Oberfläche in anderen Farben, sondern eine zweite, die
          man doppelt pflegt. Für Papier gibt es stattdessen eine
          Druckansicht: „Als PDF speichern" im Browser stellt auf Schwarz auf
          Weiss um.
        </p>
      </Card>
    </>
  );
}
