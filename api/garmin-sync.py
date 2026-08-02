"""
Garmin -> KerimOS Sync.

Holt Krafttrainings von Garmin Connect und schreibt sie in die Gym-Datenbank
(Supabase-Projekt "Gymapp Cursor"). Laeuft als Vercel Python Serverless
Function, taeglich per Cron.

Ablauf:
  1. Anmeldung bei Garmin - bevorzugt mit gecachtem Token aus der Tabelle
     `settings`, sonst frischer Login mit E-Mail/Passwort.
  2. Krafttrainings der letzten 7 Tage holen.
  3. Pro Aktivitaet die einzelnen Saetze abrufen.
  4. Aktivitaeten, die schon importiert sind (garmin_activity_id), ueberspringen.
  5. Session in `workout_sessions` + Saetze in `exercise_logs` schreiben.

Bewusste Entscheidungen:
  - Zugriff auf Supabase per PostgREST (requests) statt der supabase-Lib:
    weniger Abhaengigkeiten, und der Service-Role-Key umgeht RLS ohnehin.
  - Fehler liefern HTTP 200 mit Fehlertext im Body, damit Vercel den Cron
    nicht als hart fehlgeschlagen markiert und in Dauer-Retry geht.
  - Es werden NUR die Tabellen workout_sessions und exercise_logs beschrieben.
    set_entries / workout_session_exercises sind in dieser DB unbenutzt.

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
GARMIN_ACTIVITY_TYPES = ("strength_training", "indoor_cardio")


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
        r.raise_for_status()
        return r.json() if return_rows else []

    def upsert_setting(self, key: str, value: str) -> None:
        headers = dict(self.headers)
        headers["Prefer"] = "resolution=merge-duplicates,return=minimal"
        requests.post(
            f"{self.base}/settings",
            headers=headers,
            json={
                "key": key,
                "value": value,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            timeout=30,
        )

    def get_setting(self, key: str):
        rows = self.select("settings", {"key": f"eq.{key}", "select": "value", "limit": 1})
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

    Der Normalfall ist der gespeicherte Token aus der Tabelle `settings`.
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
            # Ein echter Aufruf ist der einzige verlaessliche Gueltigkeitstest.
            api.get_user_summary(datetime.now().date().isoformat())

            aktualisiert = token_traeger(api).dumps()
            if aktualisiert != cached:
                gym.upsert_setting(TOKEN_SETTING_KEY, aktualisiert)

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


def fetch_strength_activities(api) -> list:
    """Krafttrainings der letzten LOOKBACK_DAYS Tage."""
    ende = datetime.now().date()
    start = ende - timedelta(days=LOOKBACK_DAYS)
    gesehen, ergebnis = set(), []

    for typ in GARMIN_ACTIVITY_TYPES:
        try:
            for a in api.get_activities_by_date(start.isoformat(), ende.isoformat(), typ):
                aid = a.get("activityId")
                if aid and aid not in gesehen:
                    gesehen.add(aid)
                    ergebnis.append(a)
        except Exception:
            continue  # Ein unbekannter Typ darf den Rest nicht blockieren.

    return ergebnis


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


def uebung_aufloesen(mapping: dict, kategorie: str, name: str):
    if not kategorie:
        return None
    if name:
        treffer = mapping.get(f"{kategorie}|{name}")
        if treffer:
            return treffer
    return mapping.get(f"{kategorie}|*")


def verarbeite_aktivitaet(gym: Gym, api, aktivitaet: dict, mapping: dict,
                          user_id: str) -> dict:
    """Importiert eine einzelne Garmin-Aktivitaet. Gibt einen Statusbericht zurueck."""
    activity_id = aktivitaet.get("activityId")

    # --- Idempotenz -------------------------------------------------------
    if gym.select(
        "workout_sessions",
        {"garmin_activity_id": f"eq.{activity_id}", "select": "id", "limit": 1},
    ):
        return {"activity_id": activity_id, "status": "uebersprungen"}

    # --- Saetze holen -----------------------------------------------------
    daten = api.get_activity_exercise_sets(activity_id)
    saetze = (daten or {}).get("exerciseSets") or []
    aktive = [s for s in saetze if str(s.get("setType", "")).upper() == "ACTIVE"]
    if not aktive:
        return {"activity_id": activity_id, "status": "keine_saetze"}

    start = parse_zeit(aktivitaet.get("startTimeLocal"))
    dauer = float(aktivitaet.get("duration") or 0)
    ende = start + timedelta(seconds=dauer) if start else None

    # --- Saetze in Logzeilen uebersetzen ---------------------------------
    logzeilen, ungemappt, satzzaehler = [], {}, {}

    for satz in aktive:
        info = (satz.get("exercises") or [{}])[0]
        kategorie = (info.get("category") or "").upper()
        name = (info.get("name") or "").upper()

        exercise_id = uebung_aufloesen(mapping, kategorie, name)
        if not exercise_id:
            schluessel = f"{kategorie}/{name}" if name else kategorie
            ungemappt[schluessel] = ungemappt.get(schluessel, 0) + 1
            continue

        satzzaehler[exercise_id] = satzzaehler.get(exercise_id, 0) + 1

        # Garmin liefert Gramm.
        gewicht = satz.get("weight")
        gewicht_kg = round(float(gewicht) / 1000.0, 2) if gewicht else None

        satzstart = parse_zeit(satz.get("startTime"))
        logzeilen.append({
            "workout_session_id": None,  # wird nach dem Session-Insert gesetzt
            "exercise_id": exercise_id,
            "set_number": satzzaehler[exercise_id],
            "weight_kg": gewicht_kg,
            "reps": satz.get("repetitionCount"),
            "rir": None,
            "completed_at": satzstart.isoformat() if satzstart else None,
        })

    if not logzeilen and not ungemappt:
        return {"activity_id": activity_id, "status": "keine_saetze"}

    # --- Notiz: nichts still verwerfen -----------------------------------
    notizteile = [f"Garmin-Import (Aktivität {activity_id})"]
    for schluessel, anzahl in sorted(ungemappt.items()):
        notizteile.append(f"Unmapped: {schluessel} ({anzahl} Sätze)")

    # --- Session anlegen --------------------------------------------------
    session = gym.insert("workout_sessions", {
        "user_id": user_id,
        "training_day_id": None,
        "started_at": start.isoformat() if start else None,
        "completed_at": ende.isoformat() if ende else None,
        "notes": " | ".join(notizteile),
        "log_source": "garmin",
        "garmin_activity_id": activity_id,
    }, return_rows=True)

    session_id = session[0]["id"]

    if logzeilen:
        for zeile in logzeilen:
            zeile["workout_session_id"] = session_id
        gym.insert("exercise_logs", logzeilen)

    return {
        "activity_id": activity_id,
        "status": "importiert",
        "session_id": session_id,
        "saetze": len(logzeilen),
        "ungemappt": ungemappt,
    }


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


def sync() -> dict:
    gym = Gym()
    user_id = ermittle_user_id(gym)

    api, methode = garmin_login(gym)
    mapping = lade_mapping(gym)
    aktivitaeten = fetch_strength_activities(api)

    berichte = []
    for aktivitaet in aktivitaeten:
        try:
            berichte.append(verarbeite_aktivitaet(gym, api, aktivitaet, mapping, user_id))
        except Exception as fehler:
            berichte.append({
                "activity_id": aktivitaet.get("activityId"),
                "status": "fehler",
                "fehler": str(fehler),
            })

    return {
        "ok": True,
        "login": methode,
        "gefunden": len(aktivitaeten),
        "importiert": sum(1 for b in berichte if b["status"] == "importiert"),
        "uebersprungen": sum(1 for b in berichte if b["status"] == "uebersprungen"),
        "details": berichte,
    }


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
