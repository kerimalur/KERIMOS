"use client";

import { useEffect, useRef } from "react";

/**
 * Die TradingView-Watchlist als Widget.
 *
 * Warum überhaupt ein Fremd-Widget: die Kurse sind live und die Liste pflegst
 * du ohnehin schon in TradingView. Alles selbst zu bauen hiesse, dieselbe
 * Liste zweimal zu führen.
 *
 * Was das Widget NICHT kann, und das ist wichtig: es kennt deine GVA-Linien
 * und Setup-Zustände nicht. Es zeigt Kurse, keine Setups. Was im Radar auf
 * „läuft noch" steht, gehört deshalb weiter ins Cockpit — dieses Widget ist
 * der Marktüberblick daneben, nicht der Ersatz dafür.
 *
 * Client-Komponente, weil TradingView ein Script in den DOM hängt. Bewusst
 * ohne next/script: das Widget verlangt das Script INNERHALB seines
 * Containers, und `next/script` platziert es woanders.
 */

export interface WatchlistGruppe {
  name: string;
  symbols: string[];
}

/**
 * Kerims 28 Paare, nach Basiswährung gruppiert — dieselbe Reihenfolge wie im
 * Screener, damit man nicht zweimal suchen muss.
 */
export const STANDARD_LISTE: WatchlistGruppe[] = [
  { name: "USD", symbols: ["OANDA:EURUSD", "OANDA:GBPUSD", "OANDA:AUDUSD", "OANDA:NZDUSD", "OANDA:USDJPY", "OANDA:USDCAD", "OANDA:USDCHF"] },
  { name: "EUR", symbols: ["OANDA:EURJPY", "OANDA:EURGBP", "OANDA:EURAUD", "OANDA:EURCAD", "OANDA:EURCHF", "OANDA:EURNZD"] },
  { name: "GBP", symbols: ["OANDA:GBPJPY", "OANDA:GBPAUD", "OANDA:GBPCAD", "OANDA:GBPCHF", "OANDA:GBPNZD"] },
  { name: "AUD & NZD", symbols: ["OANDA:AUDJPY", "OANDA:AUDCAD", "OANDA:AUDCHF", "OANDA:AUDNZD", "OANDA:NZDJPY", "OANDA:NZDCAD", "OANDA:NZDCHF"] },
  { name: "CAD & CHF", symbols: ["OANDA:CADJPY", "OANDA:CADCHF", "OANDA:CHFJPY"] },
];

export function TradingViewWatchlist({
  gruppen = STANDARD_LISTE, hoehe = 460,
}: {
  gruppen?: WatchlistGruppe[];
  hoehe?: number;
}) {
  const behaelter = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = behaelter.current;
    if (!el) return;
    // Bei einem erneuten Lauf (Hot Reload, Navigation) erst leeren — sonst
    // stapeln sich mehrere Widgets übereinander.
    el.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-market-quotes.js";
    script.async = true;
    script.type = "text/javascript";
    script.innerHTML = JSON.stringify({
      width: "100%",
      height: hoehe,
      symbolsGroups: gruppen.map((g) => ({
        name: g.name,
        originalName: g.name,
        symbols: g.symbols.map((s) => ({ name: s, displayName: s.replace("OANDA:", "") })),
      })),
      showSymbolLogo: false,
      isTransparent: true,
      colorTheme: "dark",
      locale: "de_DE",
      backgroundColor: "rgba(0,0,0,0)",
    });
    el.appendChild(script);

    return () => { el.innerHTML = ""; };
  }, [gruppen, hoehe]);

  return (
    <div>
      <div ref={behaelter} className="tradingview-widget-container"
        style={{ minHeight: hoehe }} />
      <noscript>
        <p className="text-xs text-ink-faint">
          Das Kurs-Widget braucht JavaScript.
        </p>
      </noscript>
    </div>
  );
}
