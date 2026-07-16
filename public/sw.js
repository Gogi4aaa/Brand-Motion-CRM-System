// BrandMotion web-push service worker.
// Shows a notification on push and focuses/opens the app on click.

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* ignore */ }
  const title = data.title || "BrandMotion";
  const body = data.body || "";
  const link = data.link || "/production";
  event.waitUntil(
    self.registration.showNotification(title, { body, tag: link, data: { link } })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ("focus" in w) return w.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/production");
    })
  );
});
