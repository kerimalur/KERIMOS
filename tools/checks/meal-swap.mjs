/**
 * Rechen-Prüfung für src/lib/meal-swap.ts
 *
 * Der Vorlagen-Dialog trifft Entscheidungen über Kerims Essen — was
 * vorgeschlagen wird, was ins Budget passt, wie viel Protein noch fehlt.
 * Diese Zahlen müssen stimmen, auch wenn später jemand an der Sortierung
 * oder an den Zielwerten dreht.
 *
 * Läuft ohne Test-Framework: die beiden reinen Module werden mit dem
 * ohnehin vorhandenen TypeScript-Compiler übersetzt und dann importiert.
 *
 *   npm run check:meal-swap
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const wurzel = path.resolve(import.meta.dirname, "../..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "meal-swap-"));

/** Eine .ts-Datei nach ESM übersetzen und in den Temp-Ordner legen. */
function uebersetze(relativ, ziel) {
  const quelle = fs.readFileSync(path.join(wurzel, relativ), "utf8")
    // Der Pfad-Alias "@/" ist ein Next-Feature; hier reicht der Nachbar.
    .replace(/@\/lib\/nutrition/g, "./nutrition.mjs");
  const { outputText } = ts.transpileModule(quelle, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  });
  fs.writeFileSync(path.join(tmp, ziel), outputText);
}

uebersetze("src/lib/nutrition.ts", "nutrition.mjs");
uebersetze("src/lib/meal-swap.ts", "meal-swap.mjs");

const {
  rezeptWerte, skaliert, summeAktiv, restBudget, distanz,
  alternativen, proteinLuecke, ampelKcal, ampelProtein, ausserhalbZeitfenster,
  sichtbareKomponenten, zielFuer, TAGESZIEL,
} = await import(pathToFileURL(path.join(tmp, "meal-swap.mjs")).href);

let bestanden = 0;
const pruefe = (name, fn) => {
  try {
    fn();
    bestanden++;
    console.log("  ok   " + name);
  } catch (e) {
    console.error("  FEHL " + name + "\n       " + e.message);
    process.exitCode = 1;
  }
};

// --- Testdaten: Werte an Kerims echten Zahlen orientiert -------------
const foods = [
  { id: "haferflocken", name: "Haferflocken", calories_per_100: 370, protein_per_100: 13, cost_per_100: 0.3 },
  { id: "casein",       name: "Casein",       calories_per_100: 365, protein_per_100: 85, cost_per_100: 3 },
  { id: "quark",        name: "Magerquark",   calories_per_100: 67,  protein_per_100: 10, cost_per_100: 0.5 },
  { id: "poulet",       name: "Poulet",       calories_per_100: 165, protein_per_100: 31, cost_per_100: 2 },
  { id: "reis",         name: "Reis",         calories_per_100: 130, protein_per_100: 2.7, cost_per_100: 0.2 },
];
const foodById = new Map(foods.map((f) => [f.id, f]));

const porridge = { id: "r-porridge", name: "Porridge", meal_type: "mittagessen",
  items: [
    { food_id: "haferflocken", food_name: "Haferflocken", amount_per_portion: 80, unit: "g" },
    { food_id: "casein",       food_name: "Casein",       amount_per_portion: 30, unit: "g" },
  ] };
const pouletReis = { id: "r-poulet", name: "Poulet mit Reis", meal_type: "mittagessen",
  items: [
    { food_id: "poulet", food_name: "Poulet", amount_per_portion: 200, unit: "g" },
    { food_id: "reis",   food_name: "Reis",   amount_per_portion: 250, unit: "g" },
  ] };
const quarkBlock = { id: "r-quark", name: "Quark mit Blaubeeren", meal_type: "snack",
  items: [{ food_id: "quark", food_name: "Magerquark", amount_per_portion: 500, unit: "g" }] };
const grossesRezept = { id: "r-gross", name: "Grosses Gericht", meal_type: "mittagessen",
  items: Array.from({ length: 7 }, (_, i) => (
    { food_id: "reis", food_name: "Reis " + i, amount_per_portion: 100, unit: "g" })) };

