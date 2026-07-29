"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createGymClient } from "@/lib/supabase/gym";
import { createMenuClient } from "@/lib/supabase/menu";
import { heuteISO, addDays } from "@/lib/time";
import { type RecurrenceInterval } from "@/lib/types";

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht angemeldet");
  return { supabase, userId: user.id };
}

/** Wirft, statt Fehler stillschweigend zu verschlucken. */
function check(res: { error: { message: string } | null }, was: string) {
  if (res.error) throw new Error(`${was}: ${res.error.message}`);
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const numOrNull = (fd: FormData, k: string) => {
  const v = str(fd, k);
  if (v === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const numOr = (fd: FormData, k: string, fallback: number) => numOrNull(fd, k) ?? fallback;
const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";

/* ------------------------------------------------------ Schnellerfassung */

/**
 * Trägt das Körpergewicht in die Gym-Datenbank ein. Läuft serverseitig über
 * den Gym-Schlüssel; GYM_USER_ID gehört dazu, weil die Gym-DB eine eigene
 * Anmeldung hat und die Zeile sonst niemandem gehören würde.
 */
export async function addBodyWeight(fd: FormData) {
  await requireUser();
  const gym = createGymClient();
  if (!gym) throw new Error("Gym-Zugang nicht eingerichtet");

  const weight = numOrNull(fd, "weight_kg");
  if (weight === null || weight < 30 || weight > 250) return;

  // Besitzer der Zeile: bevorzugt aus GYM_USER_ID, sonst vom letzten
  // bestehenden Eintrag übernehmen (Ein-Personen-Datenbank).
  let gymUserId = process.env.GYM_USER_ID ?? null;
  if (!gymUserId) {
    const { data } = await gym.from("body_weight_entries")
      .select("user_id").not("user_id", "is", null).limit(1);
    gymUserId = (data?.[0]?.user_id as string | undefined) ?? null;
  }
  if (!gymUserId) {
    throw new Error(
      "Gewicht speichern: GYM_USER_ID fehlt in den Umgebungsvariablen " +
      "und es gibt noch keinen bestehenden Eintrag zum Übernehmen."
    );
  }

  check(await gym.from("body_weight_entries").insert({
    entry_date: heuteISO(),
    weight_kg: weight,
    source: "kerimos",
    user_id: gymUserId,
  }), "Gewicht speichern");
  revalidatePath("/gym"); revalidatePath("/quick"); revalidatePath("/");
}

/* -------------------------------------------------------- Einkaufsliste */
// Schreibt in die shopping_list der Menü-Datenbank - gleiche Liste wie in
// der Menü-App, nur von KerimOS aus bedienbar.

const revalidateEssen = () => { revalidatePath("/m/Essen"); revalidatePath("/"); };

export async function toggleShoppingItem(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;
  check(await menu.from("shopping_list")
    .update({ checked: fd.get("checked") === "true" })
    .eq("id", str(fd, "id")), "Einkauf abhaken");
  revalidateEssen();
}

export async function addShoppingItem(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;
  const item = str(fd, "item");
  if (!item) return;
  check(await menu.from("shopping_list").insert({
    item,
    quantity: str(fd, "quantity") || null,
    checked: false,
  }), "Einkauf hinzufügen");
  revalidateEssen();
}

export async function deleteShoppingItem(fd: FormData) {
  await requireUser();
  const menu = createMenuClient();
  if (!menu) return;
  check(await menu.from("shopping_list")
    .delete().eq("id", str(fd, "id")), "Einkauf löschen");
  revalidateEssen();
}

/* ----------------------------------------------------------------- Schlaf */

/**
 * Trägt Schlaf als Zeiteintrag ein - üblicherweise mit dem Vorschlag vom
 * Morgen-Bildschirm. Über Mitternacht hinweg entstehen zwei Einträge, damit
 * beide Tage stimmen; der Schlaf zählt ohnehin nicht als Wachzeit.
 */
export async function logSleep(fd: FormData) {
  const { supabase, userId } = await requireUser();

  const von = str(fd, "von");
  const bis = str(fd, "bis");
  const vonMin = zuMinute(von);
  const bisMin = zuMinute(bis);
  if (vonMin === null || bisMin === null) return;

  const { data: schlaf } = await supabase.from("activities")
    .select("id").eq("is_sleep", true).eq("archived", false).limit(1).maybeSingle();
  if (!schlaf) throw new Error("Keine Aktivität mit Schlaf-Kennzeichen gefunden");

  const heute = heuteISO();
  const gestern = addDays(heute, -1);
  const basis = {
    user_id: userId, activity_id: schlaf.id,
    source: "manual" as const, confirmed: true, note: "Schlaf",
  };

  // Vor Mitternacht der Vorabend, danach der heutige Morgen
  const zeilen = bisMin > vonMin
    ? [{ ...basis, entry_date: heute, start_minute: vonMin, minutes: bisMin - vonMin }]
    : [
        { ...basis, entry_date: gestern, start_minute: vonMin, minutes: 1440 - vonMin },
        ...(bisMin > 0
          ? [{ ...basis, entry_date: heute, start_minute: 0, minutes: bisMin }]
          : []),
      ];

  check(await supabase.from("time_entries").insert(zeilen), "Schlaf eintragen");
  revalidateTime(); revalidatePath("/heute"); revalidatePath("/");
}

/* --------------------------------------------------------------- Termine */

const zuMinute = (wert: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(wert);
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v >= 0 && v <= 1439 ? v : null;
};

const revalidateTermine = () => {
  ["/termine", "/heute", "/"].forEach((p) => revalidatePath(p));
};

export async function createAppointment(fd: FormData) {
  const { supabase, userId } = await requireUser();
  const title = str(fd, "title");
  const startsOn = str(fd, "starts_on");
  if (!title || !startsOn) return;

  const start = zuMinute(str(fd, "start"));
  const ende = zuMinute(str(fd, "end"));

  check(await supabase.from("appointments").insert({
    user_id: userId,
    title,
    starts_on: startsOn,
    start_minute: start,
    // Ende nur übernehmen, wenn es nach dem Start liegt
    end_minute: start !== null && ende !== null && ende > start ? ende : null,
    location: str(fd, "location") || null,
    note: str(fd, "note") || null,
  }), "Termin anlegen");
  revalidateTermine();
}

export async function deleteAppointment(fd: FormData) {
  const { supabase, userId } = await requireUser();
  await supabase.from("appointments")
    .delete().eq("id", str(fd, "id")).eq("user_id", userId);
  revalidateTermine();
}

/* ---------------------------------------------------------------- Konten */

export async function createAccount(fd: FormData) {
  const { supabase, userId } = await requireUser();
  check(await supabase.from("accounts").insert({
    user_id: userId,
    name: str(fd, "name"),
    type: str(fd, "type") || "checking",
    opening_balance: numOr(fd, "opening_balance", 0),
    opening_date: str(fd, "opening_date") || heuteISO(),
    include_in_runway: bool(fd, "include_in_runway"),
    note: str(fd, "note") || null,
  }), "Konto anlegen");
  revalidatePath("/konten"); revalidatePath("/"); revalidatePath("/geld");
}

export async function updateAccountBalance(fd: FormData) {
  const { supabase, userId } = await requireUser();
  const accountId = str(fd, "account_id");
  const balance = numOr(fd, "balance", 0);
  const date = str(fd, "snapshot_date") || heuteISO();
  // Snapshot setzt den Kontostand an diesem Datum neu - ältere Transaktionen bleiben
  // in der Historie, zählen aber nicht mehr doppelt in den Saldo.
  await supabase.from("account_snapshots").upsert(
    { user_id: userId, account_id: accountId, snapshot_date: date, balance },
    { onConflict: "account_id,snapshot_date" }
  );
  revalidatePath("/konten"); revalidatePath("/"); revalidatePath("/geld");
}

export async function deleteAccount(fd: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("accounts").delete().eq("id", str(fd, "id"));
  revalidatePath("/konten"); revalidatePath("/"); revalidatePath("/geld");
}

/* ----------------------------------------------------------- Kategorien */

export async function createCategory(fd: FormData) {
  const { supabase, userId } = await requireUser();
  check(await supabase.from("categories").insert({
    user_id: userId,
    name: str(fd, "name"),
    kind: str(fd, "kind") || "expense",
    is_fixed: bool(fd, "is_fixed"),
    color: str(fd, "color") || "#8A8478",
    monthly_budget: numOrNull(fd, "monthly_budget"),
  }), "Kategorie anlegen");
  revalidatePath("/kategorien");
}

export async function deleteCategory(fd: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("categories").delete().eq("id", str(fd, "id"));
  revalidatePath("/kategorien");
}

/* --------------------------------------------------------- Transaktionen */

export async function createTransaction(fd: FormData) {
  const { supabase, userId } = await requireUser();
  const kind = str(fd, "kind");                 // "income" | "expense"
  const raw = Math.abs(numOr(fd, "amount", 0));
  if (raw === 0) return;
  check(await supabase.from("transactions").insert({
    user_id: userId,
    account_id: str(fd, "account_id") || null,
    category_id: str(fd, "category_id") || null,
    occurred_on: str(fd, "occurred_on") || heuteISO(),
    amount: kind === "income" ? raw : -raw,
    description: str(fd, "description"),
    counterparty: str(fd, "counterparty") || null,
    source: "manual",
  }), "Buchung anlegen");
  revalidatePath("/transaktionen"); revalidatePath("/"); revalidatePath("/geld"); revalidatePath("/runway");
}

export async function deleteTransaction(fd: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("transactions").delete().eq("id", str(fd, "id"));
  revalidatePath("/transaktionen"); revalidatePath("/"); revalidatePath("/geld"); revalidatePath("/runway");
}

export async function categorizeTransaction(fd: FormData) {
  const { supabase } = await requireUser();
  await supabase
    .from("transactions")
    .update({ category_id: str(fd, "category_id") || null })
    .eq("id", str(fd, "id"));
  revalidatePath("/transaktionen"); revalidatePath("/"); revalidatePath("/geld");
}

/* -------------------------------------------------------------- Fixkosten */

export async function createRecurring(fd: FormData) {
  const { supabase, userId } = await requireUser();
  const kind = str(fd, "kind");
  const raw = Math.abs(numOr(fd, "amount", 0));
  if (raw === 0) return;
  check(await supabase.from("recurring_items").insert({
    user_id: userId,
    label: str(fd, "label"),
    category_id: str(fd, "category_id") || null,
    account_id: str(fd, "account_id") || null,
    amount: kind === "income" ? raw : -raw,
    interval: (str(fd, "interval") || "monthly") as RecurrenceInterval,
    day_of_month: Math.min(31, Math.max(1, numOr(fd, "day_of_month", 1))),
    start_date: str(fd, "start_date") || heuteISO(),
    end_date: str(fd, "end_date") || null,
  }), "Fixkosten anlegen");
  revalidatePath("/fixkosten"); revalidatePath("/"); revalidatePath("/geld"); revalidatePath("/runway");
}

export async function toggleRecurring(fd: FormData) {
  const { supabase } = await requireUser();
  await supabase
    .from("recurring_items")
    .update({ active: str(fd, "active") === "true" })
    .eq("id", str(fd, "id"));
  revalidatePath("/fixkosten"); revalidatePath("/"); revalidatePath("/geld"); revalidatePath("/runway");
}

export async function deleteRecurring(fd: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("recurring_items").delete().eq("id", str(fd, "id"));
  revalidatePath("/fixkosten"); revalidatePath("/"); revalidatePath("/geld"); revalidatePath("/runway");
}

/* --------------------------------------------------------------- Szenarien */

export async function saveScenario(fd: FormData) {
  const { supabase, userId } = await requireUser();
  check(await supabase.from("scenarios").insert({
    user_id: userId,
    name: str(fd, "name") || "Unbenannt",
    description: str(fd, "description") || null,
    income_factor: numOr(fd, "income_factor", 1),
    expense_delta_monthly: numOr(fd, "expense_delta_monthly", 0),
    one_off_cost: numOr(fd, "one_off_cost", 0),
  }), "Szenario speichern");
  revalidatePath("/runway");
}

export async function deleteScenario(fd: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("scenarios").delete().eq("id", str(fd, "id"));
  revalidatePath("/runway");
}

/* ------------------------------------------------------------ Erst-Setup */

/** Legt Standard-Kategorien, ein Konto und die Fixkosten an. */
export async function runSetup(fd: FormData) {
  const { supabase, userId } = await requireUser();
  const liquid = numOr(fd, "liquid", 0);
  const fixedCosts = Math.abs(numOr(fd, "fixed_costs", 0));
  const today = heuteISO();

  const expenses: [string, boolean, string][] = [
    ["Wohnen", true, "#B9847A"], ["Krankenkasse", true, "#C68D6B"],
    ["Versicherungen", true, "#C4A882"], ["Abos & Telefon", true, "#A897B5"],
    ["Transport", true, "#8FA6B8"], ["Lebensmittel", false, "#7FA383"],
    ["Auswärts essen", false, "#89AFA4"], ["Gym & Gesundheit", false, "#5B8C7B"],
    ["Freizeit", false, "#BE8DA4"], ["Anschaffungen", false, "#A8A093"],
    ["Bildung", false, "#8B94B8"], ["Sonstiges", false, "#B5AE9F"],
  ];
  const incomes: [string, string][] = [
    ["Lohn", "#5B8C7B"], ["Militärsold", "#7B9C8B"],
    ["Trading", "#8FA6B8"], ["Sonstige Einnahmen", "#A8A093"],
  ];

  await supabase.from("categories").upsert(
    [
      ...expenses.map(([name, is_fixed, color], i) => ({
        user_id: userId, name, kind: "expense" as const, is_fixed, color, sort_order: i,
      })),
      ...incomes.map(([name, color], i) => ({
        user_id: userId, name, kind: "income" as const, is_fixed: false, color, sort_order: i,
      })),
    ],
    { onConflict: "user_id,name,kind", ignoreDuplicates: true }
  );

  const { data: account } = await supabase
    .from("accounts")
    .insert({
      user_id: userId, name: "Hauptkonto", type: "checking",
      opening_balance: liquid, opening_date: today, include_in_runway: true,
    })
    .select("id")
    .single();

  if (fixedCosts > 0) {
    const { data: wohnen } = await supabase
      .from("categories").select("id")
      .eq("user_id", userId).eq("name", "Wohnen").maybeSingle();
    await supabase.from("recurring_items").insert({
      user_id: userId,
      label: "Fixkosten gesamt (bitte aufteilen)",
      category_id: wohnen?.id ?? null,
      account_id: account?.id ?? null,
      amount: -fixedCosts,
      interval: "monthly",
      day_of_month: 1,
      start_date: today,
    });
  }

  revalidatePath("/"); revalidatePath("/geld"); revalidatePath("/runway"); revalidatePath("/konten");
}

/* ------------------------------------------------------------ CSV-Import */

interface ImportPayloadRow {
  occurred_on: string;
  amount: number;
  description: string;
  counterparty: string | null;
  is_transfer?: boolean;
}

export interface ImportOutcome {
  inserted: number;
  duplicates: number;
  received: number;
  error?: string;
}

export async function importTransactions(fd: FormData): Promise<ImportOutcome> {
  const { supabase, userId } = await requireUser();
  const rows = JSON.parse(String(fd.get("rows") ?? "[]")) as ImportPayloadRow[];
  if (rows.length === 0) return { inserted: 0, duplicates: 0, received: 0 };

  const accountId = str(fd, "account_id") || null;

  const [{ data: ruleRows }, { data: catRows }] = await Promise.all([
    supabase.from("import_rules").select("*").order("priority", { ascending: true }),
    supabase.from("categories").select("id, kind"),
  ]);
  const rules = ruleRows ?? [];
  const kindById = new Map((catRows ?? []).map((c) => [c.id as string, c.kind as string]));

  // Eine Regel greift nur, wenn ihre Kategorie zur Richtung passt: eine
  // TWINT-Gutschrift darf nicht in einer Ausgabenkategorie landen.
  const matchCategory = (r: ImportPayloadRow): string | null => {
    const wanted = r.amount >= 0 ? "income" : "expense";
    for (const rule of rules) {
      if (kindById.get(rule.category_id) !== wanted) continue;
      const haystack = (
        rule.match_field === "counterparty" ? r.counterparty ?? "" : r.description
      ).toLowerCase();
      const needle = String(rule.pattern).toLowerCase();
      const hit =
        rule.match_type === "regex"
          ? safeRegex(rule.pattern).test(haystack)
          : rule.match_type === "starts_with"
            ? haystack.startsWith(needle)
            : haystack.includes(needle);
      if (hit) return rule.category_id;
    }
    return null;
  };

  // Deterministischer Dedupe-Schlüssel; identische Buchungen am selben Tag
  // werden durchnummeriert, damit sie nicht fälschlich als Dublette gelten.
  const seen = new Map<string, number>();
  const payload = rows.map((r) => {
    const base = `${r.occurred_on}|${r.amount.toFixed(2)}|${r.description.slice(0, 60)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return {
      user_id: userId,
      account_id: accountId,
      // Auch Umbuchungen werden kategorisiert (Sparen, Investment) - sie
      // zählen dank is_transfer trotzdem nicht als Ausgabe.
      category_id: matchCategory(r),
      occurred_on: r.occurred_on,
      amount: r.amount,
      description: r.description,
      counterparty: r.counterparty,
      is_transfer: r.is_transfer ?? false,
      source: "csv" as const,
      external_ref: n > 1 ? `${base}#${n}` : base,
    };
  });

  let inserted = 0;
  try {
    // In Blöcken schreiben, damit auch grosse Auszüge durchgehen.
    for (let i = 0; i < payload.length; i += 200) {
      const { data, error } = await supabase
        .from("transactions")
        .upsert(payload.slice(i, i + 200), {
          onConflict: "user_id,external_ref",
          ignoreDuplicates: true,
        })
        .select("id");
      if (error) throw new Error(error.message);
      inserted += data?.length ?? 0;
    }
  } catch (e) {
    return {
      inserted,
      duplicates: 0,
      received: rows.length,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  // Gegenbuchungen für Umbuchungen auf eigene Konten. Aus einem Auszug
  // werden so beide Seiten - das Vermögen bleibt vollständig.
  if (inserted > 0) {
    const { data: transferRules } = await supabase.from("transfer_rules")
      .select("pattern, target_account_id").eq("active", true);

    const regeln = (transferRules ?? []) as {
      pattern: string; target_account_id: string;
    }[];

    if (regeln.length > 0) {
      const gegen = payload.flatMap((p) => {
        const text = `${p.description} ${p.counterparty ?? ""}`.toLowerCase();
        const regel = regeln.find(
          (r) => r.pattern.trim() && text.includes(r.pattern.trim().toLowerCase())
        );
        // Nur wenn das Zielkonto ein anderes ist als das Quellkonto
        if (!regel || regel.target_account_id === accountId) return [];
        return [{
          user_id: userId,
          account_id: regel.target_account_id,
          category_id: null,
          occurred_on: p.occurred_on,
          amount: -p.amount,
          description: `Gegenbuchung: ${p.description}`,
          counterparty: p.counterparty,
          is_transfer: true,
          source: "csv" as const,
          external_ref: `gegen:${p.external_ref}`,
        }];
      });

      if (gegen.length > 0) {
        // Quellbuchungen ebenfalls als Umbuchung markieren
        await supabase.from("transactions")
          .update({ is_transfer: true })
          .eq("user_id", userId)
          .in("external_ref", gegen.map((g) => g.external_ref.replace(/^gegen:/, "")));

        await supabase.from("transactions").upsert(gegen, {
          onConflict: "user_id,external_ref", ignoreDuplicates: true,
        });
      }
    }
  }

  // Schlusssaldo: setzt eine neue Kontostand-Basis auf das Auszugsdatum.
  // Danach stimmt das Konto auf den Rappen, auch wenn einzelne Buchungen
  // fehlen oder doppelt wären - die Basis sticht die Rechnerei.
  const saldo = numOrNull(fd, "closing_balance");
  const saldoDatum = str(fd, "closing_date")
    || rows.map((r) => r.occurred_on).sort().at(-1)
    || heuteISO();
  if (saldo !== null && accountId) {
    await supabase.from("account_snapshots").upsert(
      { user_id: userId, account_id: accountId, snapshot_date: saldoDatum, balance: saldo },
      { onConflict: "account_id,snapshot_date" }
    );
  }

  revalidatePath("/transaktionen"); revalidatePath("/"); revalidatePath("/geld"); revalidatePath("/runway");
  revalidatePath("/konten");

  return {
    inserted,
    duplicates: rows.length - inserted,
    received: rows.length,
  };
}

function safeRegex(pattern: string): RegExp {
  try { return new RegExp(pattern, "i"); } catch { return /$^/; }
}

/* ------------------------------------------------------- Umbuchungsregeln */

export async function createTransferRule(fd: FormData) {
  const { supabase, userId } = await requireUser();
  const pattern = str(fd, "pattern");
  const target = str(fd, "target_account_id");
  if (!pattern || !target) return;
  check(await supabase.from("transfer_rules").insert({
    user_id: userId, pattern, target_account_id: target,
  }), "Umbuchungsregel anlegen");
  revalidatePath("/import");
}

export async function deleteTransferRule(fd: FormData) {
  const { supabase, userId } = await requireUser();
  await supabase.from("transfer_rules")
    .delete().eq("id", str(fd, "id")).eq("user_id", userId);
  revalidatePath("/import");
}

export async function createImportRule(fd: FormData) {
  const { supabase, userId } = await requireUser();
  check(await supabase.from("import_rules").insert({
    user_id: userId,
    pattern: str(fd, "pattern"),
    match_field: str(fd, "match_field") || "description",
    match_type: str(fd, "match_type") || "contains",
    category_id: str(fd, "category_id"),
    priority: numOr(fd, "priority", 100),
  }), "Regel anlegen");
  revalidatePath("/import");
}

export async function deleteImportRule(fd: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("import_rules").delete().eq("id", str(fd, "id"));
  revalidatePath("/import");
}

/** Wendet die Regeln auf alle noch nicht kategorisierten Buchungen an. */
export async function applyRulesToUncategorized() {
  const { supabase, userId } = await requireUser();
  const [{ data: rules }, { data: cats }, { data: txns }] = await Promise.all([
    supabase.from("import_rules").select("*").order("priority"),
    supabase.from("categories").select("id, kind"),
    // Alle offenen Buchungen holen, nicht nur die ersten paar tausend -
    // ein Vierjahres-Import bringt deutlich mehr mit.
    supabase.from("transactions").select("id, description, counterparty, amount")
      .is("category_id", null).limit(20000),
  ]);
  if (!rules?.length || !txns?.length) return;
  const kindById = new Map((cats ?? []).map((c) => [c.id as string, c.kind as string]));

  // Nach Zielkategorie bündeln, damit statt tausend Einzelupdates
  // nur eine Handvoll Aktualisierungen nötig sind.
  const buckets = new Map<string, string[]>();

  for (const t of txns) {
    const wanted = Number(t.amount) >= 0 ? "income" : "expense";
    for (const rule of rules) {
      if (kindById.get(rule.category_id) !== wanted) continue;
      const haystack = (
        rule.match_field === "counterparty" ? t.counterparty ?? "" : t.description ?? ""
      ).toLowerCase();
      const needle = String(rule.pattern).toLowerCase();
      const hit =
        rule.match_type === "regex"
          ? safeRegex(rule.pattern).test(haystack)
          : rule.match_type === "starts_with"
            ? haystack.startsWith(needle)
            : haystack.includes(needle);
      if (hit) {
        const list = buckets.get(rule.category_id) ?? [];
        list.push(t.id as string);
        buckets.set(rule.category_id, list);
        break;
      }
    }
  }

  for (const [categoryId, ids] of buckets) {
    for (let i = 0; i < ids.length; i += 200) {
      check(await supabase.from("transactions")
        .update({ category_id: categoryId })
        .eq("user_id", userId)
        .in("id", ids.slice(i, i + 200)), "Kategorien zuordnen");
    }
  }

  revalidatePath("/transaktionen"); revalidatePath("/geld"); revalidatePath("/"); revalidatePath("/geld");
}

/* =========================================================== Zeit-Modul */

const TIME_PATHS = ["/zeit", "/woche", "/kalender", "/", "/aktivitaeten"];
const revalidateTime = () => TIME_PATHS.forEach((p) => revalidatePath(p));

/** Legt das Standard-Set an Aktivitäten an. Bereits vorhandene bleiben unberührt. */
export async function seedActivities() {
  const { supabase, userId } = await requireUser();

  // Profil sicherstellen - die Tagesauswertung braucht die Standard-Schlafdauer.
  await supabase.from("profiles").upsert({ id: userId }, { onConflict: "id", ignoreDuplicates: true });

  const seed: {
    name: string; bucket: string; kind: string; color: string;
    counts_toward_goal?: boolean; hourly_rate?: number; is_sleep?: boolean;
  }[] = [
    // Schlaf - im Kalender erfassbar, zählt aber nicht als Wachzeit
    { name: "Schlafen", bucket: "regeneration", kind: "life", color: "#C9C2B2", is_sleep: true },
    // Ziele
    { name: "Trading & Backtest", bucket: "ziel", kind: "trading", color: "#5B8C7B", counts_toward_goal: true },
    { name: "Coding-Projekte",    bucket: "ziel", kind: "project", color: "#4A7566", counts_toward_goal: true },
    { name: "Lernen / Berufsmatura", bucket: "ziel", kind: "learning", color: "#7B9C8B", counts_toward_goal: true },
    { name: "Gym Rhino",          bucket: "ziel", kind: "training", color: "#6E9B76", counts_toward_goal: true },
    { name: "Laufen / Ausdauer",  bucket: "ziel", kind: "training", color: "#89AFA4", counts_toward_goal: true },
    // Arbeit
    { name: "Besenval (Schicht)", bucket: "arbeit", kind: "job", color: "#C4A882" },
    { name: "Arbeitsweg",         bucket: "arbeit", kind: "job", color: "#D3BC9C" },
    // Pflicht
    { name: "Morgenroutine",      bucket: "pflicht", kind: "admin", color: "#9B948A" },
    { name: "Haushalt",           bucket: "pflicht", kind: "admin", color: "#A8A093" },
    { name: "Einkaufen & Meal Prep", bucket: "pflicht", kind: "admin", color: "#B5AE9F" },
    { name: "Admin & Papierkram", bucket: "pflicht", kind: "admin", color: "#8E877D" },
    // Regeneration
    { name: "Ruhen & Nichtstun",  bucket: "regeneration", kind: "life", color: "#8FA6B8" },
    { name: "Essen",              bucket: "regeneration", kind: "life", color: "#A5B8C6" },
    // Sozial
    { name: "Familie & Freunde",  bucket: "sozial", kind: "life", color: "#D2A05F" },
    { name: "Telefonieren",       bucket: "sozial", kind: "life", color: "#DDB47E" },
    // Spass
    { name: "Serien & Filme",     bucket: "spass", kind: "life", color: "#BE8DA4" },
    { name: "Gaming",             bucket: "spass", kind: "life", color: "#C79BB2" },
    { name: "Lesen",              bucket: "spass", kind: "life", color: "#D3AEC0" },
    // Leerlauf
    { name: "Handy / Scrollen",   bucket: "leerlauf", kind: "life", color: "#B9847A" },
    { name: "Warten & Leerlauf",  bucket: "leerlauf", kind: "life", color: "#C79B92" },
  ];

  check(await supabase.from("activities").upsert(
    seed.map((a, i) => ({
      user_id: userId,
      name: a.name,
      bucket: a.bucket,
      kind: a.kind,
      color: a.color,
      counts_toward_goal: a.counts_toward_goal ?? false,
      hourly_rate: a.hourly_rate ?? null,
      is_sleep: a.is_sleep ?? false,
      sort_order: i,
    })),
    { onConflict: "user_id,name", ignoreDuplicates: true }
  ), "Aktivitäten anlegen");

  revalidateTime();
}

export async function createActivity(fd: FormData) {
  const { supabase, userId } = await requireUser();
  check(await supabase.from("activities").insert({
    user_id: userId,
    name: str(fd, "name"),
    bucket: str(fd, "bucket") || "pflicht",
    kind: str(fd, "kind") || "project",
    color: str(fd, "color") || "#8A8478",
    counts_toward_goal: bool(fd, "counts_toward_goal"),
    hourly_rate: numOrNull(fd, "hourly_rate"),
  }), "Aktivität anlegen");
  revalidateTime();
}

export async function updateActivity(fd: FormData) {
  const { supabase } = await requireUser();
  check(await supabase.from("activities").update({
    name: str(fd, "name"),
    bucket: str(fd, "bucket"),
    color: str(fd, "color"),
    counts_toward_goal: bool(fd, "counts_toward_goal"),
    is_sleep: bool(fd, "is_sleep"),
    hourly_rate: numOrNull(fd, "hourly_rate"),
  }).eq("id", str(fd, "id")), "Aktivität speichern");
  revalidateTime();
}

export async function archiveActivity(fd: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("activities").update({ archived: true }).eq("id", str(fd, "id"));
  revalidateTime();
}

/**
 * Bucht Zeit auf eine Aktivität. Existiert für Tag und Aktivität bereits ein
 * manueller Eintrag, wird aufaddiert - so bleibt die Tagesliste kurz.
 * Negative Werte ziehen ab; sinkt der Eintrag auf null, verschwindet er.
 */
export async function addTime(fd: FormData) {
  const { supabase, userId } = await requireUser();
  const activityId = str(fd, "activity_id");
  const date = str(fd, "entry_date") || heuteISO();
  const delta = Math.round(numOr(fd, "minutes", 0));
  if (!activityId || delta === 0) return;

  const { data: existing } = await supabase
    .from("time_entries")
    .select("id, minutes")
    .eq("user_id", userId)
    .eq("activity_id", activityId)
    .eq("entry_date", date)
    .eq("source", "manual")
    .maybeSingle();

  if (existing) {
    const next = existing.minutes + delta;
    if (next <= 0) {
      await supabase.from("time_entries").delete().eq("id", existing.id);
    } else {
      await supabase.from("time_entries")
        .update({ minutes: Math.min(next, 1440) })
        .eq("id", existing.id);
    }
  } else if (delta > 0) {
    await supabase.from("time_entries").insert({
      user_id: userId,
      activity_id: activityId,
      entry_date: date,
      minutes: Math.min(delta, 1440),
      source: "manual",
      confirmed: true,
    });
  }
  revalidateTime();
}

export async function setTimeEntryMinutes(fd: FormData) {
  const { supabase } = await requireUser();
  const minutes = Math.round(numOr(fd, "minutes", 0));
  const id = str(fd, "id");
  if (minutes <= 0) {
    await supabase.from("time_entries").delete().eq("id", id);
  } else {
    await supabase.from("time_entries")
      .update({ minutes: Math.min(minutes, 1440), note: str(fd, "note") || null })
      .eq("id", id);
  }
  revalidateTime();
}

export async function deleteTimeEntry(fd: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("time_entries").delete().eq("id", str(fd, "id"));
  revalidateTime();
}

/* ------------------------------------------------------------- Schichten */
// Eine Schicht = benannte Arbeitsblöcke (mit oder ohne Zimmerstunde) plus
// optionaler Arbeitsweg. "Eintragen" materialisiert sie als normale
// Zeiteinträge - danach wie gewohnt änderbar und löschbar.

const timeToMin = (s: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v >= 0 && v <= 1439 ? v : null;
};

export async function createShift(fd: FormData) {
  const { supabase, userId } = await requireUser();
  const name = str(fd, "name");
  const activityId = str(fd, "activity_id");
  if (!name || !activityId) return;

  const blocks: { start: number; minutes: number }[] = [];
  for (const i of [1, 2]) {
    const von = timeToMin(str(fd, `von${i}`));
    const bis = timeToMin(str(fd, `bis${i}`));
    if (von !== null && bis !== null && bis > von) {
      blocks.push({ start: von, minutes: bis - von });
    }
  }
  if (blocks.length === 0) return;

  check(await supabase.from("shifts").insert({
    user_id: userId,
    name,
    activity_id: activityId,
    blocks,
    weg_minutes: Math.max(0, Math.round(numOr(fd, "weg_minutes", 0))),
    weg_activity_id: str(fd, "weg_activity_id") || null,
  }), "Schicht anlegen");
  revalidatePath("/schichten");
}

export async function deleteShift(fd: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("shifts").delete().eq("id", str(fd, "id"));
  revalidatePath("/schichten");
}

/** Trägt eine Schicht an einem Tag ein - Blöcke + optionaler Arbeitsweg. */
export async function applyShift(fd: FormData) {
  const { supabase, userId } = await requireUser();
  const shiftId = str(fd, "shift_id");
  const date = str(fd, "entry_date");
  if (!shiftId || !date) return;

  const { data: shift } = await supabase.from("shifts")
    .select("*").eq("id", shiftId).eq("user_id", userId).maybeSingle();
  if (!shift?.activity_id) return;

  // blocks ist jsonb - was von Hand in der DB geändert wurde, könnte alles
  // sein. Deshalb hier prüfen statt blind zu vertrauen: sonst landen NaN oder
  // negative Minuten als Zeiteintrag.
  const blocks = ((shift.blocks ?? []) as unknown[])
    .map((b) => b as { start?: unknown; minutes?: unknown })
    .filter((b) =>
      typeof b.start === "number" && Number.isFinite(b.start) &&
      b.start >= 0 && b.start <= 1439 &&
      typeof b.minutes === "number" && Number.isFinite(b.minutes) && b.minutes > 0
    )
    .map((b) => ({ start: b.start as number, minutes: b.minutes as number }))
    .sort((a, b) => a.start - b.start);
  if (blocks.length === 0) return;

  const base = {
    user_id: userId, entry_date: date,
    source: "manual" as const, confirmed: true,
  };
  const rows: Record<string, unknown>[] = blocks.map((b) => ({
    ...base,
    activity_id: shift.activity_id,
    start_minute: b.start,
    minutes: Math.min(b.minutes, 1440 - b.start),
    note: shift.name,
  }));

  // Arbeitsweg: vor dem ersten und nach dem letzten Block
  const weg = Number(shift.weg_minutes ?? 0);
  if (weg > 0 && shift.weg_activity_id) {
    const first = blocks[0];
    const last = blocks[blocks.length - 1];
    const hinStart = Math.max(0, first.start - weg);
    if (first.start - hinStart > 0) {
      rows.push({ ...base, activity_id: shift.weg_activity_id,
        start_minute: hinStart, minutes: first.start - hinStart, note: "Arbeitsweg" });
    }
    const endeLast = Math.min(last.start + last.minutes, 1439);
    const rueckMin = Math.min(weg, 1440 - endeLast);
    if (rueckMin > 0) {
      rows.push({ ...base, activity_id: shift.weg_activity_id,
        start_minute: endeLast, minutes: rueckMin, note: "Arbeitsweg" });
    }
  }

  // Doppelklick-Schutz: Blöcke überspringen, die an diesem Tag schon mit
  // derselben Startzeit stehen - zweimal eingetragen hiesse doppelte
  // Arbeitszeit in jeder Auswertung.
  const { data: vorhanden } = await supabase.from("time_entries")
    .select("start_minute, activity_id")
    .eq("user_id", userId).eq("entry_date", date);
  const belegt = new Set(
    (vorhanden ?? []).map((e) => `${e.activity_id}|${e.start_minute}`)
  );
  const neu = rows.filter((r) => !belegt.has(`${r.activity_id}|${r.start_minute}`));

  if (neu.length === 0) {
    throw new Error("Diese Schicht steht an diesem Tag bereits im Kalender.");
  }

  check(await supabase.from("time_entries").insert(neu), "Schicht eintragen");
  revalidateTime(); revalidatePath("/kalender"); revalidatePath("/schichten");
}

export async function saveCheckin(fd: FormData) {
  const { supabase, userId } = await requireUser();
  const date = str(fd, "entry_date") || heuteISO();
  await supabase.from("day_checkins").upsert(
    {
      user_id: userId,
      entry_date: date,
      sleep_hours: numOrNull(fd, "sleep_hours"),
      energy: numOrNull(fd, "energy"),
      note: str(fd, "note") || null,
    },
    { onConflict: "user_id,entry_date" }
  );
  revalidateTime();
}

/** Verknüpft eine Aktivität mit einer Buchung - Grundlage der Stundenwert-Matrix. */
export async function linkTransactionToActivity(fd: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("transactions")
    .update({ activity_id: str(fd, "activity_id") || null })
    .eq("id", str(fd, "id"));
  revalidatePath("/transaktionen"); revalidatePath("/woche");
}

/** Farbe, Art und Eigenschaften jeder Kategorie, die eine Regel braucht. */
const CATEGORY_DEFS: Record<
  string,
  { kind: "income" | "expense"; color: string; isFixed?: boolean; isSavings?: boolean }
> = {
  // Fixe Verpflichtungen
  "Wohnen":              { kind: "expense", color: "#B9847A", isFixed: true },
  "Krankenkasse":        { kind: "expense", color: "#C68D6B", isFixed: true },
  "Versicherungen":      { kind: "expense", color: "#C4A882", isFixed: true },
  "Abos & Telefon":      { kind: "expense", color: "#A897B5", isFixed: true },
  // Laufende Ausgaben
  "Lebensmittel":        { kind: "expense", color: "#7FA383" },
  "Auswärts essen":      { kind: "expense", color: "#89AFA4" },
  "Transport":           { kind: "expense", color: "#8FA6B8" },
  "Tankstelle":          { kind: "expense", color: "#C68D6B" },
  "Gym & Gesundheit":    { kind: "expense", color: "#5B8C7B" },
  "Freizeit":            { kind: "expense", color: "#BE8DA4" },
  "Anschaffungen":       { kind: "expense", color: "#A8A093" },
  "Bildung":             { kind: "expense", color: "#8B94B8" },
  "Online-Einkauf":      { kind: "expense", color: "#8B94B8" },
  "TWINT":               { kind: "expense", color: "#A897B5" },
  "Bargeldbezug":        { kind: "expense", color: "#B5AE9F" },
  "Sonstiges":           { kind: "expense", color: "#B5AE9F" },
  // Vermögen verschieben, kein Konsum
  "Investment":          { kind: "expense", color: "#5B8C7B", isSavings: true },
  "Sparen":              { kind: "expense", color: "#7B9C8B", isSavings: true },
  // Einnahmen
  "Lohn":                { kind: "income",  color: "#5B8C7B" },
  "Militärsold":         { kind: "income",  color: "#7B9C8B" },
  "Trading":             { kind: "income",  color: "#8FA6B8" },
  "Sonstige Einnahmen":  { kind: "income",  color: "#A8A093" },
};

/**
 * Legt Kategorien und Zuordnungs-Regeln an.
 *
 * Die Priorität entscheidet: kleine Zahl gewinnt. Konkrete Händler stehen vorn,
 * Sammelbegriffe wie "Online Einkauf" oder "TWINT" ganz hinten — sonst würde
 * "Online Einkauf ANTHROPIC" als Online-Einkauf statt als Bildung landen.
 */
export async function seedImportRules() {
  const { supabase, userId } = await requireUser();

  // [Muster, Kategorie, Priorität]
  const rules: [string, string, number][] = [
    // --- Vermögen verschieben ---
    ["übertrag auf fondssparkonto", "Investment", 10],
    ["fondssparkonto", "Investment", 11],
    ["auslandszahlung", "Investment", 12],
    ["bitget", "Investment", 13],
    ["übertrag auf youngmember", "Sparen", 15],
    ["youngmember", "Sparen", 16],

    // --- Einnahmen ---
    ["vogl gastronomie", "Lohn", 20],
    ["baseltor", "Lohn", 21],
    ["lohn", "Lohn", 22],
    ["truppenrechnungswesen", "Militärsold", 23],
    ["soldbeleg", "Militärsold", 24],

    // --- Feste Verpflichtungen ---
    ["alur pamela", "Wohnen", 25],
    ["dauerauftrag", "Wohnen", 26],
    ["helvetia", "Versicherungen", 27],
    ["krankenkasse", "Krankenkasse", 28],
    ["css ", "Krankenkasse", 29],

    // --- Programmieren und Werkzeuge ---
    ["anthropic", "Bildung", 30],
    ["claude", "Bildung", 31],
    ["github", "Bildung", 32],
    ["google cloud", "Bildung", 33],
    ["openai", "Bildung", 34],
    ["vercel", "Bildung", 35],
    ["supabase", "Bildung", 36],
    ["tradingview", "Bildung", 37],
    ["cursor", "Bildung", 38],

    // --- Konkrete Händler ---
    ["ayfer tasdemir", "Lebensmittel", 40],
    ["müller handels", "Lebensmittel", 41],
    ["gelateria", "Lebensmittel", 42],
    ["kaufland", "Lebensmittel", 43],
    ["bike discount", "Transport", 44],
    ["moto center", "Transport", 45],
    ["freibad", "Sonstiges", 46],
    ["chillounge", "Freizeit", 47],
    ["bowling", "Freizeit", 48],
    ["rossmann", "Gym & Gesundheit", 49],

    // --- Tankstellen vor Lebensmitteln, sonst schluckt "coop" die Coop-Tankstelle ---
    ["coop tankstelle", "Tankstelle", 50],
    ["coop pronto", "Tankstelle", 51],
    ["socar", "Tankstelle", 52],
    ["avia", "Tankstelle", 53],
    ["migrol", "Tankstelle", 54],
    ["tankstelle", "Tankstelle", 55],
    ["agrola", "Tankstelle", 56],
    ["shell", "Tankstelle", 57],

    // --- Gruppen ---
    ["coop", "Lebensmittel", 60],
    ["migros", "Lebensmittel", 61],
    ["aldi", "Lebensmittel", 62],
    ["denner", "Lebensmittel", 63],
    ["spar dankt", "Lebensmittel", 64],
    ["lidl", "Lebensmittel", 65],
    ["volg", "Lebensmittel", 66],
    ["getr", "Lebensmittel", 67],

    ["justeat", "Auswärts essen", 68],
    ["yoordi", "Auswärts essen", 69],
    ["kantine", "Auswärts essen", 70],
    ["selecta", "Auswärts essen", 71],
    ["kiosk", "Auswärts essen", 72],
    ["burger king", "Auswärts essen", 73],
    ["mcdonald", "Auswärts essen", 74],
    ["sushi", "Auswärts essen", 75],
    ["restaurant", "Auswärts essen", 76],
    ["chicken", "Auswärts essen", 77],
    ["bar-", "Auswärts essen", 78],

    ["sbb", "Transport", 79],
    ["parkingpay", "Transport", 80],
    ["postauto", "Transport", 81],

    ["netflix", "Abos & Telefon", 82],
    ["spotify", "Abos & Telefon", 83],
    ["google one", "Abos & Telefon", 84],
    ["swisscom", "Abos & Telefon", 85],
    ["salt", "Abos & Telefon", 86],
    ["icloud", "Abos & Telefon", 87],

    ["digitec", "Anschaffungen", 88],
    ["galaxus", "Anschaffungen", 89],
    ["decathlon", "Anschaffungen", 90],
    ["zalando", "Anschaffungen", 91],
    ["polo filiale", "Anschaffungen", 92],
    ["army shop", "Anschaffungen", 93],

    ["apotheke", "Gym & Gesundheit", 94],
    ["drogerie", "Gym & Gesundheit", 95],
    ["rhino", "Gym & Gesundheit", 96],
    ["update fitness", "Gym & Gesundheit", 97],
    ["coiffeur", "Gym & Gesundheit", 98],

    ["brawl", "Freizeit", 100],
    ["clash royale", "Freizeit", 101],
    ["ticketcorner", "Freizeit", 102],
    ["steam", "Freizeit", 103],

    // --- Auffangregeln ganz am Schluss ---
    ["bancomat bezug", "Bargeldbezug", 150],
    ["online einkauf", "Online-Einkauf", 160],
    ["twint", "TWINT", 161],
    ["einzahlung", "Sonstige Einnahmen", 170],
    ["gutschrift", "Sonstige Einnahmen", 171],
  ];

  // Jede Kategorie anlegen, die eine Regel braucht. Fehlte sie bisher, wurde
  // die Regel stillschweigend übersprungen - genau das soll nicht passieren.
  const benoetigt = [...new Set(rules.map(([, category]) => category))];
  const unbekannt = benoetigt.filter((name) => !CATEGORY_DEFS[name]);
  if (unbekannt.length > 0) {
    throw new Error(`Kategorie ohne Definition: ${unbekannt.join(", ")}`);
  }

  check(await supabase.from("categories").upsert(
    benoetigt.map((name, i) => {
      const def = CATEGORY_DEFS[name];
      return {
        user_id: userId, name, kind: def.kind, color: def.color,
        is_fixed: def.isFixed ?? false, is_savings: def.isSavings ?? false,
        sort_order: i,
      };
    }),
    { onConflict: "user_id,name,kind", ignoreDuplicates: true }
  ), "Kategorien anlegen");

  const { data: cats } = await supabase
    .from("categories").select("id, name, kind").eq("user_id", userId);
  const byKey = new Map((cats ?? []).map((c) => [`${c.name}|${c.kind}`, c.id as string]));

  const payload = rules.map(([pattern, category, priority]) => {
    const def = CATEGORY_DEFS[category];
    const categoryId = byKey.get(`${category}|${def.kind}`);
    if (!categoryId) throw new Error(`Kategorie fehlt nach dem Anlegen: ${category}`);
    return {
      user_id: userId, pattern,
      match_field: "description" as const,
      match_type: "contains" as const,
      category_id: categoryId, priority,
    };
  });

  // Vorhandene Regeln ersetzen, damit ein zweiter Aufruf keine Dubletten baut
  await supabase.from("import_rules").delete().eq("user_id", userId);
  check(await supabase.from("import_rules").insert(payload), "Regeln anlegen");

  revalidatePath("/import"); revalidatePath("/kategorien");
}

/** Markiert eine Buchung als Umbuchung zwischen eigenen Konten (oder hebt das auf). */
export async function toggleTransfer(fd: FormData) {
  const { supabase } = await requireUser();
  const makeTransfer = str(fd, "is_transfer") === "true";
  // Die Kategorie bleibt erhalten: eine Umbuchung auf das Sparkonto ist
  // "Sparen" und soll auch so sichtbar sein - sie zählt nur nicht als Ausgabe.
  await supabase.from("transactions")
    .update({ is_transfer: makeTransfer })
    .eq("id", str(fd, "id"));
  revalidatePath("/transaktionen"); revalidatePath("/"); revalidatePath("/geld"); revalidatePath("/runway");
}

/** Ordnet eine Buchung einem anderen Konto zu. */
export async function moveTransactionToAccount(fd: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("transactions")
    .update({ account_id: str(fd, "account_id") || null })
    .eq("id", str(fd, "id"));
  revalidatePath("/transaktionen"); revalidatePath("/konten"); revalidatePath("/"); revalidatePath("/geld");
}

/** Setzt oder entfernt die Startzeit eines Zeiteintrags ("HH:MM" oder leer). */
export async function setEntryStart(fd: FormData) {
  const { supabase } = await requireUser();
  const raw = str(fd, "start");
  let startMinute: number | null = null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (m) {
    const value = Number(m[1]) * 60 + Number(m[2]);
    if (value >= 0 && value <= 1439) startMinute = value;
  }
  await supabase.from("time_entries")
    .update({ start_minute: startMinute })
    .eq("id", str(fd, "id"));
  revalidateTime(); revalidatePath("/kalender");
}

/** Setzt Start und Ende eines Eintrags neu - zum Korrigieren von Fehlern. */
export async function setEntryRange(fd: FormData) {
  const { supabase } = await requireUser();
  const id = str(fd, "id");
  const von = /^(\d{1,2}):(\d{2})$/.exec(str(fd, "von"));
  const bis = /^(\d{1,2}):(\d{2})$/.exec(str(fd, "bis"));
  if (!id || !von || !bis) return;

  const start = Number(von[1]) * 60 + Number(von[2]);
  const end = Number(bis[1]) * 60 + Number(bis[2]);
  if (start < 0 || start > 1439 || end <= start) return;

  await supabase.from("time_entries")
    .update({ start_minute: start, minutes: Math.min(end - start, 1440 - start) })
    .eq("id", id);
  revalidateTime(); revalidatePath("/kalender"); revalidatePath("/heute");
}

/** Legt einen Zeiteintrag mit Uhrzeit an - für die Kalenderansicht. */
export async function addTimedEntry(fd: FormData) {
  const { supabase, userId } = await requireUser();
  const activityId = str(fd, "activity_id");
  const date = str(fd, "entry_date");
  const minutes = Math.round(numOr(fd, "minutes", 0));
  if (!activityId || !date || minutes <= 0) return;

  let startMinute: number | null = null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(str(fd, "start"));
  if (m) startMinute = Number(m[1]) * 60 + Number(m[2]);

  check(await supabase.from("time_entries").insert({
    user_id: userId,
    activity_id: activityId,
    entry_date: date,
    minutes: Math.min(minutes, 1440),
    start_minute: startMinute,
    note: str(fd, "note") || null,
    source: "manual",
    confirmed: true,
  }), "Zeiteintrag anlegen");
  revalidateTime(); revalidatePath("/kalender");
}

/**
 * Übernimmt einen erkannten Posten in die Fixkosten — mit dem Rhythmus, der
 * sich aus den tatsächlichen Abständen ergibt, nicht pauschal monatlich.
 * Die zugehörige Kategorie wird gleich als Fixkosten-Kategorie markiert.
 */
export async function adoptRecurringCandidate(fd: FormData) {
  const { supabase, userId } = await requireUser();
  const raw = numOr(fd, "amount", 0);
  if (raw === 0) return;

  const categoryId = str(fd, "category_id") || null;
  const interval = (str(fd, "interval") || "monthly") as RecurrenceInterval;
  const day = Math.min(31, Math.max(1, numOr(fd, "day_of_month", 1)));

  check(await supabase.from("recurring_items").insert({
    user_id: userId,
    label: str(fd, "label").slice(0, 80),
    category_id: categoryId,
    account_id: str(fd, "account_id") || null,
    // Vorzeichen beibehalten: auch feste Einnahmen sind wiederkehrende Posten
    amount: raw,
    interval,
    day_of_month: day,
    start_date: str(fd, "start_date") || heuteISO(),
  }), "Fixkosten übernehmen");

  if (categoryId && raw < 0) {
    await supabase.from("categories").update({ is_fixed: true }).eq("id", categoryId);
  }

  revalidatePath("/fixkosten"); revalidatePath("/geld");
  revalidatePath("/runway"); revalidatePath("/kategorien");
}

/* =========================================================== Navigator */

export async function createLink(fd: FormData) {
  const { supabase, userId } = await requireUser();
  check(await supabase.from("links").insert({
    user_id: userId,
    title: str(fd, "title"),
    subtitle: str(fd, "subtitle") || null,
    kind: str(fd, "kind") || "web",
    target: str(fd, "target"),
    group_name: str(fd, "group_name") || "Projekte",
    icon: str(fd, "icon") || null,
    color: str(fd, "color") || "#5B8C7B",
    sort_order: numOr(fd, "sort_order", 100),
    activity_id: str(fd, "activity_id") || null,
    track_time: str(fd, "activity_id") !== "",
  }), "Link anlegen");
  revalidatePath("/"); revalidatePath("/links");
}

export async function updateLink(fd: FormData) {
  const { supabase } = await requireUser();
  // Die Aktivität gehört bewusst in dasselbe Formular wie der Rest:
  // zwei Speicherknöpfe nebeneinander führen sonst dazu, dass eine
  // Auswahl still verloren geht.
  const activityId = str(fd, "activity_id") || null;
  check(await supabase.from("links").update({
    title: str(fd, "title"),
    subtitle: str(fd, "subtitle") || null,
    kind: str(fd, "kind"),
    target: str(fd, "target"),
    group_name: str(fd, "group_name"),
    icon: str(fd, "icon") || null,
    color: str(fd, "color"),
    sort_order: numOr(fd, "sort_order", 100),
    activity_id: activityId,
    track_time: activityId !== null,
  }).eq("id", str(fd, "id")), "Link speichern");
  revalidatePath("/"); revalidatePath("/links");
}

export async function deleteLink(fd: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("links").delete().eq("id", str(fd, "id"));
  revalidatePath("/"); revalidatePath("/links");
}

/** Zählt einen Aufruf mit, damit "zuletzt benutzt" sich selbst sortiert. */
export async function registerLinkOpen(id: string) {
  const { supabase } = await requireUser();
  await supabase.rpc("register_link_open", { link_id: id });
}

/** Legt die Startkacheln an: Bereiche, deployte Apps, Werkzeuge, Ordner. */
export async function seedLinks() {
  const { supabase, userId } = await requireUser();

  // Gruppen sind Modi: die Startseite zeigt pro Gruppe einen Einstieg,
  // /m/[gruppe] ist der Arbeitsplatz mit allen Kacheln des Modus.
  const seed: {
    title: string; subtitle: string; kind: string; target: string;
    group_name: string; icon: string; color: string; sort_order: number;
  }[] = [
    // Traden
    { title: "Trading", subtitle: "GVA-Board, Backtest", kind: "section",
      target: "/trading", group_name: "Traden", icon: "◈", color: "#8B94B8", sort_order: 1 },
    { title: "GVA Screener", subtitle: "Aktive Setups, London und New York", kind: "web",
      target: "https://gva-screener-kerim-alurs-projects.vercel.app",
      group_name: "Traden", icon: "◈", color: "#8B94B8", sort_order: 2 },
    { title: "TradingView", subtitle: "Charts", kind: "web",
      target: "https://www.tradingview.com/chart/",
      group_name: "Traden", icon: "◔", color: "#8FA6B8", sort_order: 3 },

    // Programmieren
    { title: "Claude", subtitle: "claude.ai", kind: "web",
      target: "https://claude.ai",
      group_name: "Programmieren", icon: "✳", color: "#C68D6B", sort_order: 1 },
    { title: "Vercel", subtitle: "Deployments", kind: "web",
      target: "https://vercel.com/kerim-alurs-projects",
      group_name: "Programmieren", icon: "△", color: "#A8A093", sort_order: 2 },
    { title: "Supabase", subtitle: "Datenbanken", kind: "web",
      target: "https://supabase.com/dashboard/org/qxzrvonguaeewuxwspwg",
      group_name: "Programmieren", icon: "◭", color: "#6E9B76", sort_order: 3 },
    { title: "GitHub", subtitle: "Repositories", kind: "web",
      target: "https://github.com/kerimalur",
      group_name: "Programmieren", icon: "◐", color: "#8A8478", sort_order: 4 },
    { title: "Projekte", subtitle: "Hauptordner", kind: "folder",
      target: "C:\\Projekte\\Claude Cowork",
      group_name: "Programmieren", icon: "▭", color: "#A8A093", sort_order: 5 },
    // Quellcode-Ordner gehören ausschliesslich hierher - in den Sach-Modi
    // (Traden, Essen, Gym) will man arbeiten, nicht programmieren.
    { title: "KerimOS Code", subtitle: "diese App", kind: "folder",
      target: "C:\\Projekte\\Claude Cowork\\Kompass",
      group_name: "Programmieren", icon: "▭", color: "#A8A093", sort_order: 6 },
    { title: "GVA Screener Code", subtitle: "Quellcode", kind: "folder",
      target: "C:\\Projekte\\Claude Cowork\\GVA-Screener",
      group_name: "Programmieren", icon: "▭", color: "#A8A093", sort_order: 7 },
    { title: "Menüplan Code", subtitle: "Quellcode", kind: "folder",
      target: "C:\\Projekte\\Claude Cowork\\Men-plan\\Men-plan",
      group_name: "Programmieren", icon: "▭", color: "#A8A093", sort_order: 8 },
    { title: "Gym-Tracker Code", subtitle: "Quellcode", kind: "folder",
      target: "C:\\Projekte\\Claude Cowork\\Gymapp-vereinfacht",
      group_name: "Programmieren", icon: "▭", color: "#A8A093", sort_order: 9 },

    // Gym
    { title: "Gym", subtitle: "Fortschritt je Übung", kind: "section",
      target: "/gym", group_name: "Gym", icon: "▲", color: "#C68D6B", sort_order: 1 },
    { title: "Gym-Tracker", subtitle: "Training, Fortschritt, Erholung", kind: "web",
      target: "https://gymapp-vereinfacht-kerim-alurs-projects.vercel.app",
      group_name: "Gym", icon: "▲", color: "#6E9B76", sort_order: 2 },

    // Essen
    { title: "Menüplan", subtitle: "Meal Prep, Rezepte, Einkauf", kind: "web",
      target: "https://men-plan-kerim-alurs-projects.vercel.app",
      group_name: "Essen", icon: "▤", color: "#C4A882", sort_order: 1 },

    // Geld
    { title: "Geld", subtitle: "Runway, Konten, Buchungen", kind: "section",
      target: "/geld", group_name: "Geld", icon: "₣", color: "#5B8C7B", sort_order: 1 },

    // Zeit
    { title: "Zeit", subtitle: "Kalender, Woche, Stundenwert", kind: "section",
      target: "/zeit", group_name: "Zeit", icon: "◷", color: "#8FA6B8", sort_order: 1 },

    // Lernen
    { title: "Berufsmatura 27", subtitle: "Unterlagen", kind: "folder",
      target: "C:\\Projekte\\Claude Cowork\\Berufsmatura27",
      group_name: "Lernen", icon: "▭", color: "#A8A093", sort_order: 1 },
  ];

  // Nur anlegen, was noch fehlt. Ein zweiter Aufruf soll nichts verdoppeln -
  // sonst stehen Bilder und Nutzungszähler plötzlich auf einer Kopie.
  const { data: vorhanden } = await supabase
    .from("links").select("target").eq("user_id", userId);
  const bekannt = new Set((vorhanden ?? []).map((l) => String(l.target)));

  const neu = seed.filter((l) => !bekannt.has(l.target));
  if (neu.length > 0) {
    check(await supabase.from("links").insert(
      neu.map((l) => ({ ...l, user_id: userId }))
    ), "Kacheln anlegen");
  }
  revalidatePath("/"); revalidatePath("/links");
}

/** Speichert die Adresse eines hochgeladenen Kachelbilds. */
export async function setLinkImage(fd: FormData) {
  const { supabase } = await requireUser();
  const url = str(fd, "image_url") || null;
  check(await supabase.from("links")
    // Beim Bildwechsel den Ausschnitt zurücksetzen - er passte zum alten Bild
    .update({ image_url: url, image_position: "50% 50%" })
    .eq("id", str(fd, "id")), "Bild speichern");
  revalidatePath("/"); revalidatePath("/links");
}

/** Verschiebt den sichtbaren Ausschnitt innerhalb der Kachel. */
export async function setLinkImagePosition(id: string, position: string) {
  const { supabase } = await requireUser();
  if (!/^\d{1,3}% \d{1,3}%$/.test(position)) return;
  check(await supabase.from("links")
    .update({ image_position: position })
    .eq("id", id), "Bildausschnitt speichern");
  revalidatePath("/"); revalidatePath("/links");
}

/**
 * Schreibt eine neue Reihenfolge. Die Liste kommt in der Reihenfolge,
 * in der die Kacheln stehen sollen; Gruppenwechsel werden mitgeschrieben.
 */
export async function reorderLinks(items: { id: string; group_name: string }[]) {
  const { supabase, userId } = await requireUser();
  const byGroup = new Map<string, number>();
  for (const item of items) {
    const next = (byGroup.get(item.group_name) ?? 0) + 1;
    byGroup.set(item.group_name, next);
    const { error } = await supabase.from("links")
      .update({ sort_order: next, group_name: item.group_name })
      .eq("id", item.id).eq("user_id", userId);
    if (error) throw new Error(`Reihenfolge speichern: ${error.message}`);
  }
  revalidatePath("/"); revalidatePath("/links");
}

/* ======================================================= Zurücksetzen */

export interface ResetCounts { [table: string]: number }

export async function getDataCounts(): Promise<ResetCounts> {
  const { supabase } = await requireUser();
  const { data } = await supabase.rpc("data_counts");
  return (data ?? {}) as ResetCounts;
}

export async function resetMoney(fd: FormData): Promise<ResetCounts> {
  const { supabase } = await requireUser();
  if (str(fd, "confirm").trim().toUpperCase() !== "LOESCHEN") {
    throw new Error("Bestätigung fehlt");
  }
  const { data, error } = await supabase.rpc("reset_money", {
    p_transactions: bool(fd, "transactions"),
    p_accounts: bool(fd, "accounts"),
    p_categories: bool(fd, "categories"),
    p_recurring: bool(fd, "recurring"),
    p_rules: bool(fd, "rules"),
    p_scenarios: bool(fd, "scenarios"),
  });
  if (error) throw new Error(error.message);
  ["/geld", "/", "/transaktionen", "/konten", "/fixkosten", "/kategorien", "/import", "/runway"]
    .forEach((p) => revalidatePath(p));
  return (data ?? {}) as ResetCounts;
}

export async function resetTime(fd: FormData): Promise<ResetCounts> {
  const { supabase } = await requireUser();
  if (str(fd, "confirm").trim().toUpperCase() !== "LOESCHEN") {
    throw new Error("Bestätigung fehlt");
  }
  const { data, error } = await supabase.rpc("reset_time", {
    p_entries: bool(fd, "entries"),
    p_checkins: bool(fd, "checkins"),
    p_activities: bool(fd, "activities"),
    p_reviews: bool(fd, "reviews"),
  });
  if (error) throw new Error(error.message);
  revalidateTime(); revalidatePath("/");
  return (data ?? {}) as ResetCounts;
}

/* ====================================================== Fokus-Sitzungen */

/** Startet eine Sitzung, wenn die Kachel dafür vorgesehen ist. */
export async function startFocus(linkId: string) {
  const { supabase, userId } = await requireUser();

  const { data: link } = await supabase
    .from("links").select("id, title, activity_id, track_time")
    .eq("id", linkId).maybeSingle();
  if (!link || !link.track_time) return;

  // Läuft für dieselbe Kachel schon etwas, wird nicht doppelt gestartet
  const { data: running } = await supabase
    .from("focus_sessions").select("id")
    .eq("link_id", linkId).eq("status", "open").maybeSingle();
  if (running) return;

  await supabase.from("focus_sessions").insert({
    user_id: userId,
    label: link.title,
    link_id: link.id,
    activity_id: link.activity_id,
  });
  revalidatePath("/"); revalidatePath("/fokus");
}

/**
 * Startet eine Sitzung mit frei getipptem Text - für alles, wofür es keine
 * Aktivität gibt. Die Zuordnung passiert beim Beenden; der Text landet als
 * Notiz am Zeiteintrag.
 */
export async function startCustomFocus(label: string) {
  const { supabase, userId } = await requireUser();
  const text = label.trim().slice(0, 80);
  if (!text) return;

  check(await supabase.from("focus_sessions").insert({
    user_id: userId,
    label: text,
    link_id: null,
    activity_id: null,
  }), "Sitzung starten");
  revalidatePath("/heute"); revalidatePath("/"); revalidatePath("/fokus");
}

/** Startet eine Sitzung ohne Kachel, direkt aus dem Zen-Modus. */
export interface FocusTarget {
  id: string;
  title: string;
  target: string;
  kind: "section" | "web" | "folder";
}

export interface FocusStart {
  /** Alles, was beim Start geöffnet werden soll. */
  targets: FocusTarget[];
  label: string;
}

/**
 * Startet eine Sitzung aus beliebig vielen Kacheln und einer Aktivität.
 * Ohne Kachelauswahl wird die Kachel gesucht, die auf die Aktivität zeigt —
 * so genügt weiterhin, die Tätigkeit zu wählen.
 */
export async function startFocusForActivity(fd: FormData): Promise<FocusStart> {
  const { supabase, userId } = await requireUser();
  const activityId = str(fd, "activity_id") || null;
  const linkIds = String(fd.get("link_ids") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);

  let links: FocusTarget[] = [];

  if (linkIds.length > 0) {
    const { data } = await supabase.from("links")
      .select("id, title, target, kind").in("id", linkIds);
    // Reihenfolge der Auswahl beibehalten
    const byId = new Map((data ?? []).map((l) => [l.id as string, l]));
    links = linkIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((l) => ({
        id: l!.id as string, title: l!.title as string,
        target: l!.target as string, kind: l!.kind as FocusTarget["kind"],
      }));
  } else if (activityId) {
    const { data } = await supabase.from("links")
      .select("id, title, target, kind")
      .eq("activity_id", activityId).eq("archived", false)
      .order("open_count", { ascending: false }).limit(1).maybeSingle();
    if (data) {
      links = [{
        id: data.id as string, title: data.title as string,
        target: data.target as string, kind: data.kind as FocusTarget["kind"],
      }];
    }
  }

  if (!activityId && links.length === 0) {
    return { targets: [], label: "Fokus" };
  }

  let label: string;
  if (links.length > 0) {
    label = links.map((l) => l.title).join(" + ");
  } else {
    const { data: activity } = await supabase
      .from("activities").select("name").eq("id", activityId!).maybeSingle();
    label = activity?.name ?? "Fokus";
  }

  check(await supabase.from("focus_sessions").insert({
    user_id: userId,
    label,
    activity_id: activityId,
    link_id: links[0]?.id ?? null,
    link_ids: links.map((l) => l.id),
  }), "Fokus starten");

  revalidatePath("/fokus"); revalidatePath("/");
  return { targets: links, label };
}

/** Trägt eine offene Sitzung als Zeiteintrag ein. */
export async function logFocus(fd: FormData) {
  const { supabase, userId } = await requireUser();
  const id = str(fd, "id");
  const activityId = str(fd, "activity_id");
  const minutes = Math.max(1, Math.round(numOr(fd, "minutes", 0)));
  const entryDate = str(fd, "entry_date");
  const startMinute = Math.round(numOr(fd, "start_minute", 0));

  if (!id || !activityId || !entryDate) return;

  const { data: entry, error } = await supabase.from("time_entries").insert({
    user_id: userId,
    activity_id: activityId,
    entry_date: entryDate,
    minutes: Math.min(minutes, 1440),
    start_minute: Math.min(Math.max(startMinute, 0), 1439),
    // Frei getippter Text der Sitzung bleibt am Eintrag erhalten
    note: str(fd, "note") || null,
    source: "manual",
    confirmed: true,
  }).select("id").single();
  if (error) throw new Error(`Zeiteintrag anlegen: ${error.message}`);

  check(await supabase.from("focus_sessions").update({
    status: "logged",
    ended_at: new Date().toISOString(),
    minutes: Math.min(minutes, 1440),
    activity_id: activityId,
    time_entry_id: entry.id,
  }).eq("id", id), "Sitzung abschliessen");

  revalidateTime(); revalidatePath("/"); revalidatePath("/fokus");
}

export async function dismissFocus(fd: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("focus_sessions")
    .update({ status: "dismissed", ended_at: new Date().toISOString() })
    .eq("id", str(fd, "id"));
  revalidatePath("/"); revalidatePath("/fokus"); revalidateTime();
}

export async function dismissAllFocus() {
  const { supabase, userId } = await requireUser();
  await supabase.from("focus_sessions")
    .update({ status: "dismissed", ended_at: new Date().toISOString() })
    .eq("user_id", userId).eq("status", "open");
  revalidatePath("/"); revalidatePath("/fokus");
}


/* ============================================================== Ziele */

const GOAL_PATHS = ["/ziele", "/geld", "/kalender", "/"];
const revalidateGoals = () => GOAL_PATHS.forEach((p) => revalidatePath(p));

function idList(fd: FormData, key: string): string[] {
  return fd.getAll(key).map(String).filter(Boolean);
}

export async function createGoal(fd: FormData) {
  const { supabase, userId } = await requireUser();
  check(await supabase.from("goals").insert({
    user_id: userId,
    title: str(fd, "title"),
    description: str(fd, "description") || null,
    kind: str(fd, "kind") || "milestone",
    target_amount: numOrNull(fd, "target_amount"),
    unit: str(fd, "unit") || null,
    start_date: str(fd, "start_date") || heuteISO(),
    target_date: str(fd, "target_date") || null,
    linked_category_ids: idList(fd, "linked_category_ids"),
    linked_activity_ids: idList(fd, "linked_activity_ids"),
    weekly_time_budget_hours: numOrNull(fd, "weekly_time_budget_hours"),
  }), "Ziel anlegen");
  revalidateGoals();
}

export async function updateGoal(fd: FormData) {
  const { supabase } = await requireUser();
  check(await supabase.from("goals").update({
    title: str(fd, "title"),
    description: str(fd, "description") || null,
    target_amount: numOrNull(fd, "target_amount"),
    target_date: str(fd, "target_date") || null,
    linked_category_ids: idList(fd, "linked_category_ids"),
    linked_activity_ids: idList(fd, "linked_activity_ids"),
    manual_progress: numOrNull(fd, "manual_progress"),
    status: str(fd, "status") || "active",
  }).eq("id", str(fd, "id")), "Ziel speichern");
  revalidateGoals();
}

export async function deleteGoal(fd: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("goals").delete().eq("id", str(fd, "id"));
  revalidateGoals();
}

export async function addMilestone(fd: FormData) {
  const { supabase, userId } = await requireUser();
  check(await supabase.from("goal_milestones").insert({
    user_id: userId,
    goal_id: str(fd, "goal_id"),
    title: str(fd, "title"),
    target_date: str(fd, "target_date") || null,
    sort_order: numOr(fd, "sort_order", 100),
  }), "Meilenstein anlegen");
  revalidateGoals();
}

export async function toggleMilestone(fd: FormData) {
  const { supabase } = await requireUser();
  const done = str(fd, "done") === "true";
  await supabase.from("goal_milestones")
    .update({ done_at: done ? heuteISO() : null })

    .eq("id", str(fd, "id"));
  revalidateGoals();
}

export async function deleteMilestone(fd: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("goal_milestones").delete().eq("id", str(fd, "id"));
  revalidateGoals();
}

/* ==================================================== Wochenrückblick */

export async function saveWeeklyReview(fd: FormData) {
  const { supabase, userId } = await requireUser();
  const weekStart = str(fd, "week_start");
  if (!weekStart) return;

  check(await supabase.from("weekly_reviews").upsert({
    user_id: userId,
    week_start: weekStart,
    goal_hours: numOrNull(fd, "goal_hours"),
    total_hours: numOrNull(fd, "total_hours"),
    income: numOrNull(fd, "income"),
    expenses: numOrNull(fd, "expenses"),
    net_worth: numOrNull(fd, "net_worth"),
    runway_months: numOrNull(fd, "runway_months"),
    went_well: str(fd, "went_well") || null,
    went_poorly: str(fd, "went_poorly") || null,
    next_week_focus: str(fd, "next_week_focus") || null,
  }, { onConflict: "user_id,week_start" }), "Rückblick speichern");

  revalidatePath("/rueckblick"); revalidatePath("/woche"); revalidatePath("/");
}

export async function deleteWeeklyReview(fd: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("weekly_reviews").delete().eq("id", str(fd, "id"));
  revalidatePath("/rueckblick");
}
