"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Select, Input, Button, cx } from "@/components/ui";
import type { Account, Category } from "@/lib/types";

export function TxnFilter({
  accounts, categories, months, heute,
}: {
  accounts: Account[];
  categories: Category[];
  months: string[];
  /** Heutiges Datum (ISO, Zürcher Zeit) - Grundlage der Zeitraum-Presets. */
  heute: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const get = (k: string) => params.get(k) ?? "";

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    // Monat und freier Zeitraum schliessen sich aus - sonst würde der eine
    // still den anderen überstimmen, ohne dass in der UI sichtbar wäre, wer
    // gewonnen hat.
    if (key === "monat" && value) { next.delete("von"); next.delete("bis"); }
    if ((key === "von" || key === "bis") && value) next.delete("monat");
    next.delete("seite");
    router.push(`/transaktionen?${next.toString()}`);
  }

  function setRange(von: string | null, bis: string | null) {
    const next = new URLSearchParams(params.toString());
    next.delete("monat");
    next.delete("seite");
    if (von) next.set("von", von); else next.delete("von");
    if (bis) next.set("bis", bis); else next.delete("bis");
    router.push(`/transaktionen?${next.toString()}`);
  }

  function onSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = new FormData(e.currentTarget).get("q");
    update("q", String(value ?? ""));
  }

  const jahresanfang = `${heute.slice(0, 4)}-01-01`;
  const monatsanfang = `${heute.slice(0, 7)}-01`;
  const vorjahr = String(Number(heute.slice(0, 4)) - 1);

  const istJahrBisHeute = get("von") === jahresanfang && get("bis") === heute;
  const istDieserMonat = get("von") === monatsanfang && get("bis") === heute;
  const istLetztesJahr = get("von") === `${vorjahr}-01-01` && get("bis") === `${vorjahr}-12-31`;
  const istAlle = !get("monat") && !get("von") && !get("bis");

  const active = ["konto", "monat", "von", "bis", "kategorie", "art", "q"].some((k) => get(k));

  const presetClass = (istAktiv: boolean) =>
    cx(
      "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition",
      istAktiv
        ? "border-accent/60 bg-accent-tint text-accent-soft"
        : "border-line bg-field text-ink-muted hover:border-line-strong hover:text-ink-soft",
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={presetClass(istAlle)}
          onClick={() => setRange(null, null)}>
          Alle Zeit
        </button>
        <button type="button" className={presetClass(istDieserMonat)}
          onClick={() => setRange(monatsanfang, heute)}>
          Dieser Monat
        </button>
        <button type="button" className={presetClass(istJahrBisHeute)}
          onClick={() => setRange(jahresanfang, heute)}>
          Jahr bis heute
        </button>
        <button type="button" className={presetClass(istLetztesJahr)}
          onClick={() => setRange(`${vorjahr}-01-01`, `${vorjahr}-12-31`)}>
          {vorjahr}
        </button>
        <span className="mx-1 text-xs text-ink-faint">oder</span>
        <Input type="date" value={get("von")} onChange={(e) => update("von", e.target.value)}
          className="w-36" aria-label="Von" />
        <span className="text-xs text-ink-faint">bis</span>
        <Input type="date" value={get("bis")} onChange={(e) => update("bis", e.target.value)}
          className="w-36" aria-label="Bis" />
      </div>

      <div className="flex flex-wrap items-end gap-2">
      <form onSubmit={onSearch} className="flex items-end gap-2">
        <Input name="q" defaultValue={get("q")} placeholder="Suchen…"
          className="w-44" aria-label="Buchungen durchsuchen" />
        <Button variant="ghost" type="submit">Suchen</Button>
      </form>

      <Select value={get("konto")} onChange={(e) => update("konto", e.target.value)}
        className="w-40" aria-label="Konto">
        <option value="">Alle Konten</option>
        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        <option value="ohne">Ohne Konto</option>
      </Select>

      <Select value={get("monat")} onChange={(e) => update("monat", e.target.value)}
        className="w-36" aria-label="Bestimmter Monat">
        <option value="">Bestimmter Monat…</option>
        {months.map((m) => (
          <option key={m} value={m}>
            {new Date(m + "-01T12:00:00").toLocaleDateString("de-CH",
              { month: "long", year: "numeric" })}
          </option>
        ))}
      </Select>

      <Select value={get("kategorie")} onChange={(e) => update("kategorie", e.target.value)}
        className="w-44" aria-label="Kategorie">
        <option value="">Alle Kategorien</option>
        <option value="ohne">Ohne Kategorie</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({c.kind === "income" ? "Ein" : "Aus"})
          </option>
        ))}
      </Select>

      <Select value={get("art")} onChange={(e) => update("art", e.target.value)}
        className="w-40" aria-label="Art">
        <option value="">Alle Arten</option>
        <option value="ausgaben">Nur Ausgaben</option>
        <option value="einnahmen">Nur Einnahmen</option>
        <option value="umbuchung">Nur Umbuchungen</option>
        <option value="echt">Ohne Umbuchungen</option>
      </Select>

      {active && (
        <button onClick={() => router.push("/transaktionen")}
          className={cx("px-1 text-xs text-ink-muted transition hover:text-ink-soft")}>
          Filter zurücksetzen
        </button>
      )}
      </div>
    </div>
  );
}