const rezepte = [porridge, pouletReis, quarkBlock, grossesRezept];

// --- 1 Nährwerte pro Portion ----------------------------------------
pruefe("rezeptWerte rechnet Zutaten korrekt zusammen", () => {
  const w = rezeptWerte(porridge, foodById);
  // 80 g Haferflocken = 296 kcal / 10.4 g P ; 30 g Casein = 109.5 kcal / 25.5 g P
  assert.equal(w.kcal, 405.5);
  assert.equal(w.protein, 35.9);
});

pruefe("Zutat ohne Bezug traegt 0 bei", () => {
  const w = rezeptWerte({ id: "x", name: "x", meal_type: "snack",
    items: [{ food_id: null, food_name: "Freitext", amount_per_portion: 100, unit: "g" }] }, foodById);
  assert.equal(w.kcal, 0);
});

// --- 2 Portionsfaktor ------------------------------------------------
pruefe("skaliert halbiert und erhoeht korrekt", () => {
  const w = rezeptWerte(porridge, foodById);
  assert.equal(skaliert(w, 0.5).kcal, 202.8);
  assert.equal(skaliert(w, 0.5).protein, 18);
  assert.equal(skaliert(w, 1.5).protein, 53.9);
  assert.equal(skaliert(w, 1).kcal, w.kcal);
});

// --- 3 Summe der aktiven Komponenten --------------------------------
const werteById = new Map(rezepte.map((r) => [r.id, rezeptWerte(r, foodById)]));
const werteFuer = (id) => werteById.get(id);

const komponenten = [
  { key: "a", meal_type: "fruehstueck", recipe_id: "r-porridge", faktor: 1, aktiv: true },
  { key: "b", meal_type: "mittagessen", recipe_id: "r-poulet",   faktor: 1, aktiv: true },
  { key: "c", meal_type: "snack",       recipe_id: "r-quark",    faktor: 1, aktiv: true },
];

pruefe("summeAktiv zaehlt nur angehakte Zeilen", () => {
  const alle = summeAktiv(komponenten, werteFuer);
  const ohnePorridge = summeAktiv(
    komponenten.map((k) => k.key === "a" ? { ...k, aktiv: false } : k), werteFuer);
  assert.ok(alle.kcal > ohnePorridge.kcal);
  assert.equal(Math.round(alle.kcal - ohnePorridge.kcal), 406); // Porridge faellt weg
});

pruefe("summeAktiv laesst ohneKey aus dem Restbudget heraus", () => {
  const behalten = summeAktiv(komponenten, werteFuer, "a");
  const alle = summeAktiv(komponenten, werteFuer);
  assert.ok(behalten.kcal < alle.kcal);
});

// --- 4 Restbudget ----------------------------------------------------
pruefe("restBudget zieht Behaltenes vom Ziel ab", () => {
  const ziel = { kcal: 2100, protein: 190 };
  const rest = restBudget(ziel, { kcal: 1500, protein: 150 });
  assert.deepEqual(rest, { kcal: 600, protein: 40 });
});

pruefe("restBudget darf negativ werden, wenn der Tag schon voll ist", () => {
  const rest = restBudget({ kcal: 1800, protein: 190 }, { kcal: 2000, protein: 200 });
  assert.equal(rest.kcal, -200);
});

// --- 5 Distanz -------------------------------------------------------
pruefe("distanz gewichtet Protein staerker als Kalorien", () => {
  const ziel = { kcal: 500, protein: 40 };
  const nurKcalAb = distanz({ kcal: 550, protein: 40 }, ziel);   // 50 kcal daneben
  const nurProteinAb = distanz({ kcal: 500, protein: 35 }, ziel); // 5 g P daneben
  assert.ok(nurProteinAb > nurKcalAb, "Protein muss staerker zaehlen");
});

// --- 6 Alternativen --------------------------------------------------
pruefe("alternativen filtert auf das Restbudget", () => {
  const eng = alternativen({
    rezepte, foodById, rest: { kcal: 200, protein: 20 }, slot: "mittagessen",
  });
  // Porridge (405 kcal) und Poulet+Reis (655 kcal) passen nicht in 200 kcal
  assert.equal(eng.length, 0);

  const weit = alternativen({
    rezepte, foodById, rest: { kcal: 900, protein: 60 }, slot: "mittagessen",
  });
  assert.ok(weit.length >= 2);
  assert.ok(weit.every((a) => a.passt));
});

