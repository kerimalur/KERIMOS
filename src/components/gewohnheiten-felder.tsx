import { Input, Label, Select } from "@/components/ui";

/**
 * Die Felder einer Gewohnheit — einmal geschrieben, zweimal benutzt.
 *
 * Anlegen und Ändern müssen dieselben Felder haben, sonst kann man beim
 * Anlegen etwas nicht setzen, das man danach nur über den Umweg „anlegen,
 * dann ändern" erreicht. Genau so entstehen Formulare, die auseinanderlaufen.
 *
 * @param suffix Macht die `id`-Attribute eindeutig — auf der Seite stehen
 *   mehrere dieser Formulare untereinander, und doppelte `id` bricht die
 *   Verbindung zwischen Beschriftung und Feld.
 */
export function GewohnheitenFelder({
  h, suffix,
}: {
  h: {
    name: string; icon: string | null; zielProWoche: number; bereich: string;
    varianten: string[]; mitDatum: boolean; farbe: string;
  } | null;
  suffix: string;
}) {
  const id = (feld: string) => `${feld}-${suffix}`;

  return (
    <>
      <div>
        <Label htmlFor={id("name")}>Name</Label>
        <Input id={id("name")} name="name" required defaultValue={h?.name}
          placeholder="Lesen" className="w-40" />
      </div>
      <div>
        <Label htmlFor={id("icon")}>Zeichen</Label>
        <Input id={id("icon")} name="icon" maxLength={2} defaultValue={h?.icon ?? ""}
          placeholder="📖" className="w-16" />
      </div>
      <div>
        <Label htmlFor={id("ziel")}>Ziel / Woche</Label>
        <Select id={id("ziel")} name="ziel_pro_woche"
          defaultValue={String(h?.zielProWoche ?? 0)} className="w-28">
          <option value="0">kein Ziel</option>
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <option key={n} value={n}>{n}×</option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor={id("bereich")}>Steht bei</Label>
        <Select id={id("bereich")} name="bereich" defaultValue={h?.bereich ?? "allgemein"}
          className="w-32">
          <option value="allgemein">Startseite</option>
          <option value="gym">Gym</option>
        </Select>
      </div>
      <div>
        <Label htmlFor={id("mit_datum")}>Eintragen</Label>
        <Select id={id("mit_datum")} name="mit_datum"
          defaultValue={h?.mitDatum ? "1" : "0"} className="w-36">
          <option value="0">ein Druck = heute</option>
          <option value="1">mit Datum fragen</option>
        </Select>
      </div>
      <div>
        <Label htmlFor={id("varianten")}>Varianten</Label>
        <Input id={id("varianten")} name="varianten"
          defaultValue={h?.varianten.join(", ") ?? ""}
          placeholder="Push, Pull, Ausdauer" className="w-52" />
      </div>
      <div>
        <Label htmlFor={id("farbe")}>Farbe</Label>
        <Input id={id("farbe")} name="color" type="color"
          defaultValue={h?.farbe ?? "#9A8C74"} className="h-9 w-14 p-1" />
      </div>
    </>
  );
}
