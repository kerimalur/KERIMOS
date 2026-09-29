/** Zeilentypen der Marktdaten-Tabellen (Schema trading), aus dem Screener-Frontend übernommen (29.09.2026). */

export interface CotReportRow {
  contract_code: string;
  report_date: string;
  open_interest: number | null;
  noncomm_long: number | null;
  noncomm_short: number | null;
  comm_long: number | null;
  comm_short: number | null;
  nonrept_long: number | null;
  nonrept_short: number | null;
  chg_noncomm_long: number | null;
  chg_noncomm_short: number | null;
}

/** TFF-Report ("Traders in Financial Futures", futures-only) — nur Financial Futures. */
export interface CotTffRow {
  contract_code: string;
  report_date: string;
  open_interest: number | null;
  dealer_long: number | null;
  dealer_short: number | null;
  asset_mgr_long: number | null;
  asset_mgr_short: number | null;
  lev_money_long: number | null;
  lev_money_short: number | null;
  other_long: number | null;
  other_short: number | null;
  nonrept_long: number | null;
  nonrept_short: number | null;
}

export interface CalendarEventRow {
  id: string;
  title: string;
  country: string | null;
  currency: string | null;
  event_time: string;
  impact: string | null;
  forecast: string | null;
  previous: string | null;
  actual: string | null;
  updated_at: string;
}
