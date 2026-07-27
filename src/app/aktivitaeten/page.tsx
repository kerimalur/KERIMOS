import { createClient } from "@/lib/supabase/server";
import { createActivity, updateActivity, archiveActivity, seedActivities } from "@/lib/actions";
import { Button, Card, CardTitle, Input, Label, Select, Empty } from "@/components/ui";
import {
  BUCKET_LABEL, BUCKET_ORDER, BUCKET_COLOR, BUCKET_HINT, type Activity,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AktivitaetenPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("activities").select("*").eq("archived", false)
    .order("sort_order").order("name");
  const activities = (data ?? []) as Activity[];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-medium text-ink">Aktivitäten</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Jede Aktivität gehört zu einem Lebensbereich. Die Wochen-Auswertung rechnet
          genau darüber — wie viel ging an Ziele, wie viel an Leerlauf. Genau eine
          Aktivität sollte als <span className="text-ink-soft">Schlaf</span> markiert sein.
        </p>
      </div>

      {/* Anlegen zuoberst */}
      <Card>
        <CardTitle>Aktivität hinzufügen</CardTitle>
        <form action={createActivity} className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required placeholder="z. B. Podcast hören" />
          </div>
          <div className="w-44">
            <Label htmlFor="bucket">Lebensbereich</Label>
            <Select id="bucket" name="bucket" defaultValue="pflicht">
              {BUCKET_ORDER.map((b) => (
                <option key={b} value={b}>{BUCKET_LABEL[b]}</option>
              ))}
            </Select>
          </div>
          <div className="w-28">
            <Label htmlFor="hourly_rate">CHF / Stunde</Label>
            <Input id="hourly_rate" name="hourly_rate" type="number" step="0.05"
              placeholder="optional" />
          </div>
          <div className="w-16">
            <Label htmlFor="color">Farbe</Label>
            <input id="color" name="color" type="color" defaultValue="#8A8478"
              className="h-9 w-full rounded-xl border border-line bg-card" />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm text-ink-soft">
            <input type="checkbox" name="counts_toward_goal"
              className="h-4 w-4 rounded border-line" />
            Ziel
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm text-ink-soft"
            title="Zählt nicht als Wachzeit, sondern bestimmt die Länge deines Tages.">
            <input type="checkbox" name="is_sleep" className="h-4 w-4 rounded border-line" />
            Schlaf
          </label>
          <Button type="submit">Anlegen</Button>
        </form>
      </Card>

      {activities.length === 0 && (
        <Card>
          <Empty>Noch keine Aktivitäten.</Empty>
          <form action={seedActivities} className="mt-3">
            <Button type="submit" className="w-full">Standard-Set anlegen</Button>
          </form>
        </Card>
      )}

      {/* Bestehende darunter, nach Lebensbereich */}
      {BUCKET_ORDER.map((bucket) => {
        const items = activities.filter((a) => a.bucket === bucket);
        if (items.length === 0) return null;
        return (
          <Card key={bucket}>
            <div className="mb-3 flex items-baseline gap-2">
              <span className="h-2.5 w-2.5 rounded-sm"
                style={{ background: BUCKET_COLOR[bucket] }} />
              <span className="text-sm font-medium text-ink">{BUCKET_LABEL[bucket]}</span>
              <span className="text-xs text-ink-muted">{BUCKET_HINT[bucket]}</span>
              <span className="ml-auto text-xs text-ink-faint">
                {items.length} {items.length === 1 ? "Aktivität" : "Aktivitäten"}
              </span>
            </div>

            <ul className="space-y-2">
              {items.map((a) => (
                <li key={a.id}>
                  <form action={updateActivity}
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-line/60 px-3 py-2">
                    <input type="hidden" name="id" value={a.id} />
                    <input type="color" name="color" defaultValue={a.color}
                      className="h-7 w-8 shrink-0 rounded border border-line bg-transparent" />
                    <Input name="name" defaultValue={a.name} className="min-w-40 flex-1" />
                    <Select name="bucket" defaultValue={a.bucket} className="w-40">
                      {BUCKET_ORDER.map((b) => (
                        <option key={b} value={b}>{BUCKET_LABEL[b]}</option>
                      ))}
                    </Select>
                    <Input name="hourly_rate" type="number" step="0.05"
                      defaultValue={a.hourly_rate ?? ""} placeholder="CHF/h" className="w-24" />
                    <label className="flex shrink-0 items-center gap-1.5 text-xs text-ink-muted">
                      <input type="checkbox" name="counts_toward_goal"
                        defaultChecked={a.counts_toward_goal}
                        className="h-3.5 w-3.5 rounded border-line" />
                      Ziel
                    </label>
                    <label className="flex shrink-0 items-center gap-1.5 text-xs text-ink-muted"
                      title="Diese Aktivität ist Schlaf. Sie zählt nicht als Wachzeit.">
                      <input type="checkbox" name="is_sleep" defaultChecked={a.is_sleep}
                        className="h-3.5 w-3.5 rounded border-line" />
                      Schlaf
                    </label>
                    <Button variant="ghost" type="submit" className="px-2 py-1 text-xs">
                      Speichern
                    </Button>
                    <button formAction={archiveActivity}
                      className="text-xs text-ink-faint transition hover:text-bad">
                      archivieren
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
