"""
Garmin -> KerimOS Sync.

Holt Krafttrainings von Garmin Connect und schreibt sie in die Gym-Datenbank
(Supabase-Projekt "Gymapp Cursor"). Laeuft als Vercel Python Serverless
Function, taeglich per Cron.

Ablauf:
  1. Anmeldung bei Garmin - bevorzugt mit gecachtem Token aus der Tabelle
     `private_tokens`, sonst frischer Login mit E-Mail/Passwort.
  2. Krafttrainings der letzten 7 Tage holen.
  3. Pro Aktivitaet die einzelnen Saetze abrufen.
  4. Aktivitaeten, die schon uebernommen oder schon vorgemerkt sind
     (garmin_activity_id), ueberspringen.
  5. Session als VORSCHAU in `garmin_import_sessions` + `garmin_import_saetze`
     ablegen.

Bewusste Entscheidungen:
  - Der Sync schreibt NICHT mehr direkt nach workout_sessions/exercise_logs.
    Die Uhr kennt das Gewicht oft nicht (0 kg) und ordnet Uebungen manchmal
    falsch zu. Deshalb landet jedes neue Training zuerst in der Vorschau; die
    Uebernahme passiert von Hand unter /gym/garmin, wo Gewichte und
    Uebungszuordnung korrigiert werden koennen.
  - Zugriff auf Supabase per PostgREST (requests) statt der supabase-Lib:
    weniger Abhaengigkeiten, und der Service-Role-Key umgeht RLS ohnehin.
  - Fehler liefern HTTP 200 mit Fehlertext im Body, damit Vercel den Cron
    nicht als hart fehlgeschlagen markiert und in Dauer-Retry geht.
  - Saetze werden ohne set_number abgelegt; die Nummerierung entsteht erst
    beim Uebernehmen, weil sich die Uebungszuordnung vorher noch aendern kann.

Benoetigte Environment-Variablen:
  GARMIN_EMAIL, GARMIN_PASSWORD
  GYM_SUPABASE_URL, GYM_SUPABASE_SERVICE_ROLE_KEY, GYM_USER_ID
  CRON_SECRET (optional, schuetzt den Endpoint vor fremden Aufrufen)
"""

from http.server import BaseHTTPRequestHandler
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse, parse_qs
import json
import os
import traceback

import requests

TOKEN_SETTING_KEY = "garmin_session"
LOOKBACK_DAYS = 7
GARMIN_ACTIVITY_TYPES = ("strength", "fitness_equipment", "indoor_cardio")

# Fuer die automatische Push/Pull-Erkennung: welche Muskelgruppe zaehlt
# wohin. Namen wie in der Tabelle muscle_groups.
PULL_MUSKELN = {"rücken", "ruecken", "bizeps"}
PUSH_MUSKELN = {"brust", "schultern", "trizeps"}


# --------------------------------------------------------------- Supabase

