"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { addShoppingItem, deleteShoppingItem, toggleShoppingItem } from "@/lib/actions";
import { Button, Card, Input, cx } from "@/components/ui";
import type { ShoppingItem } from "@/lib/supabase/menu";

/** Einkaufsliste der Menü-App: sehen, abhaken, ergänzen — direkt aus KerimOS. */
export function ShoppingList({ items }: { items: ShoppingItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [neu, setNeu] = useState("");
  const [menge, setMenge] = useState("");

  const offen = items.filter((i) => !i.checked);
  const erledigt = items.filter((i) => i.checked);

  async function run(action: (fd: FormData) => Promise<void>, fd: FormData) {
    if (busy) return;
    setBusy(true);
    await action(fd);
    setBusy(false);
    router.refresh();
  }

  function toggle(i: ShoppingItem) {
    const fd = new FormData();
    fd.set("id", i.id);
    fd.set("checked", String(!i.checked));
    void run(toggleShoppingItem, fd);
  }

  function hinzufuegen() {
    if (!neu.trim()) return;
    const fd = new FormData();
    fd.set("item", neu.trim());
    fd.set("quantity", menge.trim());
    setNeu(""); setMenge("");
    void run(addShoppingItem, fd);
  }

  function loeschen(id: string) {
    const fd = new FormData();
    fd.set("id", id);
    void run(deleteShoppingItem, fd);
  }

  const zeile = (i: ShoppingItem) => (
    <li key={i.id} className="flex items-center gap-2.5 py-1.5">
      <button onClick={() => toggle(i)} disabled={busy}
        aria-label={i.checked ? "Als offen markieren" : "Abhaken"}
        className={cx(
          "grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[11px] transition",
          i.checked
            ? "border-good bg-good-tint text-good"
            : "border-line bg-field text-transparent hover:border-line-strong"
        )}>
        ✓
      </button>
      <span className={cx("min-w-0 flex-1 truncate text-sm",
        i.checked ? "text-ink-faint line-through" : "text-ink")}>
        {i.item}
      </span>
      {i.quantity && (
        <span className="shrink-0 text-xs text-ink-muted">{i.quantity}</span>
      )}
      <button onClick={() => loeschen(i.id)} disabled={busy} aria-label="Löschen"
        className="shrink-0 px-1 text-sm text-ink-faint transition hover:text-bad">
        ✕
      </button>
    </li>
  );

  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
          Einkaufsliste
        </span>
        {offen.length > 0 && (
          <span className="text-xs text-ink-muted">{offen.length} offen</span>
        )}
      </div>

      {/* Artikelfeld auf eigener Zeile in voller Breite. Vorher teilten sich
          Artikel, Menge und Button eine Zeile — auf dem Handy blieben für den
          Artikelnamen keine 150 px und das Getippte war nicht lesbar.
          text-base (16 px) verhindert zusätzlich den Auto-Zoom von iOS Safari. */}
      <div className="mb-3 flex flex-col gap-2">
        <Input value={neu} onChange={(e) => setNeu(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && hinzufuegen()}
          placeholder="Was fehlt?" autoComplete="off"
          className="w-full text-base" />
        <div className="flex items-center gap-2">
          <Input value={menge} onChange={(e) => setMenge(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && hinzufuegen()}
            placeholder="Menge (z.B. 500 g)" autoComplete="off"
            className="min-w-0 flex-1 text-base" />
          <Button onClick={hinzufuegen} disabled={busy || !neu.trim()}
            className="shrink-0 px-3.5 py-2 text-sm">
            +
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-ink-muted">Liste ist leer.</p>
      ) : (
        <>
          <ul className="divide-y divide-line/60">{offen.map(zeile)}</ul>
          {erledigt.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-ink-faint transition hover:text-ink-muted">
                {erledigt.length} erledigt
              </summary>
              <ul className="mt-1 divide-y divide-line/60">{erledigt.map(zeile)}</ul>
            </details>
          )}
        </>
      )}
    </Card>
  );
}
