const TITLE = 'ລາຍງານປະຈຳອາທິດ';
const BODY = 'ທ່ານໄດ້ເຮັດລາຍງານແລ້ວບໍ?\nHave you done your weekly report?\nคุณทำรายงานประจำสัปดาห์แล้วหรือยัง?';

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', function () {});

self.addEventListener('push', function (e) {
  e.waitUntil(self.registration.showNotification(TITLE, {
    body: BODY,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: 'weekly-report',
    renotify: true,
    requireInteraction: false,
    data: { url: './' }
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow('./');
  }));
});
