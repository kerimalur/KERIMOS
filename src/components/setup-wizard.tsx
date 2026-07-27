"use client";
import { useState } from "react";
import { runSetup } from "@/lib/actions";
import { Button, Card, Input, Label } from "@/components/ui";

export function SetupWizard() {
  const [liquid, setLiquid] = useState("40000");
  const [fixed, setFixed] = useState("1400");

  return (
    <Card className="mx-auto max-w-lg">
      <h2 className="text-lg font-semibold text-ink">Kurz einrichten</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Zwei Zahlen genügen, damit der Runway ab sofort stimmt. Alles Weitere kannst du
        später verfeinern.
      </p>

      <form action={runSetup} className="mt-5 space-y-4">
        <div>
          <Label htmlFor="liquid">Was liegt aktuell auf der Seite? (CHF)</Label>
          <Input id="liquid" name="liquid" inputMode="decimal" value={liquid}
            onChange={(e) => setLiquid(e.target.value)} />
          <p className="mt-1 text-xs text-ink-muted">
            Alles, woran du im Notfall herankommst: Konto, Sparkonto, Bargeld.
          </p>
        </div>
        <div>
          <Label htmlFor="fixed_costs">Monatliche Fixkosten (CHF)</Label>
          <Input id="fixed_costs" name="fixed_costs" inputMode="decimal" value={fixed}
            onChange={(e) => setFixed(e.target.value)} />
          <p className="mt-1 text-xs text-ink-muted">
            Miete, Krankenkasse, Versicherungen, Abos - alles was ohnehin abgeht.
          </p>
        </div>
        <Button type="submit" className="w-full">KerimOS einrichten</Button>
      </form>

      <p className="mt-4 text-xs text-ink-muted">
        Angelegt werden: ein Hauptkonto mit diesem Stand, ein Satz Standard-Kategorien
        und die Fixkosten als monatlich wiederkehrender Posten.
      </p>
    </Card>
  );
}
