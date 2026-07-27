import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { RunwaySimulator } from "@/components/runway-simulator";
import { Empty } from "@/components/ui";
import type { RunwayInputs, Scenario } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RunwayPage() {
  const supabase = await createClient();
  const [{ data: rows }, { data: scenarios }, { count }] = await Promise.all([
    supabase.rpc("runway_inputs", { months_lookback: 3 }),
    supabase.from("scenarios").select("*").order("created_at", { ascending: false }),
    supabase.from("accounts").select("id", { count: "exact", head: true }),
  ]);

  if (!count) {
    return (
      <Empty>
        Richte zuerst dein{" "}
        <Link href="/" className="text-accent hover:underline">Cockpit</Link> ein.
      </Empty>
    );
  }

  const inputs = ((rows as RunwayInputs[] | null)?.[0] ?? {
    liquid: 0, net_worth: 0, avg_income: 0, avg_expenses: 0,
    recurring_fixed: 0, months_with_data: 0,
  }) as RunwayInputs;

  // Numerische Felder kommen als String aus PostgREST - einmal sauber normalisieren.
  const normalized: RunwayInputs = {
    liquid: Number(inputs.liquid),
    net_worth: Number(inputs.net_worth),
    avg_income: Number(inputs.avg_income),
    avg_expenses: Number(inputs.avg_expenses),
    recurring_fixed: Number(inputs.recurring_fixed),
    months_with_data: Number(inputs.months_with_data),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Runway</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Wie lange trägt dich dein Geld, wenn sich etwas ändert? Die Ausgangswerte
          stammen aus den letzten drei vollen Monaten — in den Gutschriften stecken
          allerdings auch Rückzahlungen von Kollegen und Bareinzahlungen. Trag oben
          links deinen echten Lohn ein, dann stimmt der Rest.
        </p>
      </div>
      <RunwaySimulator inputs={normalized} saved={(scenarios ?? []) as Scenario[]} />
    </div>
  );
}
