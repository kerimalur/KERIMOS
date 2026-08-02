"""
Garmin-Token einmalig von diesem Rechner holen.

Warum es dieses Script gibt:
Garmin drosselt Anmeldungen aus Rechenzentren sehr hart - ein Login-Versuch
von einer Vercel-IP endet zuverlaessig in "429 too many requests". Von einem
normalen Heimanschluss klappt er dagegen problemlos.

Also: hier anmelden, den Token in die Gym-Datenbank legen, und die Vercel-
Function benutzt ab dann nur noch diesen Token. Sie meldet sich nie wieder
selbst an.

Der Token haelt ungefaehr ein Jahr. Wenn der Sync irgendwann meldet, dass die
Anmeldung abgelaufen ist, dieses Script einfach noch einmal laufen lassen.

Aufruf (im Ordner Kompass):
    pip install garminconnect requests
    python tools/garmin-token/hole-token.py
"""

import os
import sys
from pathlib import Path

import requests

TOKEN_SETTING_KEY = "garmin_session"


def lade_env_local() -> None:
    """Liest .env.local aus dem Projektwurzelverzeichnis in os.environ."""
    wurzel = Path(__file__).resolve().parents[2]
    datei = wurzel / ".env.local"
    if not datei.exists():
        print(f"Keine .env.local gefunden unter {datei}")
        return

    for zeile in datei.read_text(encoding="utf-8").splitlines():
        zeile = zeile.strip()
        if not zeile or zeile.startswith("#") or "=" not in zeile:
            continue
        schluessel, wert = zeile.split("=", 1)
        os.environ.setdefault(schluessel.strip(), wert.strip().strip('"').strip("'"))


def pflicht(name: str) -> str:
    wert = os.environ.get(name)
    if not wert:
        print(f"FEHLER: {name} fehlt (in .env.local oder als Umgebungsvariable)")
        sys.exit(1)
    return wert


def main() -> None:
    lade_env_local()

    supabase_url = pflicht("GYM_SUPABASE_URL").rstrip("/")
    supabase_key = pflicht("GYM_SUPABASE_SERVICE_ROLE_KEY")

    email = os.environ.get("GARMIN_EMAIL") or input("Garmin E-Mail: ").strip()
    passwort = os.environ.get("GARMIN_PASSWORD")
    if not passwort:
        import getpass
        passwort = getpass.getpass("Garmin Passwort: ")

    from garminconnect import Garmin

    print("Melde mich bei Garmin an…")
    print("(429-Meldungen unterwegs sind normal - die Library probiert")
    print(" mehrere Wege durch und braucht nur einen davon.)")
    api = Garmin(email, passwort)

    # Bei aktivierter Zwei-Faktor-Anmeldung fragt garminconnect hier nach dem
    # Code. Das ist genau der Grund, warum das lokal passiert und nicht auf
    # dem Server - dort koennte niemand den Code eintippen.
    api.login()

    # garminconnect 0.3.x haelt die Token in .client, aeltere Versionen
    # in .garth. Beide koennen dumps().
    traeger = getattr(api, "client", None) or getattr(api, "garth", None)
    if traeger is None:
        print("FEHLER: garminconnect kennt weder .client noch .garth.")
        print("Bitte 'pip install garminconnect==0.3.2' ausführen.")
        sys.exit(1)

    token = traeger.dumps()
    if len(token) <= 512:
        print(f"WARNUNG: Token ist nur {len(token)} Zeichen lang.")
        print("Der Server erwartet mehr als 512 - sonst hält er ihn für einen Pfad.")

    print(f"Angemeldet als {api.display_name}. Token ist {len(token)} Zeichen lang.")

    print("Schreibe Token in die Gym-Datenbank…")
    antwort = requests.post(
        f"{supabase_url}/rest/v1/settings",
        headers={
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
        json={"key": TOKEN_SETTING_KEY, "value": token},
        timeout=30,
    )
    antwort.raise_for_status()

    print()
    print("Fertig. Der Sync auf Vercel benutzt ab jetzt diesen Token.")
    print("Naechster Schritt: in KerimOS unter Gym → Mehr → Garmin auf")
    print("\"Jetzt synchronisieren\" drücken.")


if __name__ == "__main__":
    main()
