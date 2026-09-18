// Service Worker untuk Web Push ntfy
// Di-serve dari https://posyandukkn26.my.id/sw-ntfy.js

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let title = "Pengumuman Posyandu";
  let body = "";
  let url = "https://posyandukkn26.my.id/mother";

  try {
    // ntfy Web Push payload format
    const data = event.data.json();
    title = data.title ?? data.m ?? "Pengumuman Posyandu";
    body = data.message ?? data.b ?? data.m ?? "";
    url = data.click ?? "https://posyandukkn26.my.id/mother";
  } catch {
    body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-72.png",
      tag: "posyandu-announcement",
      renotify: true,
      requireInteraction: false,
      data: { url },
      vibrate: [200, 100, 200],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "https://posyandukkn26.my.id/mother";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes("posyandukkn26.my.id") && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    }),
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  // Re-subscribe otomatis jika subscription expired
  event.waitUntil(
    self.registration.pushManager
      .subscribe(event.oldSubscription
        ? { userVisibleOnly: true, applicationServerKey: event.oldSubscription.options.applicationServerKey }
        : { userVisibleOnly: true })
      .then((sub) => {
        return fetch("https://ntfy.posyandukkn26.my.id/v1/webpush", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            topics: ["posyandu-broadcast"],
            endpoint: sub.endpoint,
            key: btoa(String.fromCharCode(...new Uint8Array(sub.getKey("p256dh") ?? new ArrayBuffer(0)))),
            auth: btoa(String.fromCharCode(...new Uint8Array(sub.getKey("auth") ?? new ArrayBuffer(0)))),
          }),
        });
      }),
  );
});
