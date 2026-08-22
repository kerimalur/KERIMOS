import { tradingConfigured } from "@/lib/supabase/trading";
import { baueBilanz } from "@/lib/confluence/seite";
import { Luecken } from "@/components/confluence/teile";
import {
  GruppenTabelle, BefundKarte, VetoKarte, VerteilungKarte, TradeListe,
} from "@/components/confluence/bilanz-teile";
import { Card, CardTitle, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Bilanz — hat der fundamentale Rückenwind bei Kerims eigenen Trades gewirkt?
 *
 * Stand vorher unter `/trading/confluence?ansicht=bilanz`. Gehört ins Journal,
 * weil die Zahl aus den eigenen Trades kommt und nicht aus dem Markt: sie
 * ändert sich, wenn Kerim einen Trade nachträgt, nicht wenn ein COT-Bericht
 * erscheint. Neben Equity und Trades steht sie am richtigen Ort — dort schaut
 * man ohnehin hin, wenn man wissen will, was die eigene Regel gebracht hat.
 */
export default async function BilanzSeite() {
  if (!tradingConfigured()) {
    return (
      <Card>
        <CardTitle>Bilanz</CardTitle>
        <Empty>
          Trading-Datenbank nicht verbunden. In Vercel fehlen TRADING_SUPABASE_URL
          und TRADING_SUPABASE_SERVICE_ROLE_KEY.
        </Empty>
      </Card>
    );
  }

  const b = await baueBilanz();

  if (b.ausgewertet === 0) {
    return (
      <Card>
        <CardTitle>Bilanz</CardTitle>
        <Empty>
          Noch keine abgeschlossenen Trades im Journal. Sobald Trades mit
          Ergebnis erfasst sind, wird hier gerechnet, ob Rückenwind bei
          <em> deinen</em> Einstiegen etwas ausgemacht hat.
        </Empty>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardTitle>Rückenwind gegen Gegenwind</CardTitle>
        <BefundKarte v={b.vergleich} />
        <div className="mt-4"><GruppenTabelle gruppen={b.gruppen} /></div>
        <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
          {b.ausgewertet} ausgewertete Trades von {b.von} bis {b.bis}
          {b.uebersprungen > 0 && ` · ${b.uebersprungen} ohne Ergebnis übersprungen`}.
          Jeder Trade wurde mit dem Stand <strong>seines</strong> Handelstages
          bewertet. Das ist der einzige Test der Confluence-Idee, der mit dieser
          Datenlage aussagekräftig werden kann: gepaart, gleiche Methode, gleicher
          Zeitraum — nur einmal mit und einmal ohne fundamentalen Rückenwind.
        </p>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle>Trennt der Filter überhaupt?</CardTitle>
          <VerteilungKarte verteilung={b.verteilung} gesamt={b.ausgewertet} />
        </Card>
        <Card>
          <CardTitle>Das Veto</CardTitle>
          <VetoKarte v={b.veto} />
        </Card>
      </div>

      <Card>
        <CardTitle>Alle bewerteten Trades</CardTitle>
        <TradeListe trades={b.trades} />
      </Card>

      {b.bericht && <Luecken leer={b.bericht.leer} cotQuelle={b.bericht.cotQuelle} />}
    </div>
  );
}
