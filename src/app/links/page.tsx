import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createLink, updateLink, deleteLink, seedLinks } from "@/lib/actions";
import { Button, Card, CardTitle, Input, Label, Select, Badge, Empty } from "@/components/ui";
import { TileImage } from "@/components/tile-image";
import { LINK_KIND_LABEL, type NavLink } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function LinksPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("links").select("*")
    .eq("archived", false).order("group_name").order("sort_order");
  const links = (data ?? []) as NavLink[];

  const groups = [...new Set(links.map((l) => l.group_name))];

  return (
    <div className="space-y-5 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-ink">Kacheln</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Was hier steht, erscheint auf der Startseite. Ein Bild ersetzt das Symbol.
            Ein Klick auf „Speichern“ sichert die ganze Zeile.
            Die Reihenfolge verschiebst du direkt auf der Startseite über „Anordnen“.
            Lokale Ordner kann ein Browser nicht öffnen — ein Klick legt den Pfad in die
            Zwischenablage, Win+E und Strg+V bringen dich hin.
          </p>
        </div>
        <Link href="/" className="text-sm text-accent-soft transition hover:underline">
          ← Zur Startseite
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {links.length === 0 && (
            <Card>
              <Empty>Noch keine Kacheln.</Empty>
              <form action={seedLinks} className="mt-3">
                <Button type="submit" className="w-full">Standard-Kacheln anlegen</Button>
              </form>
            </Card>
          )}

          {groups.map((group) => (
            <Card key={group}>
              <CardTitle>{group}</CardTitle>
              <ul className="space-y-2">
                {links.filter((l) => l.group_name === group).map((l) => (
                  <li key={l.id} className="space-y-1.5">
                    <div className="px-3">
                      <TileImage linkId={l.id} imageUrl={l.image_url} />
                    </div>
                    <form action={updateLink}
                      className="flex flex-wrap items-center gap-2 rounded-xl border border-line/60 px-3 py-2">
                      <input type="hidden" name="id" value={l.id} />
                      <Input name="icon" defaultValue={l.icon ?? ""} className="w-12 text-center"
                        aria-label="Symbol" />
                      <input type="color" name="color" defaultValue={l.color}
                        className="h-8 w-9 shrink-0 rounded border border-line bg-transparent" />
                      <Input name="title" defaultValue={l.title} className="w-36" aria-label="Titel" />
                      <Input name="subtitle" defaultValue={l.subtitle ?? ""}
                        className="w-40" placeholder="Untertitel" aria-label="Untertitel" />
                      <Select name="kind" defaultValue={l.kind} className="w-44" aria-label="Art">
                        {Object.entries(LINK_KIND_LABEL).map(([v, label]) => (
                          <option key={v} value={v}>{label}</option>
                        ))}
                      </Select>
                      <Input name="target" defaultValue={l.target}
                        className="min-w-56 flex-1" aria-label="Ziel" />
                      <Input name="group_name" defaultValue={l.group_name}
                        className="w-28" aria-label="Gruppe" />
                      <Input name="sort_order" type="number" defaultValue={l.sort_order}
                        className="w-16" aria-label="Reihenfolge" />
                      {l.open_count > 0 && <Badge>{l.open_count}×</Badge>}
                      <Button variant="ghost" type="submit" className="px-2.5 py-1 text-xs">
                        Speichern
                      </Button>
                      <button formAction={deleteLink}
                        className="text-xs text-ink-faint transition hover:text-bad">
                        löschen
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>

        <Card className="h-fit">
          <CardTitle>Kachel hinzufügen</CardTitle>
          <form action={createLink} className="space-y-3">
            <div>
              <Label htmlFor="title">Titel</Label>
              <Input id="title" name="title" required />
            </div>
            <div>
              <Label htmlFor="subtitle">Untertitel</Label>
              <Input id="subtitle" name="subtitle" placeholder="kurze Beschreibung" />
            </div>
            <div>
              <Label htmlFor="kind">Art</Label>
              <Select id="kind" name="kind" defaultValue="web">
                {Object.entries(LINK_KIND_LABEL).map(([v, label]) => (
                  <option key={v} value={v}>{label}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="target">Ziel</Label>
              <Input id="target" name="target" required
                placeholder="https://… oder C:\Projekte\…" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="group_name">Gruppe</Label>
                <Input id="group_name" name="group_name" defaultValue="Projekte" list="gruppen" />
                <datalist id="gruppen">
                  {groups.map((g) => <option key={g} value={g} />)}
                </datalist>
              </div>
              <div>
                <Label htmlFor="icon">Symbol</Label>
                <Input id="icon" name="icon" maxLength={2} placeholder="◈" />
              </div>
            </div>
            <div>
              <Label htmlFor="color">Farbe</Label>
              <input id="color" name="color" type="color" defaultValue="#5FC2A6"
                className="h-9 w-full rounded-xl border border-line bg-card" />
            </div>
            <Button type="submit" className="w-full">Anlegen</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
