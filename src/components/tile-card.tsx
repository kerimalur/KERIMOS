"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { setLinkImage, setLinkImagePosition } from "@/lib/actions";
import { cx } from "@/components/ui";
import type { NavLink } from "@/lib/types";

/**
 * Eine Kachel: oben die Bildfläche, unten die Infozeile.
 * Bilder lassen sich direkt darauf ziehen — der Umweg über die
 * Verwaltungsseite entfällt.
 */
export function TileCard({
  link, onOpen, arranging, dragged, highlighted, copied, dropHint,
  onDragStart, onDragEnd, onDragOver, onDrop,
}: {
  link: NavLink;
  onOpen: () => void;
  arranging: boolean;
  dragged: boolean;
  highlighted: boolean;
  copied: boolean;
  dropHint: string;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bildausschnitt: beim Ziehen lokal, beim Loslassen gespeichert
  const [position, setPosition] = useState(link.image_position ?? "50% 50%");
  const [shifting, setShifting] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  function parsePosition(value: string): [number, number] {
    const m = /^(\d{1,3})% (\d{1,3})%$/.exec(value);
    return m ? [Number(m[1]), Number(m[2])] : [50, 50];
  }

  function onPointerDown(e: React.PointerEvent) {
    if (arranging || !link.image_url) return;
    const frame = frameRef.current;
    if (!frame) return;
    const [px, py] = parsePosition(position);
    startRef.current = { x: e.clientX, y: e.clientY, px, py };
    setShifting(true);
    frame.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const start = startRef.current;
    const frame = frameRef.current;
    if (!start || !frame) return;
    const rect = frame.getBoundingClientRect();
    // Ziehen nach unten zeigt den oberen Bildteil, deshalb das Minus
    const nx = clamp(start.px - ((e.clientX - start.x) / rect.width) * 100);
    const ny = clamp(start.py - ((e.clientY - start.y) / rect.height) * 100);
    setPosition(`${Math.round(nx)}% ${Math.round(ny)}%`);
  }

  async function onPointerUp() {
    if (!startRef.current) return;
    startRef.current = null;
    setShifting(false);
    await setLinkImagePosition(link.id, position);
    router.refresh();
  }

  function clamp(n: number) {
    return Math.min(100, Math.max(0, n));
  }

  async function upload(file: File | undefined) {
    if (!file || busy) return;
    if (!file.type.startsWith("image/")) { setError("Keine Bilddatei"); return; }
    setBusy(true); setError(null);

    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setError("Nicht angemeldet"); setBusy(false); return; }

    const ext = (file.name.split(".").pop() ?? "png").toLowerCase();
    const path = `${auth.user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("tiles").upload(path, file, { cacheControl: "31536000" });
    if (upErr) { setError(upErr.message); setBusy(false); return; }

    const { data: pub } = supabase.storage.from("tiles").getPublicUrl(path);
    const fd = new FormData();
    fd.set("id", link.id);
    fd.set("image_url", pub.publicUrl);
    await setLinkImage(fd);
    setBusy(false);
    router.refresh();
  }

  async function removeImage() {
    setBusy(true);
    const fd = new FormData();
    fd.set("id", link.id);
    fd.set("image_url", "");
    await setLinkImage(fd);
    setBusy(false);
    router.refresh();
  }

  return (
    <div
      draggable={arranging}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cx(
        "group overflow-hidden rounded-2xl border bg-card transition",
        arranging && "cursor-grab active:cursor-grabbing",
        dragged && "opacity-40",
        highlighted ? "border-accent ring-2 ring-accent/15" : "border-line hover:border-line-strong"
      )}
    >
      {/* Bildfläche */}
      <div
        ref={frameRef}
        onPointerDown={onPointerDown}
        onPointerMove={shifting ? onPointerMove : undefined}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDragOver={(e) => {
          if (arranging) return;
          e.preventDefault(); e.stopPropagation(); setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          if (arranging) return;
          e.preventDefault(); e.stopPropagation(); setOver(false);
          void upload(e.dataTransfer.files?.[0]);
        }}
        className={cx(
          "relative aspect-[16/10] w-full select-none",
          link.image_url ? "bg-sand" : "p-3",
          link.image_url && !arranging && (shifting ? "cursor-grabbing" : "cursor-grab")
        )}
      >
        {link.image_url ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={link.image_url} alt="" draggable={false}
              style={{ objectPosition: position }}
              className="pointer-events-none h-full w-full object-cover" />
            {!arranging && (
              <div className="absolute right-2 top-2 flex gap-1.5 opacity-0 transition group-hover:opacity-100">
                <button type="button" onClick={() => inputRef.current?.click()}
                  className="rounded-lg bg-card/90 px-2 py-1 text-[11px] text-ink-soft backdrop-blur transition hover:text-ink">
                  tauschen
                </button>
                <button type="button" onClick={removeImage}
                  className="rounded-lg bg-card/90 px-2 py-1 text-[11px] text-ink-muted backdrop-blur transition hover:text-bad">
                  entfernen
                </button>
              </div>
            )}
            {!arranging && !shifting && (
              <div className="pointer-events-none absolute bottom-2 left-2 rounded-lg bg-card/85 px-2 py-1 text-[11px] text-ink-muted opacity-0 backdrop-blur transition group-hover:opacity-100">
                ziehen verschiebt den Ausschnitt
              </div>
            )}
            {over && (
              <div className="absolute inset-0 grid place-items-center bg-accent/15 text-sm text-accent-soft">
                Loslassen zum Ersetzen
              </div>
            )}
          </>
        ) : (
          <div className={cx(
            "grid h-full w-full place-items-center rounded-xl border border-dashed text-center transition",
            over ? "border-accent bg-accent-tint" : "border-line"
          )}>
            <div>
              <div className="mx-auto mb-1.5 h-5 w-5 text-ink-faint" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <circle cx="8.5" cy="9.5" r="1.5" />
                  <path d="M21 16l-5-5-5 5-3-3-5 5" />
                </svg>
              </div>
              <p className="text-xs text-ink-muted">
                {busy ? "Lade hoch…" : "Bild ablegen"}
              </p>
              {!busy && (
                <p className="mt-0.5 text-[11px] text-ink-faint">
                  oder{" "}
                  <button type="button" onClick={() => inputRef.current?.click()}
                    className="underline transition hover:text-ink-muted">
                    Datei wählen
                  </button>
                </p>
              )}
              {error && <p className="mt-1 text-[11px] text-bad">{error}</p>}
            </div>
          </div>
        )}

        <input ref={inputRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => void upload(e.target.files?.[0])} />
      </div>

      {/* Infozeile */}
      <button onClick={onOpen}
        className="flex w-full items-center gap-3 border-t border-line px-4 py-3 text-left">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm"
          style={{ background: link.color + "22", color: link.color }}>
          {link.icon ?? link.title.slice(0, 1)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{link.title}</span>
          <span className="mt-0.5 block truncate text-xs text-ink-muted">
            {copied ? dropHint : link.subtitle ?? shortTarget(link)}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-ink-faint">
            {arranging ? "⠿" : link.kind === "folder" ? "⧉" : link.kind === "web" ? "↗" : "→"}
          </span>
        </span>
      </button>
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