pruefe("alternativen respektiert den Slot (Snack vs Hauptmahlzeit)", () => {
  const snacks = alternativen({
    rezepte, foodById, rest: { kcal: 900, protein: 60 }, slot: "snack",
  });
  assert.ok(snacks.every((a) => a.rezept.meal_type === "snack"));
  assert.equal(snacks[0].rezept.id, "r-quark");
});

pruefe("alternativen bietet das aktuelle Rezept nicht erneut an", () => {
  const l = alternativen({
    rezepte, foodById, rest: { kcal: 900, protein: 60 },
    slot: "mittagessen", ausserRecipeId: "r-porridge",
  });
  assert.ok(!l.some((a) => a.rezept.id === "r-porridge"));
});

pruefe("Vorbereitetes wird nach oben sortiert", () => {
  const l = alternativen({
    rezepte, foodById, rest: { kcal: 900, protein: 60 }, slot: "mittagessen",
    bestand: new Map([["r-gross", 3]]),
  });
  assert.equal(l[0].rezept.id, "r-gross");
  assert.equal(l[0].bestand, 3);
});

pruefe("nurEinfach filtert Rezepte mit mehr als 5 Zutaten weg", () => {
  const l = alternativen({
    rezepte, foodById, rest: { kcal: 2000, protein: 100 },
    slot: "mittagessen", nurEinfach: true,
  });
  assert.ok(!l.some((a) => a.rezept.id === "r-gross"));
  assert.ok(l.every((a) => a.einfach));
});

pruefe("delta zeigt den Unterschied zur getauschten Komponente", () => {
  const l = alternativen({
    rezepte, foodById, rest: { kcal: 900, protein: 60 }, slot: "mittagessen",
    original: werteFuer("r-porridge"), ausserRecipeId: "r-porridge",
  });
  const poulet = l.find((a) => a.rezept.id === "r-poulet");
  assert.equal(poulet.delta.kcal, Math.round((655 - 405.5) * 10) / 10);
});

pruefe("auchUnpassende zeigt zu grosse Rezepte, aber ganz hinten", () => {
  const l = alternativen({
    rezepte, foodById, rest: { kcal: 450, protein: 40 },
    slot: "mittagessen", auchUnpassende: true,
  });
  assert.ok(l.length > 0);
  assert.ok(l[l.length - 1].passt === false);
});

// --- 7 Protein-Luecke ------------------------------------------------
pruefe("proteinLuecke schweigt, wenn das Ziel erreicht ist", () => {
  assert.deepEqual(proteinLuecke({ kcal: 2100, protein: 190 },
    { kcal: 2000, protein: 195 }), []);
});

pruefe("proteinLuecke rundet auf sinnvolle Mengen auf", () => {
  const v = proteinLuecke({ kcal: 2100, protein: 190 }, { kcal: 1800, protein: 175 });
  assert.ok(v.length > 0);
  const quark = v.find((x) => x.name === "Magerquark");
  // 15 g fehlen -> 150 g Quark (10 g P/100 g), auf 50er gerundet
  assert.equal(quark.menge, 150);
  assert.equal(quark.protein, 15);
  assert.ok(v.every((x) => x.menge % 5 === 0), "krumme Mengen vermeiden");
  assert.ok(v.every((x) => x.protein >= 15), "Vorschlag muss die Luecke decken");
});

// --- 8 Ampel ---------------------------------------------------------
pruefe("Protein unter Ziel ist rot, darueber gruen", () => {
  assert.equal(ampelProtein(190, 180), "unter");
  assert.equal(ampelProtein(190, 190), "gut");
  assert.equal(ampelProtein(190, 210), "gut");
});

pruefe("Kalorien haben 10 Prozent Spielraum", () => {
  assert.equal(ampelKcal(2100, 2100), "gut");
  assert.equal(ampelKcal(2100, 2250), "gut");
  assert.equal(ampelKcal(2100, 2400), "ueber");
  assert.equal(ampelKcal(2100, 1700), "unter");
});