class Gym:
    """Duenner PostgREST-Wrapper auf die Gym-Datenbank."""

    def __init__(self) -> None:
        url = os.environ.get("GYM_SUPABASE_URL")
        key = os.environ.get("GYM_SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            raise RuntimeError(
                "GYM_SUPABASE_URL / GYM_SUPABASE_SERVICE_ROLE_KEY fehlen"
            )
        self.base = url.rstrip("/") + "/rest/v1"
        self.headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        }

    def select(self, table: str, params: dict) -> list:
        r = requests.get(
            f"{self.base}/{table}", headers=self.headers, params=params, timeout=30
        )
        r.raise_for_status()
        return r.json()

    def insert(self, table: str, rows, return_rows: bool = False) -> list:
        headers = dict(self.headers)
        headers["Prefer"] = "return=representation" if return_rows else "return=minimal"
        r = requests.post(
            f"{self.base}/{table}", headers=headers, json=rows, timeout=30
        )
        if r.status_code >= 400:
            # PostgREST schreibt den eigentlichen Grund in den Body -
            # raise_for_status() alleine wirft ihn weg und man sieht nur "400".
            raise RuntimeError(f"{table}: {r.status_code} {r.text[:300]}")
        return r.json() if return_rows else []

    def upsert(self, table: str, row: dict, on_conflict: str) -> None:
        headers = dict(self.headers)
        headers["Prefer"] = "resolution=merge-duplicates,return=minimal"
        r = requests.post(
            f"{self.base}/{table}",
            headers=headers,
            params={"on_conflict": on_conflict},
            json=row,
            timeout=30,
        )
        if r.status_code >= 400:
            raise RuntimeError(f"{table}: {r.status_code} {r.text[:300]}")

    def delete(self, table: str, params: dict) -> None:
        requests.delete(
            f"{self.base}/{table}", headers=self.headers, params=params, timeout=30
        )

    def upsert_setting(self, key: str, value: str) -> None:
        headers = dict(self.headers)
        headers["Prefer"] = "resolution=merge-duplicates,return=minimal"
        requests.post(
            f"{self.base}/private_tokens",
            headers=headers,
            json={
                "key": key,
                "value": value,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            timeout=30,
        )

    def get_setting(self, key: str):
        # private_tokens statt settings: settings ist fuer die Rolle anon
        # offen, und der Garmin-Token darf dort nicht liegen.
        rows = self.select(
            "private_tokens", {"key": f"eq.{key}", "select": "value", "limit": 1}
        )
        return rows[0]["value"] if rows else None


# ----------------------------------------------------------------- Garmin

TOKEN_HINWEIS = (
    "Garmin-Anmeldung vom Server nicht möglich. Garmin drosselt Logins aus "
    "Rechenzentren (429). Bitte lokal einmal ausführen: "
    "python tools/garmin-token/hole-token.py"
)


def token_traeger(api):
    """
    Das Objekt, das die Sitzungs-Token haelt.

    garminconnect 0.3.x nennt es `client`, aeltere Versionen `garth`. Beides
    kann `dumps()` und `loads()` - nur der Name hat sich geaendert.
    """
    traeger = getattr(api, "client", None) or getattr(api, "garth", None)
    if traeger is None:
        raise RuntimeError("garminconnect: weder .client noch .garth vorhanden")
    return traeger


def garmin_login(gym: Gym):
    """
    Meldet sich bei Garmin an.

    Der Normalfall ist der gespeicherte Token aus `private_tokens`.
    Ein Passwort-Login von hier aus schlaegt fast immer mit 429 fehl, weil
    Garmin Anmeldungen aus Rechenzentren drosselt - deshalb ist er nur noch
    Notnagel und wirft im Fehlerfall einen erklaerenden Hinweis.

    Der Token wird nach erfolgreicher Nutzung zurueckgeschrieben: die Library
    erneuert das kurzlebige Access-Token unterwegs selbst, und diese Erneuerung
    soll nicht bei jedem Lauf verloren gehen.
    """
    from garminconnect import Garmin

    cached = gym.get_setting(TOKEN_SETTING_KEY)
    if cached:
        try:
            api = Garmin()
            # Ein Token-String laenger als 512 Zeichen wird direkt als
            # Sitzungsdaten interpretiert (statt als Pfad zu einem Ordner).
            # login() setzt dabei auch display_name und Einheitensystem.
            api.login(tokenstore=cached)

            # Bewusst KEIN zusaetzlicher Testaufruf mehr. Frueher stand hier
            # get_user_summary() als Gueltigkeitsprobe - die liefert aber
            # sporadisch "500 IllegalStateException" von Garmin, ohne dass am
            # Token etwas falsch waere. Der Token flog dann raus und der
            # Passwort-Login scheiterte an der 429-Drosselung. Ob der Token
            # taugt, zeigt sich beim eigentlichen Abruf von selbst.
            try:
                aktualisiert = token_traeger(api).dumps()
                if aktualisiert != cached:
                    gym.upsert_setting(TOKEN_SETTING_KEY, aktualisiert)
            except Exception:
                pass  # Zurueckschreiben ist Kuer, kein Grund zum Abbruch

            return api, "token"
        except Exception as fehler:
            letzter_tokenfehler = str(fehler)
    else:
        letzter_tokenfehler = "kein Token hinterlegt"

    email = os.environ.get("GARMIN_EMAIL")
    password = os.environ.get("GARMIN_PASSWORD")
    if not email or not password:
        raise RuntimeError(f"{TOKEN_HINWEIS} (Token: {letzter_tokenfehler})")

    try:
        api = Garmin(email, password)
        api.login()
    except Exception as fehler:
        raise RuntimeError(
            f"{TOKEN_HINWEIS} — Token: {letzter_tokenfehler}; Login: {fehler}"
        ) from fehler

    gym.upsert_setting(TOKEN_SETTING_KEY, token_traeger(api).dumps())
    return api, "passwort"


def typ_name(aktivitaet: dict) -> str:
    """Garmins Typbezeichnung, z.B. 'strength_training'."""
    typ = aktivitaet.get("activityType") or {}
    if isinstance(typ, dict):
        return str(typ.get("typeKey") or "").lower()
    return str(typ).lower()


def fetch_alle_aktivitaeten(api) -> list:
    """
    Alle Aktivitaeten der letzten LOOKBACK_DAYS Tage - ungefiltert.

    Bewusst ohne Typ-Filter auf Garmin-Seite: welche Bezeichnung dort genau
    akzeptiert wird, unterscheidet sich je nach Geraet und API-Version, und
    ein nicht erkannter Filter liefert stillschweigend eine leere Liste.
    Lieber alles holen und hier selbst aussortieren.
    """
    ende = datetime.now().date()
    start = ende - timedelta(days=LOOKBACK_DAYS)
    try:
        return api.get_activities_by_date(start.isoformat(), ende.isoformat()) or []
    except Exception:
        return []


def ist_krafttraining(aktivitaet: dict) -> bool:
    name = typ_name(aktivitaet)
    return any(teil in name for teil in GARMIN_ACTIVITY_TYPES)


# ------------------------------------------------------------ Verarbeitung

def parse_zeit(wert):
    """Garmin liefert 'YYYY-MM-DD HH:MM:SS' (lokal) oder ISO-Strings."""
    if not wert:
        return None
    text = str(wert).replace("Z", "+00:00")
    for kandidat in (text, text.replace(" ", "T")):
        try:
            return datetime.fromisoformat(kandidat)
        except ValueError:
            continue
    return None


def lade_mapping(gym: Gym) -> dict:
    """
    Baut das Lookup Garmin -> exercise_id.

    Schluessel sind '<CATEGORY>|<NAME>' und '<CATEGORY>|*'. Der spezifische
    Name gewinnt, der Stern ist der Fallback fuer die ganze Kategorie.
    """
    rows = gym.select(
        "garmin_exercise_map",
        {"select": "garmin_category,garmin_name,exercise_id", "limit": "1000"},
    )
    return {
        f"{r['garmin_category']}|{r['garmin_name']}": r["exercise_id"]
        for r in rows
        if r.get("exercise_id")
    }


# Namensbestandteile, die eine eigenstaendige Uebung kennzeichnen. Beispiel:
# BENCH_PRESS/INCLINE_DUMBBELL_BENCH_PRESS ist Schraegbankdruecken und darf
# nicht ueber den Kategorie-Fallback BENCH_PRESS|* als Flachbankdruecken
# durchgehen - genau so sind Schraeg- und Flachbank frueher zu einer einzigen
# Uebung verschmolzen. Solche Namen brauchen einen eigenen Eintrag im Mapping;
# ohne den gelten sie als nicht zugeordnet und tauchen in der Vorschau auf.
VARIANTEN_MARKER = (
    "INCLINE", "DECLINE", "CLOSE_GRIP", "WIDE_GRIP", "REVERSE",
    "SINGLE_ARM", "ONE_ARM", "SEATED", "STANDING", "OVERHEAD",
)


def ist_variante(name: str) -> bool:
    return any(marker in name for marker in VARIANTEN_MARKER)


def uebung_aufloesen(mapping: dict, kategorie: str, name: str):
    if not kategorie:
        return None
    if name:
        treffer = mapping.get(f"{kategorie}|{name}")
        if treffer:
            return treffer
        # Variantennamen bewusst NICHT auf den Kategorie-Fallback abrutschen
        # lassen - lieber als unbekannt melden als still falsch zuordnen.
        if ist_variante(name):
            return None
    return mapping.get(f"{kategorie}|*")


def verarbeite_aktivitaet(gym: Gym, api, aktivitaet: dict, mapping: dict,
                          user_id: str, muskeln: dict) -> dict:
    """
    Merkt eine einzelne Garmin-Aktivitaet zur Pruefung vor.

    Geschrieben wird ausschliesslich in die Vorschau-Tabellen. In den
    eigentlichen Trainingsverlauf kommt die Einheit erst, wenn Kerim sie unter
    /gym/garmin uebernimmt.
    """
    activity_id = aktivitaet.get("activityId")

    # --- Idempotenz -------------------------------------------------------
    # Zwei Stellen pruefen: schon uebernommen (workout_sessions) oder schon
    # vorgemerkt (garmin_import_sessions, egal in welchem Status - auch
    # verworfene sollen nicht wieder auftauchen).
    if gym.select(
        "workout_sessions",
        {"garmin_activity_id": f"eq.{activity_id}", "select": "id", "limit": 1},
    ):
        return {"activity_id": activity_id, "status": "uebersprungen"}

    if gym.select(
        "garmin_import_sessions",
        {"garmin_activity_id": f"eq.{activity_id}", "select": "id", "limit": 1},
    ):
        return {"activity_id": activity_id, "status": "uebersprungen"}

    # --- Saetze holen -----------------------------------------------------
    daten = api.get_activity_exercise_sets(activity_id)

    # Garmin liefert die Saetze je nach Geraet unter unterschiedlichen
    # Schluesseln. Der Reihe nach durchprobieren, statt einen anzunehmen.
    saetze = []
    if isinstance(daten, dict):
        for schluessel in ("exerciseSets", "activityExerciseSets", "sets"):
            wert = daten.get(schluessel)
            if isinstance(wert, list) and wert:
                saetze = wert
                break
    elif isinstance(daten, list):
        saetze = daten

    aktive = [s for s in saetze if str(s.get("setType", "")).upper() == "ACTIVE"]

    if not aktive:
        # Diagnose mitgeben - sonst raet man, ob die Uhr keine Saetze
        # aufgezeichnet hat oder ob der Schluessel nur anders heisst.
        return {
            "activity_id": activity_id,
            "status": "keine_saetze",
            "roh_saetze": len(saetze),
            "antwort_schluessel": sorted(daten.keys())[:12] if isinstance(daten, dict) else str(type(daten)),
            "set_typen": sorted({str(s.get("setType")) for s in saetze})[:8],
        }

    start = parse_zeit(aktivitaet.get("startTimeLocal"))
    dauer = float(aktivitaet.get("duration") or 0)
    ende = start + timedelta(seconds=dauer) if start else None

    # --- Saetze in Vorschauzeilen uebersetzen -----------------------------
    # Auch nicht zugeordnete Saetze kommen mit (exercise_id = None). Sie
    # werden in der Vorschau angezeigt und dort von Hand zugeordnet, statt
    # wie frueher nur als Notiz zu ueberleben.
    satzzeilen, ungemappt = [], {}
    # Alle Garmin-Bezeichnungen mitschreiben, nicht nur die unbekannten:
    # falsch erkannte Uebungen werden sonst still einer plausiblen, aber
    # falschen Uebung zugeordnet und fallen nie auf.
    gesehen: dict = {}

    for position, satz in enumerate(aktive, start=1):
        info = (satz.get("exercises") or [{}])[0]
        kategorie = (info.get("category") or "").upper()
        name = (info.get("name") or "").upper()

        schluessel = f"{kategorie}/{name}" if name else kategorie
        gesehen[schluessel] = gesehen.get(schluessel, 0) + 1

        exercise_id = uebung_aufloesen(mapping, kategorie, name)
        if not exercise_id:
            ungemappt[schluessel] = ungemappt.get(schluessel, 0) + 1

        # Garmin liefert Gramm. Koerpergewichtsuebungen (Klimmzuege,
        # Liegestuetze) kommen ohne Gewicht - und bei Maschinen kennt die Uhr
        # das Gewicht schlicht nicht. Beides landet als 0 und wird in der
        # Vorschau von Hand nachgetragen.
        gewicht = satz.get("weight")
        gewicht_kg = round(float(gewicht) / 1000.0, 2) if gewicht else 0

        satzstart = parse_zeit(satz.get("startTime"))

        satzzeilen.append({
            "import_session_id": None,  # wird nach dem Session-Insert gesetzt
            "position": position,
            "garmin_key": schluessel,
            "exercise_id": exercise_id,
            "weight_kg": gewicht_kg,
            "reps": int(satz.get("repetitionCount") or 0),
            "completed_at": satzstart.isoformat() if satzstart else None,
        })

    if not satzzeilen:
        return {"activity_id": activity_id, "status": "keine_saetze"}

    # --- Push oder Pull? --------------------------------------------------
    # Nur die bereits zugeordneten Saetze zaehlen mit; die Zuordnung kann sich
    # in der Vorschau noch aendern, deshalb ist das nur ein Vorschlag.
    split = erkenne_split(
        [z["exercise_id"] for z in satzzeilen if z["exercise_id"]], muskeln,
    )

    uebersicht = ", ".join(f"{k}×{v}" for k, v in sorted(gesehen.items()))

    # --- Vorschau-Session anlegen -----------------------------------------
    session = gym.insert("garmin_import_sessions", {
        "user_id": user_id,
        "garmin_activity_id": activity_id,
        "started_at": start.isoformat() if start else None,
        "completed_at": ende.isoformat() if ende else None,
        "erkannter_split": split,
        "garmin_uebersicht": uebersicht,
        "status": "offen",
    }, return_rows=True)

    session_id = session[0]["id"]

    for zeile in satzzeilen:
        zeile["import_session_id"] = session_id
    try:
        gym.insert("garmin_import_saetze", satzzeilen)
    except Exception:
        # Ohne Saetze ist die Vorschau wertlos - und sie wuerde wegen der
        # eindeutigen garmin_activity_id jeden weiteren Versuch blockieren.
        # PostgREST kennt keine Transaktion ueber zwei Aufrufe, also hier
        # von Hand zuruecknehmen.
        gym.delete("garmin_import_sessions", {"id": f"eq.{session_id}"})
        raise

    return {
        "activity_id": activity_id,
        "status": "vorgemerkt",
        "import_session_id": session_id,
        "split": split or "unklar",
        "saetze": len(satzzeilen),
        "ungemappt": ungemappt,
        "garmin_bezeichnungen": gesehen,
    }


def lade_muskelzuordnung(gym: Gym) -> dict:
    """exercise_id -> Name der primaeren Muskelgruppe (klein geschrieben)."""
    gruppen = {
        g["id"]: str(g.get("name") or "").strip().lower()
        for g in gym.select("muscle_groups", {"select": "id,name", "limit": "200"})
    }
    return {
        e["id"]: gruppen.get(e.get("primary_muscle_id"), "")
        for e in gym.select("exercises", {
            "select": "id,primary_muscle_id", "limit": "500",
        })
    }


def erkenne_split(exercise_ids: list, muskeln: dict) -> str | None:
    """
    Push oder Pull anhand der trainierten Muskelgruppen.

    Zaehlt die Saetze je Lager statt die Uebungen - ein Training mit vier
    Saetzen Rudern und einem Satz Seitheben ist eindeutig Pull. Bei
    Gleichstand oder ohne Treffer bleibt es offen.
    """
    pull = sum(1 for eid in exercise_ids if muskeln.get(eid) in PULL_MUSKELN)
    push = sum(1 for eid in exercise_ids if muskeln.get(eid) in PUSH_MUSKELN)

    if pull > push:
        return "pull"
    if push > pull:
        return "push"
    return None


def ermittle_user_id(gym: Gym) -> str:
    """
    Besitzer der neuen Zeilen.

    Die Gym-Datenbank hat eine eigene Anmeldung, ein KerimOS-Nutzer existiert
    dort nicht - die user_id muss also von aussen kommen. Bevorzugt aus
    GYM_USER_ID; sonst die ID mit den meisten Sessions. Bewusst nicht "die
    erste beste": in der DB liegen noch ein paar alte Testzeilen mit einer
    anderen user_id, die sonst gewinnen könnten.
    """
    ausEnv = os.environ.get("GYM_USER_ID")
    if ausEnv:
        return ausEnv

    zeilen = gym.select("workout_sessions", {"select": "user_id", "limit": "1000"})
    haeufigkeit: dict = {}
    for z in zeilen:
        uid = z.get("user_id")
        if uid:
            haeufigkeit[uid] = haeufigkeit.get(uid, 0) + 1

    if not haeufigkeit:
        raise RuntimeError("GYM_USER_ID fehlt und keine bestehende Session zum Ableiten")

    return max(haeufigkeit.items(), key=lambda p: p[1])[0]


def ersterwert(quelle: dict, *namen):
    """
    Erster nicht-leerer Wert aus mehreren moeglichen Schluesselnamen.

    Garmin benennt dieselbe Kennzahl je nach Endpunkt unterschiedlich
    (totalSteps / steps, totalKilocalories / calories). Statt einen Namen
    anzunehmen werden mehrere durchprobiert.
    """
    if not isinstance(quelle, dict):
        return None
    for name in namen:
        wert = quelle.get(name)
        if wert not in (None, ""):
            return wert
    return None


def ganzzahl(wert):
    try:
        return int(round(float(wert)))
    except (TypeError, ValueError):
        return None


def sync_tagesdaten(gym: Gym, api, user_id: str) -> dict:
    """
    Schritte, Kalorien und Erholungswerte der letzten Tage.

    Wird bei jedem Lauf neu geschrieben (upsert): der laufende Tag ist noch
    nicht fertig, und Garmin korrigiert Werte teils nachtraeglich.
    """
    heute = datetime.now().date()
    geschrieben, fehler = 0, []

    for versatz in range(LOOKBACK_DAYS):
        tag = heute - timedelta(days=versatz)
        iso = tag.isoformat()

        try:
            stats = api.get_stats(iso) or {}
        except Exception as f:
            fehler.append(f"{iso}: stats {f}")
            continue

        zeile = {
            "user_id": user_id,
            "datum": iso,
            "schritte": ganzzahl(ersterwert(stats, "totalSteps", "steps")),
            "schritte_ziel": ganzzahl(ersterwert(stats, "dailyStepGoal", "stepGoal")),
            "distanz_m": ganzzahl(ersterwert(stats, "totalDistanceMeters", "distanceMeters")),
            "etagen": ganzzahl(ersterwert(stats, "floorsAscended")),
            "intensitaets_minuten": ganzzahl(ersterwert(
                stats, "moderateIntensityMinutes", "intensityMinutes")),
            "kalorien_gesamt": ganzzahl(ersterwert(
                stats, "totalKilocalories", "totalCalories", "calories")),
            "kalorien_aktiv": ganzzahl(ersterwert(
                stats, "activeKilocalories", "activeCalories")),
            "kalorien_grundumsatz": ganzzahl(ersterwert(
                stats, "bmrKilocalories", "restingCalories")),
            "ruhepuls": ganzzahl(ersterwert(
                stats, "restingHeartRate", "restingHeartRateTimestamp")),
            "herzfrequenz_min": ganzzahl(ersterwert(stats, "minHeartRate")),
            "herzfrequenz_max": ganzzahl(ersterwert(stats, "maxHeartRate")),
            "stress_schnitt": ganzzahl(ersterwert(
                stats, "averageStressLevel", "avgStressLevel")),
            "body_battery_hoechster": ganzzahl(ersterwert(
                stats, "bodyBatteryHighestValue", "bodyBatteryMostRecentValue")),
            "body_battery_tiefster": ganzzahl(ersterwert(stats, "bodyBatteryLowestValue")),
            "aktualisiert_am": datetime.now(timezone.utc).isoformat(),
        }

        # HRV liegt in einem eigenen Endpunkt und fehlt an manchen Tagen -
        # das darf den Rest der Zeile nicht verhindern.
        try:
            hrv = api.get_hrv_data(iso) or {}
            zusammenfassung = hrv.get("hrvSummary") if isinstance(hrv, dict) else None
            zeile["hrv_nacht"] = ganzzahl(ersterwert(
                zusammenfassung or {}, "lastNightAvg", "weeklyAvg"))
        except Exception:
            pass

        try:
            gym.upsert("garmin_daily", zeile, "user_id,datum")
            geschrieben += 1
        except Exception as f:
            fehler.append(f"{iso}: {f}")

    return {"tage_geschrieben": geschrieben, "tage_fehler": fehler[:5]}


def sync() -> dict:
    gym = Gym()
    user_id = ermittle_user_id(gym)

    api, methode = garmin_login(gym)
    mapping = lade_mapping(gym)
    muskeln = lade_muskelzuordnung(gym)

    alle = fetch_alle_aktivitaeten(api)
    aktivitaeten = [a for a in alle if ist_krafttraining(a)]

    berichte = []
    for aktivitaet in aktivitaeten:
        try:
            berichte.append(verarbeite_aktivitaet(
                gym, api, aktivitaet, mapping, user_id, muskeln))
        except Exception as fehler:
            berichte.append({
                "activity_id": aktivitaet.get("activityId"),
                "status": "fehler",
                "fehler": str(fehler),
            })

    # Tagesdaten laufen unabhaengig von den Trainings - ein Problem beim
    # einen darf das andere nicht mitreissen.
    try:
        tagesdaten = sync_tagesdaten(gym, api, user_id)
    except Exception as fehler:
        tagesdaten = {"tage_geschrieben": 0, "tage_fehler": [str(fehler)]}

    ergebnis = {
        "ok": True,
        "login": methode,
        "zeitraum_tage": LOOKBACK_DAYS,
        "aktivitaeten_gesamt": len(alle),
        **tagesdaten,
        "gefunden": len(aktivitaeten),
        "vorgemerkt": sum(1 for b in berichte if b["status"] == "vorgemerkt"),
        "uebersprungen": sum(1 for b in berichte if b["status"] == "uebersprungen"),
        "details": berichte,
    }

    # Wenn nichts passendes dabei war, zeigen was Garmin ueberhaupt geliefert
    # hat - sonst raet man, ob der Filter oder die Uhr das Problem ist.
    if not aktivitaeten:
        ergebnis["vorhandene_typen"] = sorted({
            f"{typ_name(a) or 'unbekannt'} ({str(a.get('startTimeLocal'))[:10]})"
            for a in alle
        })

    return ergebnis


# ---------------------------------------------------------------- Handler

class handler(BaseHTTPRequestHandler):
    def _antwort(self, koerper: dict, code: int = 200) -> None:
        rohdaten = json.dumps(koerper, ensure_ascii=False, default=str).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(rohdaten)))
        self.end_headers()
        self.wfile.write(rohdaten)

    def _erlaubt(self) -> bool:
        """Schutz vor fremden Aufrufen. Vercel-Cron sendet den CRON_SECRET-Header."""
        geheimnis = os.environ.get("CRON_SECRET")
        if not geheimnis:
            return True
        if self.headers.get("Authorization") == f"Bearer {geheimnis}":
            return True
        query = parse_qs(urlparse(self.path).query)
        return query.get("secret", [None])[0] == geheimnis

    def do_GET(self) -> None:
        if not self._erlaubt():
            self._antwort({"ok": False, "fehler": "nicht autorisiert"}, 401)
            return
        try:
            self._antwort(sync())
        except Exception as fehler:
            # Bewusst 200: sonst laeuft der Vercel-Cron in endlose Retries.
            self._antwort({
                "ok": False,
                "fehler": str(fehler),
                "traceback": traceback.format_exc(limit=5),
            })

    def do_POST(self) -> None:
        self.do_GET()
