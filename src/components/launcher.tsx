"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  registerLinkOpen, reorderLinks, startFocus, startFocusForActivity,
} from "@/lib/actions";
import { cx } from "@/components/ui";
import { TileCard } from "@/components/tile-card";
import type { NavLink } from "@/lib/types";

import { MODE_ORDER as GROUP_ORDER } from "@/lib/modes";

export function Launcher({ links }: { links: NavLink[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [arranging, setArranging] = useState(false);
  const [order, setOrder] = useState<NavLink[]>(links);
  const [dragged, setDragged] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Vor dem Öffnen fragen, ob eine Fokus-Sitzung mitlaufen soll
  const [pendingLink, setPendingLink] = useState<NavLink | null>(null);

  // Nach dem Neuladen der Serverdaten die lokale Reihenfolge übernehmen
  const source = arranging ? order : links;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return source;
    return source.filter((l) =>
      `${l.title} ${l.subtitle ?? ""} ${l.group_name} ${l.target}`.toLowerCase().includes(q)
    );
  }, [source, query]);

  const recent = useMemo(
    () => [...links]
      .filter((l) => l.last_opened_at)
      .sort((a, b) => (b.last_opened_at ?? "").localeCompare(a.last_opened_at ?? ""))
      .slice(0, 5),
    [links]
  );

  const groups = useMemo(() => {
    const map = new Map<string, NavLink[]>();
    for (const l of filtered) {
      const list = map.get(l.group_name) ?? [];
      list.push(l);
      map.set(l.group_name, list);
    }
    const known = [...map.keys()];
    for (const g of GROUP_ORDER) if (!map.has(g) && arranging) map.set(g, []);
    return [...map.entries()].sort(
      (a, b) =>
        ((GROUP_ORDER.indexOf(a[0]) + 1) || 99) - ((GROUP_ORDER.indexOf(b[0]) + 1) || 99) ||
        a[0].localeCompare(b[0])
    );
    void known;
  }, [filtered, arranging]);

  function open(link: NavLink) {
    if (arranging) return;

    if (link.kind === "folder") {
      void registerLinkOpen(link.id);
      // Ordner: erst den kerimos://-Handler versuchen (öffnet den Explorer
      // direkt, wenn er per tools/kerimos-protokoll installiert ist). Der Pfad
      // landet zusätzlich in der Zwischenablage - als Fallback ohne Handler.
      window.location.href = `kerimos://open?path=${encodeURIComponent(link.target)}`;
      navigator.clipboard.writeText(link.target).then(
        () => { setCopied(link.id); setTimeout(() => setCopied(null), 2200); },
        () => setCopied(null)
      );
      return;
    }

    // Web und Bereiche: zuerst fragen, ob die Zeit mitlaufen soll
    setPendingLink(link);
  }

  function proceed(mitFokus: boolean) {
    const link = pendingLink;
    if (!link) return;
    setPendingLink(null);
    void registerLinkOpen(link.id);

    // Web-Ziele synchron öffnen - nach einem await blockt der Popup-Schutz
    if (link.kind === "web") {
      window.open(link.target, "_blank", "noopener,noreferrer");
    }

    if (mitFokus) {
      void (async () => {
        if (link.track_time) {
          await startFocus(link.id);
        } else {
          const fd = new FormData();
          fd.set("link_ids", link.id);
          await startFocusForActivity(fd);
        }
        router.refresh();
      })();
    }

    if (link.kind === "section") router.push(link.target);
  }

  /* ---------------- Anordnen ---------------- */

  function startArranging() {
    setOrder(links);
    setQuery("");
    setArranging(true);
  }

  function move(targetId: string | null, targetGroup: string) {
    if (!dragged || dragged === targetId) return;
    setOrder((current) => {
      const list = [...current];
      const from = list.findIndex((l) => l.id === dragged);
      if (from === -1) return current;
      const [item] = list.splice(from, 1);
      const moved = { ...item, group_name: targetGroup };
      const to = targetId ? list.findIndex((l) => l.id === targetId) : -1;
      if (to === -1) list.push(moved); else list.splice(to, 0, moved);
      return list;
    });
  }

  async function save() {
    setSaving(true);
    // In Gruppenreihenfolge sortieren, damit die Zählung je Gruppe stimmt
    const sorted = groups.flatMap(([group]) =>
      order.filter((l) => l.group_name === group)
    );
    await reorderLinks(sorted.map((l) => ({ id: l.id, group_name: l.group_name })));
    setSaving(false);
    setArranging(false);
    router.refresh();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && filtered[cursor]) { e.preventDefault(); open(filtered[cursor]); return; }
    if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
      e.preventDefault(); setCursor((c) => Math.min(c + 1, filtered.length - 1)); return;
    }
    if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
      e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); return;
    }
    if (e.key === "Escape") { setQuery(""); setCursor(0); }
  }

  const indexOf = (link: NavLink) => filtered.findIndex((l) => l.id === link.id);

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setCursor(0); }}
          onKeyDown={onKeyDown}
          placeholder={arranging ? "Beim Anordnen ausgeschaltet" : "Tippen zum Suchen, Enter öffnet"}
          disabled={arranging}
          autoFocus={!arranging}
          className="min-w-56 flex-1 rounded-2xl border border-line bg-card px-5 py-3.5 text-base text-ink
                     placeholder:text-ink-faint outline-none transition disabled:opacity-50
                     focus:border-accent focus:ring-2 focus:ring-accent/15"
        />
        {arranging ? (
          <div className="flex items-center gap-2">
            <button onClick={save} disabled={saving}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-soft disabled:opacity-50">
              {saving ? "Speichere…" : "Fertig"}
            </button>
            <button onClick={() => setArranging(false)}
              className="rounded-xl border border-line px-4 py-2 text-sm text-ink-soft transition hover:border-line-strong">
              Abbrechen
            </button>
          </div>
        ) : (
          <button onClick={startArranging}
            className="rounded-xl border border-line px-4 py-2 text-sm text-ink-soft transition hover:border-line-strong">
            Anordnen
          </button>
        )}
      </div>

      {arranging && (
        <p className="rounded-xl bg-accent-tint px-4 py-2.5 text-sm text-accent-soft">
          Kacheln ziehen und fallen lassen — auch in eine andere Gruppe. „Fertig“ speichert.
        </p>
      )}

      {pendingLink && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-accent bg-accent-tint px-4 py-3">
          <span className="text-sm text-ink">
            <span className="font-medium">{pendingLink.title}</span> öffnen — Fokus starten?
          </span>
          <span className="ml-auto flex items-center gap-2">
            <button onClick={() => proceed(true)}
              className="rounded-xl bg-accent px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-accent-soft">
              Mit Fokus
            </button>
            <button onClick={() => proceed(false)}
              className="rounded-xl border border-line bg-card px-3.5 py-1.5 text-sm text-ink-soft transition hover:border-line-strong">
              Nur öffnen
            </button>
            <button onClick={() => setPendingLink(null)}
              className="px-1 text-xs text-ink-muted transition hover:text-ink-soft">
              Abbrechen
            </button>
          </span>
        </div>
      )}

      {!query && !arranging && recent.length > 0 && (
        <section>
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            Zuletzt benutzt
          </h2>
          <div className="flex flex-wrap gap-2">
            {recent.map((l) => (
              <button key={l.id} onClick={() => open(l)}
                className="flex items-center gap-2 rounded-xl border border-line bg-card py-1.5 pl-1.5 pr-3 text-sm text-ink-soft transition hover:border-line-strong hover:text-ink">
                {l.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.image_url} alt="" style={{ objectPosition: l.image_position }}
                    className="h-6 w-6 rounded-lg object-cover" />
                ) : (
                  <span className="grid h-6 w-6 place-items-center rounded-lg text-xs"
                    style={{ background: l.color + "22", color: l.color }}>
                    {l.icon ?? l.title.slice(0, 1)}
                  </span>
                )}
                {l.title}
              </button>
            ))}
          </div>
        </section>
      )}

      {groups.map(([group, items]) => (
        <section key={group}
          onDragOver={(e) => arranging && e.preventDefault()}
          onDrop={(e) => { if (!arranging) return; e.preventDefault(); move(null, group); }}>
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            {group}
          </h2>
          <div className={cx(
            "grid gap-4",
            group === "Bereiche" ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3",
            arranging && items.length === 0 && "min-h-24 rounded-2xl border border-dashed border-line"
          )}>
            {items.map((l) => (
              <TileCard
                key={l.id}
                link={l}
                arranging={arranging}
                dragged={dragged === l.id}
                highlighted={indexOf(l) === cursor && query !== ""}
                copied={copied === l.id}
                dropHint="Pfad kopiert — Win+E, dann Strg+V"
                onOpen={() => open(l)}
                onDragStart={() => setDragged(l.id)}
                onDragEnd={() => setDragged(null)}
                onDragOver={(e) => { if (arranging) e.preventDefault(); }}
                onDrop={(e) => {
                  if (!arranging) return;
                  e.preventDefault(); e.stopPropagation();
                  move(l.id, l.group_name);
                }}
              />
            ))}
          </div>
        </section>
      ))}

      {filtered.length === 0 && !arranging && (
        <p className="rounded-xl bg-sand/60 px-4 py-8 text-center text-sm text-ink-muted">
          Nichts gefunden.
        </p>
      )}
    </div>
  );
}

function shortTarget(l: NavLink) {
  if (l.kind === "web") {
    try { return new URL(l.target).hostname.replace(/^www\./, ""); }
    catch { return l.target; }
  }
  return l.target;
}
