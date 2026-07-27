"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { setLinkImage } from "@/lib/actions";
import { cx } from "@/components/ui";

/** Lädt ein Kachelbild in den Supabase-Speicher und hinterlegt die Adresse. */
export function TileImage({ linkId, imageUrl }: { linkId: string; imageUrl: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setError(null);

    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setError("Nicht angemeldet"); setBusy(false); return; }

    const ext = (file.name.split(".").pop() ?? "png").toLowerCase();
    const path = `${auth.user.id}/${crypto.randomUUID()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from("tiles").upload(path, file, { cacheControl: "31536000", upsert: false });

    if (upErr) { setError(upErr.message); setBusy(false); return; }

    const { data: pub } = supabase.storage.from("tiles").getPublicUrl(path);
    const fd = new FormData();
    fd.set("id", linkId);
    fd.set("image_url", pub.publicUrl);
    await setLinkImage(fd);

    setBusy(false);
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    const fd = new FormData();
    fd.set("id", linkId);
    fd.set("image_url", "");
    await setLinkImage(fd);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
      )}
      <label className={cx(
        "cursor-pointer rounded-lg border border-line px-2 py-1 text-xs text-ink-muted transition",
        "hover:border-line-strong hover:text-ink-soft", busy && "opacity-50"
      )}>
        {busy ? "…" : imageUrl ? "Bild tauschen" : "Bild"}
        <input type="file" accept="image/*" onChange={upload} disabled={busy} className="hidden" />
      </label>
      {imageUrl && (
        <button type="button" onClick={remove}
          className="text-xs text-ink-faint transition hover:text-bad">
          entfernen
        </button>
      )}
      {error && <span className="text-xs text-bad">{error}</span>}
    </div>
  );
}
