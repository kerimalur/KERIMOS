import { screenshotHochladen, screenshotEntfernen } from "@/lib/journal-actions";
import { MAX_BILDER } from "@/lib/trading/screenshots";
import { Label } from "@/components/ui";

/**
 * Bilder an einem Trade — nur beim Bearbeiten.
 *
 * Beim Anlegen gibt es den Trade noch nicht, an den das Bild gehängt würde.
 * Erst speichern, dann Bilder: das ist eine Reihenfolge, keine Einschränkung
 * — und ehrlicher als ein Feld, das beim Neuanlegen stillschweigend nichts tut.
 *
 * Eigene Formulare je Bild und fürs Hochladen, kein Client-JavaScript. Das
 * hier passiert am Abend nach dem Trade, und was dann nicht sofort reagiert,
 * passiert nicht.
 */
export function ScreenshotFeld({ tradeId, bilder, fehler }: {
  tradeId: string;
  bilder: string[];
  fehler?: string | null;
}) {
  const voll = bilder.length >= MAX_BILDER;

  return (
    <div className="w-full border-t border-line/70 pt-4">
      <Label htmlFor="tf-bild">Screenshots</Label>

      {fehler && (
        <p className="mt-1 mb-2 rounded-xl border border-bad/40 bg-bad-tint px-3 py-2
                      text-xs text-ink-soft">
          <strong className="text-bad-bright">Nicht hochgeladen.</strong> {fehler}
        </p>
      )}

      {bilder.length > 0 && (
        <ul className="mb-2.5 flex flex-wrap gap-2">
          {bilder.map((url) => (
            <li key={url} className="relative">
              <a href={url} target="_blank" rel="noopener noreferrer"
                title="im neuen Tab öffnen">
                {/* Bewusst ein <img>: die Bilder liegen auf einer fremden
                    Domain (Supabase-Storage), und Next/Image bräuchte dafür
                    einen Eintrag in der Konfiguration je Projekt. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="Screenshot zum Trade"
                  className="h-20 w-32 rounded-lg border border-line object-cover
                             transition hover:border-line-strong" />
              </a>
              <form action={screenshotEntfernen} className="absolute -right-1.5 -top-1.5">
                <input type="hidden" name="tradeId" value={tradeId} />
                <input type="hidden" name="url" value={url} />
                <button title="Bild entfernen"
                  className="grid h-5 w-5 place-items-center rounded-full border border-line-strong
                             bg-card text-[10px] text-ink-faint transition hover:text-bad">
                  ✕
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {voll ? (
        <p className="text-xs text-ink-muted">
          {MAX_BILDER} Bilder sind das Maximum. Nimm eines weg, wenn du ein
          anderes brauchst.
        </p>
      ) : (
        <form action={screenshotHochladen} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="tradeId" value={tradeId} />
          <input id="tf-bild" type="file" name="datei" accept="image/*" required
            className="max-w-full text-xs text-ink-muted
                       file:mr-2.5 file:rounded-lg file:border file:border-line
                       file:bg-sand file:px-3 file:py-1.5 file:text-xs file:text-ink-soft" />
          <button className="rounded-lg border border-line px-3 py-1.5 text-xs
                             text-ink-soft transition hover:border-line-strong">
            Hochladen
          </button>
        </form>
      )}

      <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
        PNG, JPEG, WebP oder GIF, bis 8 MB, höchstens {MAX_BILDER} je Trade.
        Die Bilder liegen öffentlich lesbar unter einer nicht erratbaren
        Adresse — wer den Link hat, sieht sie. Für Charts ist das die richtige
        Abwägung; nichts hineinlegen, was das nicht verträgt.
      </p>
    </div>
  );
}
