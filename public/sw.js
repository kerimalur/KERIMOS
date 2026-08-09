/**
 * Service Worker für KerimOS.
 *
 * Bewusst OHNE Offline-Caching: KerimOS zeigt fast nur Live-Daten aus
 * Supabase, ein Cache würde alte Zahlen anzeigen und wäre schlimmer als
 * eine ehrliche Fehlermeldung. Der Worker existiert allein für Web Push -
 * ohne registrierten Service Worker gibt es unter Android keine
 * System-Benachrichtigungen.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let daten = {};
  try {
    daten = event.data ? event.data.json() : {};
  } catch {
    daten = { title: "KerimOS", body: event.data ? event.data.text() : "" };
  }

  const titel = daten.title || "KerimOS";
  const optionen = {
    body: daten.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: daten.tag || undefined,
    // Ein neuer Alarm zum selben Pair ersetzt den alten still, statt
    // zweimal zu vibrieren - ausser der Server sagt ausdrücklich etwas
    // anderes.
    renotify: Boolean(daten.tag) && daten.renotify !== false,
    requireInteraction: daten.requireInteraction === true,
    vibrate: [80, 40, 80],
    data: { url: daten.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(titel, optionen));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const ziel = (event.notification.data && event.notification.data.url) || "/";

  // Ein schon offenes KerimOS-Fenster wiederverwenden statt ein zweites
  // aufzumachen.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((liste) => {
      for (const client of liste) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(ziel);
          return client.focus();
        }
      }
      return self.clients.openWindow(ziel);
    }),
  );
});
