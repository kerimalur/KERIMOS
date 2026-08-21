import Link from "next/link";
import { ladeRueckblick } from "@/lib/supabase/tagesrueckblick-db";
import { Card, CardTitle } from "@/components/ui";
import { heuteISO } from "@/lib/time";
import { addDays } from "@/lib/time";

/**
 * Was du dir gestern Abend für heute vorgenommen hast.
 *
 * Der Morgen-Anstoss schickt das einmal per Telegram. Eine Nachricht um sieben
 * Uhr ist um zehn weggescrollt — deshalb steht dieselbe Zeile hier den ganzen
 * Tag. Das ist der ganze Zweck: ein Vorsatz, den man abends aufschreibt und
 * tagsüber nicht mehr sieht, ist ein Datenbankeintrag und keine Absicht.
 *
 * Gelesen wird das Feld „Was ist morgen das Wichtigste?" von GESTERN. Hat
 * Kerim heute schon einen Rückblick geschrieben, gilt trotzdem der von
 * gestern — der von heute meint ja bereits morgen.
 *
 * Keine Ersatzmeldung, wenn nichts dasteht: die Karte blendet sich aus. Eine
 * Kachel „du hast gestern nichts eingetragen" wäre eine Ermahnung für einen
 * müden Abend, und davon wird der Rückblick nicht zuverlässiger.
 */
export async function HeuteWichtig() {
  const heute = heuteISO();
  const { rueckblick } = await ladeRueckblick(addDays(heute, -1));

  const wichtig = rueckblick?.morgen.trim() ?? "";
  const offen = rueckblick?.liegengeblieben.trim() ?? "";
  if (!wichtig && !offen) return null;

  return (
    <Card>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <CardTitle className="mb-0">Heute das Wichtigste</CardTitle>
        <Link href="/rueckblick/heute" className="text-xs text-accent-soft hover:underline">
          Rückblick ↗
        </Link>
      </div>

      {wichtig && (
        <p className="whitespace-pre-line text-sm leading-relaxed text-ink">{wichtig}</p>
      )}
      {offen && (
        <p className={"whitespace-pre-line text-xs leading-relaxed text-ink-muted "
          + (wichtig ? "mt-2 border-t border-line/50 pt-2" : "")}>
          <span className="text-ink-faint">Gestern liegengeblieben: </span>{offen}
        </p>
      )}
    </Card>
  );
}
