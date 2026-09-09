// Handgepflegte DB-Typen (Spiegel der Migrationen in supabase/migrations).
export type AccountType = "checking" | "savings" | "investment" | "trading" | "cash" | "debt";
export type CategoryKind = "income" | "expense";
export type TxnSource = "manual" | "csv" | "recurring";
export type RecurrenceInterval = "weekly" | "monthly" | "quarterly" | "semiannual" | "yearly";

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  checking: "Konto", savings: "Sparkonto", investment: "Anlagen",
  trading: "Trading", cash: "Bargeld", debt: "Schuld",
};

export const INTERVAL_LABEL: Record<RecurrenceInterval, string> = {
  weekly: "wöchentlich", monthly: "monatlich", quarterly: "quartalsweise",
  semiannual: "halbjährlich", yearly: "jährlich",
};

/** Faktor, um einen Betrag des Intervalls auf einen Monat umzurechnen. */
export const INTERVAL_TO_MONTHLY: Record<RecurrenceInterval, number> = {
  weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, semiannual: 1 / 6, yearly: 1 / 12,
};

export interface Account {
  id: string; user_id: string; name: string; type: AccountType;
  opening_balance: number; opening_date: string;
  include_in_runway: boolean; note: string | null;
  sort_order: number; archived: boolean;
}

export interface AccountBalance {
  account_id: string; user_id: string; name: string; type: AccountType;
  include_in_runway: boolean; archived: boolean; sort_order: number;
  base_balance: number; base_date: string; balance: number;
}

export interface Category {
  id: string; user_id: string; name: string; kind: CategoryKind;
  is_fixed: boolean; is_goal_spend: boolean; color: string;
  /** Sparen und Investment verschieben Vermögen, sie sind kein Konsum. */
  is_savings: boolean;
  monthly_budget: number | null; sort_order: number; archived: boolean;
}

export interface Transaction {
  id: string; user_id: string;
  account_id: string | null; category_id: string | null; activity_id: string | null;
  occurred_on: string; amount: number; description: string;
  counterparty: string | null; source: TxnSource; external_ref: string | null;
  is_transfer: boolean; transfer_group: string | null;
}

export interface RecurringItem {
  id: string; user_id: string;
  category_id: string | null; account_id: string | null;
  label: string; amount: number; interval: RecurrenceInterval;
  day_of_month: number; start_date: string; end_date: string | null;
  auto_post: boolean; active: boolean;
}

export interface ImportRule {
  id: string; user_id: string; pattern: string;
  match_field: "description" | "counterparty";
  match_type: "contains" | "regex" | "starts_with";
  category_id: string; priority: number; hit_count: number;
}

export interface MonthlyCashflow {
  user_id: string; month: string;
  income: number; expenses: number; net: number;
  fixed_expenses: number; variable_expenses: number;
  /** Sparen und Investment - Vermögen verschoben, nicht ausgegeben. */
  savings: number;
}

export interface Scenario {
  id: string; user_id: string; name: string; description: string | null;
  income_factor: number; expense_delta_monthly: number; one_off_cost: number;
  starts_on: string | null; is_baseline: boolean; sort_order: number;
}

export interface RunwayInputs {
  liquid: number; net_worth: number;
  avg_income: number; avg_expenses: number;
  recurring_fixed: number; months_with_data: number;
}

/* ------------------------------------------------------------- Zeit-Modul */

export interface AccountStats {
  account_id: string; user_id: string;
  txn_count: number; first_txn: string | null; last_txn: string | null;
  income: number; expenses: number; transfers: number; uncategorized: number;
}

export interface FixedCostCandidate {
  user_id: string;
  pattern: string;
  amount: number;
  sample: string;
  hits: number;
  first_seen: string;
  last_seen: string;
  months: number;
  category_id: string | null;
  account_id: string | null;
  day_of_month: number;
  avg_gap_days: number | null;
  gap_stddev: number | null;
  /** Streuung der Abstände im Verhältnis zum Abstand. 0 = perfekt gleichmässig. */
  irregularity: number | null;
  guessed_interval: RecurrenceInterval;
  still_running: boolean;
  looks_fixed: boolean;
}

export interface RecurringCandidate {
  user_id: string;
  pattern: string;
  sample: string;
  hits: number;
  months: number;
  avg_amount: number;
  min_amount: number;
  max_amount: number;
  last_seen: string;
  category_id: string | null;
  account_id: string | null;
  stable: boolean;
}

/* -------------------------------------------------------------- Navigator */

export type LinkKind = "section" | "web" | "folder";

export const LINK_KIND_LABEL: Record<LinkKind, string> = {
  section: "Bereich in KerimOS",
  web: "Adresse im Netz",
  folder: "Lokaler Ordner",
};

export interface NavLink {
  id: string;
  user_id: string;
  title: string;
  subtitle: string | null;
  kind: LinkKind;
  target: string;
  group_name: string;
  icon: string | null;
  image_url: string | null;
  /** Sichtbarer Bildausschnitt, wie CSS object-position. */
  image_position: string;
  color: string;
  sort_order: number;
  open_count: number;
  last_opened_at: string | null;
  archived: boolean;
}
