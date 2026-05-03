/* Denlight service worker — handles push notifications */

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data?.json() || {}; } catch (_) {}
  const title = data.title || 'Denlight';
  const options = {
    body: data.body || 'Someone replied in the den.',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: data.tag || 'denlight-reply',
    renotify: true,
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));
