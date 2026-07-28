"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { registerLinkOpen } from "@/lib/actions";
import { cx } from "@/components/ui";
import type { NavLink } from "@/lib/types";

/**
 * Globale Schnellsuche über alle Kacheln: Ctrl+K (oder Klick), tippen, Enter.
 * Struktur für den Kopf, Suche für die Finger — der schnellste Weg bleibt
 * erhalten, auch wenn die Startseite nur noch Modi zeigt.
 */
export function QuickSearch({ links }: { links: NavLink[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o); setQ(""); setCursor(0);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) {
      return [...links].sort((a, b) => b.open_count - a.open_count).slice(0, 8);
    }
    return links
      .filter((l) =>
        l.title.toLowerCase().includes(t) ||
        (l.subtitle ?? "").toLowerCase().includes(t) ||
        l.group_name.toLowerCase().includes(t))
      .slice(0, 8);
  }, [links, q]);

  function openLink(l: NavLink) {
    void registerLinkOpen(l.id);
    setOpen(false);
    if (l.kind === "section") { router.push(l.target); return; }
    if (l.kind === "web") {
      window.open(l.target, "_blank", "noopener,noreferrer");
      return;
    }
    // Ordner: Handler versuchen, Pfad zusätzlich in die Zwischenablage
    window.location.href = `kerimos://open?path=${encodeURIComponent(l.target)}`;
    void navigator.clipboard.writeText(l.target).catch(() => {});
  }

  return (
    <>
      <button onClick={() => { setOpen(true); setQ(""); setCursor(0); }}
        className="flex items-center gap-2 rounded-xl border border-line bg-card px-3 py-1.5 text-sm text-ink-muted transition hover:border-line-strong hover:text-ink-soft">
        Suchen …
        <kbd className="rounded bg-sand px-1.5 py-0.5 text-[10px] text-ink-muted">Ctrl K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-ink/20 p-4 pt-[12vh]"
          onClick={() => setOpen(false)}>
          <div className="mx-auto max-w-lg overflow-hidden rounded-2xl border border-line bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}>
            <input ref={inputRef} value={q}
              onChange={(e) => { setQ(e.target.value); setCursor(0); }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setCursor((c) => Math.min(c + 1, results.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setCursor((c) => Math.max(c - 1, 0));
                } else if (e.key === "Enter" && results[cursor]) {
                  openLink(results[cursor]);
                }
              }}
              placeholder="Kachel suchen — Enter öffnet"
              className="w-full border-b border-line bg-transparent px-4 py-3 text-sm text-ink outline-none placeholder:text-ink-faint" />

            <ul className="max-h-80 overflow-y-auto py-1.5">
              {results.length === 0 && (
                <li className="px-4 py-3 text-sm text-ink-muted">Nichts gefunden.</li>
              )}
              {results.map((l, i) => (
                <li key={l.id}>
                  <button onClick={() => openLink(l)}
                    onMouseEnter={() => setCursor(i)}
                    className={cx("flex w-full items-center gap-3 px-4 py-2 text-left",
                      i === cursor && "bg-sand")}>
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs text-white"
                      style={{ background: l.color }}>
                      {l.icon ?? l.title[0]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{l.title}</span>
                      {l.subtitle && (
                        <span className="block truncate text-xs text-ink-muted">{l.subtitle}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-ink-faint">
                      {l.group_name}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
