// Handgepflegte DB-Typen (Spiegel der Migrationen in supabase/migrations).
export type AccountType = "checking" | "savings" | "investment" | "trading" | "cash" | "debt";
export type CategoryKind = "income" | "expense";
export type TxnSource = "manual" | "csv" | "recurring";
export type RecurrenceInterval = "weekly" | "monthly" | "quarterly" | "semiannual" | "yearly";
export type ActivityKind = "job" | "trading" | "project" | "learning" | "training" | "admin" | "life";
export type GoalKind = "financial" | "time" | "milestone";
export type GoalStatus = "active" | "paused" | "done" | "dropped";

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

export interface Activity {
  id: string; user_id: string; name: string; kind: ActivityKind;
  bucket: TimeBucket; color: string;
  counts_toward_goal: boolean; hourly_rate: number | null;
  /** Schlaf zählt nicht als Wachzeit und wird aus der Lückenrechnung herausgehalten. */
  is_sleep: boolean;
  calendar_patterns: string[]; sort_order: number; archived: boolean;
}

export interface Goal {
  id: string; user_id: string; title: string; description: string | null;
  kind: GoalKind; target_amount: number | null; unit: string | null;
  start_date: string; target_date: string | null;
  linked_category_ids: string[]; linked_activity_ids: string[];
  manual_progress: number | null; weekly_time_budget_hours: number | null;
  status: GoalStatus; sort_order: number;
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

export type TimeBucket =
  | "ziel" | "arbeit" | "pflicht" | "regeneration" | "sozial" | "spass" | "leerlauf";

export const BUCKET_ORDER: TimeBucket[] = [
  "ziel", "arbeit", "pflicht", "regeneration", "sozial", "spass", "leerlauf",
];

export const BUCKET_LABEL: Record<TimeBucket, string> = {
  ziel: "Ziele",
  arbeit: "Arbeit",
  pflicht: "Pflicht",
  regeneration: "Regeneration",
  sozial: "Soziales",
  spass: "Spass",
  leerlauf: "Leerlauf",
};

export const BUCKET_HINT: Record<TimeBucket, string> = {
  ziel: "Zahlt auf deine Ziele ein",
  arbeit: "Lohnarbeit",
  pflicht: "Muss sein, bringt aber nichts voran",
  regeneration: "Bewusste Erholung",
  sozial: "Zeit mit Menschen",
  spass: "Bewusst genossene Freizeit",
  leerlauf: "Verbrannt, ohne Gegenwert",
};

export const BUCKET_COLOR: Record<TimeBucket, string> = {
  ziel: "#5B8C7B",          // gedecktes Grün
  arbeit: "#C4A882",        // Sand
  pflicht: "#A8A093",       // warmes Grau
  regeneration: "#8FA6B8",  // stilles Blau
  sozial: "#D2A05F",        // Bernstein
  spass: "#BE8DA4",         // Altrosa
  leerlauf: "#B9847A",      // Terrakotta
};

export const UNACCOUNTED_COLOR = "#E0D9CA";

export interface DailyTime {
  user_id: string;
  entry_date: string;
  logged_minutes: number;
  ziel_minutes: number;
  arbeit_minutes: number;
  pflicht_minutes: number;
  regeneration_minutes: number;
  sozial_minutes: number;
  spass_minutes: number;
  leerlauf_minutes: number;
  sleep_hours: number | null;
  energy: number | null;
  waking_minutes: number;
  unaccounted_minutes: number;
}

export interface TimeEntry {
  id: string; user_id: string; activity_id: string;
  entry_date: string; minutes: number; note: string | null;
  source: "manual" | "calendar"; calendar_event_id: string | null;
  start_minute: number | null; confirmed: boolean;
}

export interface DayCheckin {
  id: string; user_id: string; entry_date: string;
  energy: number | null; sleep_hours: number | null; note: string | null;
}

export interface WeeklyBucket {
  user_id: string; week_start: string; bucket: TimeBucket; minutes: number;
}

export interface WeeklyActivity {
  user_id: string; week_start: string; activity_id: string;
  name: string; bucket: TimeBucket; color: string;
  counts_toward_goal: boolean; minutes: number; entry_count: number;
}

export interface ActivityValue {
  activity_id: string; user_id: string; name: string;
  kind: ActivityKind; bucket: TimeBucket; color: string;
  counts_toward_goal: boolean; hourly_rate: number | null;
  hours: number; net_amount: number;
  effective_hourly: number | null; notional_value: number | null;
  first_entry: string | null; last_entry: string | null;
}

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
  /** Aktivität, die beim Öffnen vorgeschlagen wird. */
  activity_id: string | null;
  track_time: boolean;
  color: string;
  sort_order: number;
  open_count: number;
  last_opened_at: string | null;
  archived: boolean;
}

export type FocusStatus = "open" | "logged" | "dismissed";

export interface FocusSession {
  id: string;
  user_id: string;
  label: string;
  link_id: string | null;
  link_ids: string[];
  activity_id: string | null;
  started_at: string;
  ended_at: string | null;
  minutes: number | null;
  status: FocusStatus;
  time_entry_id: string | null;
}

export interface GoalProgress {
  id: string; user_id: string; title: string; description: string | null;
  kind: GoalKind; target_amount: number | null; unit: string | null;
  start_date: string; target_date: string | null;
  linked_category_ids: string[]; linked_activity_ids: string[];
  manual_progress: number | null; weekly_time_budget_hours: number | null;
  status: GoalStatus; sort_order: number;
  progress: number; milestone_count: number; milestones_done: number;
}

export interface GoalMilestone {
  id: string; user_id: string; goal_id: string;
  title: string; target_date: string | null; done_at: string | null; sort_order: number;
}

export interface WeeklyReview {
  id: string; user_id: string; week_start: string;
  goal_hours: number | null; total_hours: number | null;
  income: number | null; expenses: number | null;
  net_worth: number | null; runway_months: number | null;
  went_well: string | null; went_poorly: string | null; next_week_focus: string | null;
  created_at: string;
}

export const GOAL_KIND_LABEL: Record<GoalKind, string> = {
  financial: "Geldbetrag",
  time: "Stunden",
  milestone: "Meilensteine",
};

/* --------------------------------------------------------------- Aufgaben */

/**
 * Lebensbereich einer Aufgabe. Startet mit denselben sieben Bereichen wie die
 * Zeit-Buckets, ist aber frei erweiterbar - deshalb eine eigene Tabelle und
 * kein Enum. `bucket` hält die Verbindung zur Zeiterfassung, wo es eine gibt.
 */
export interface LifeArea {
  id: string;
  user_id: string;
  name: string;
  bucket: TimeBucket | null;
  color: string;
  sort_order: number;
  archived: boolean;
}

export interface Task {
  id: string;
  user_id: string;
  title: string;
  details: string | null;
  life_area_id: string | null;
  /** Deadline. NULL heisst: irgendwann. */
  due_on: string | null;
  /** 0 = normal, 1 = wichtig. */
  priority: number;
  /** Gesetzt heisst erledigt. */
  done_at: string | null;
  sort_order: number;
  created_at: string;
}

export interface Subtask {
  id: string;
  user_id: string;
  task_id: string;
  title: string;
  done_at: string | null;
  sort_order: number;
}

/** Aufgabe samt Bereichsnamen und Stand der Unteraufgaben. */
export interface TaskView extends Task {
  areaName: string | null;
  areaColor: string | null;
  subtasks: Subtask[];
  subtasksDone: number;
}
