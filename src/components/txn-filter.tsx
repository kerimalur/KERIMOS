"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Select, Input, Button, cx } from "@/components/ui";
import type { Account, Category } from "@/lib/types";

export function TxnFilter({
  accounts, categories, months,
}: {
  accounts: Account[];
  categories: Category[];
  months: string[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const get = (k: string) => params.get(k) ?? "";

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    next.delete("seite");
    router.push(`/transaktionen?${next.toString()}`);
  }

  function onSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = new FormData(e.currentTarget).get("q");
    update("q", String(value ?? ""));
  }

  const active = ["konto", "monat", "kategorie", "art", "q"].some((k) => get(k));

  return (
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
        className="w-36" aria-label="Monat">
        <option value="">Alle Monate</option>
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
  );
}