// --- 9 Zeitfenster ---------------------------------------------------
pruefe("Zeitfenster greift nur an Arbeitstagen", () => {
  assert.equal(ausserhalbZeitfenster("abendessen", true), true);
  assert.equal(ausserhalbZeitfenster("abendessen", false), false);
  assert.equal(ausserhalbZeitfenster("mittagessen", true), false);
  assert.equal(ausserhalbZeitfenster("snack", true), false);
});

// --- 10 Der eigentliche Anwendungsfall -------------------------------
pruefe("Anwendungsfall: freier Tag, Porridge weg, Rest passt in 1800 kcal", () => {
  const ziel = { kcal: 1800, protein: 190 };
  const ohnePorridge = komponenten.map((k) => k.key === "a" ? { ...k, aktiv: false } : k);
  const behalten = summeAktiv(ohnePorridge, werteFuer);
  const rest = restBudget(ziel, behalten);
  assert.ok(rest.kcal > 0, "es bleibt Budget uebrig");
  const vorschlaege = alternativen({ rezepte, foodById, rest, slot: "mittagessen" });
  assert.ok(vorschlaege.every((a) => a.werte.kcal <= rest.kcal * 1.1));
});

// --- 11 Tag-Typ: mit und ohne Training ------------------------------
pruefe("zielFuer liefert 2100 mit und 1800 ohne Training", () => {
  assert.deepEqual(zielFuer(true), { kcal: 2100, protein: 190 });
  assert.deepEqual(zielFuer(false), { kcal: 1800, protein: 190 });
  // Protein bleibt gleich - gespart wird an Kalorien, nie am Eiweiss.
  assert.equal(TAGESZIEL.training.protein, TAGESZIEL.ohne.protein);
});

const mitPorridge = [
  { key: "p", meal_type: "fruehstueck", recipe_id: "r-porridge", faktor: 1, aktiv: true, training_only: true },
  { key: "b", meal_type: "mittagessen", recipe_id: "r-poulet",   faktor: 1, aktiv: true, training_only: false },
  { key: "c", meal_type: "snack",       recipe_id: "r-quark",    faktor: 1, aktiv: true, training_only: false },
];

pruefe("ohne Training faellt die trainingsgebundene Zeile ganz weg", () => {
  const mit = sichtbareKomponenten(mitPorridge, true);
  const ohne = sichtbareKomponenten(mitPorridge, false);
  assert.equal(mit.length, 3);
  assert.equal(ohne.length, 2);
  assert.ok(!ohne.some((k) => k.recipe_id === "r-porridge"),
    "Porridge darf ohne Training gar nicht erst auftauchen");
});

pruefe("Porridge zaehlt ohne Training auch nicht in die Summe", () => {
  const mit = summeAktiv(sichtbareKomponenten(mitPorridge, true), werteFuer);
  const ohne = summeAktiv(sichtbareKomponenten(mitPorridge, false), werteFuer);
  assert.ok(mit.kcal > ohne.kcal);
  assert.equal(Math.round(mit.kcal - ohne.kcal), 406);
});

pruefe("ohne Training bleibt Budget fuer etwas mit mehr Volumen", () => {
  // Genau Kerims Fall: kein Training -> Porridge weg, Ziel sinkt auf 1800,
  // es muss trotzdem noch Luft nach oben bleiben.
  const ohne = sichtbareKomponenten(mitPorridge, false);
  const rest = restBudget(zielFuer(false), summeAktiv(ohne, werteFuer));
  assert.ok(rest.kcal > 300,
    "es muessen mehr als 300 freie kcal uebrig bleiben, sonst lohnt der Tausch nicht");
});

pruefe("mit Training bleibt das Porridge drin und das Ziel bei 2100", () => {
  const mit = sichtbareKomponenten(mitPorridge, true);
  assert.ok(mit.some((k) => k.recipe_id === "r-porridge"));
  assert.equal(zielFuer(true).kcal, 2100);
});

console.log("\n" + bestanden + " Pruefungen bestanden.");
fs.rmSync(tmp, { recursive: true, force: true });
