const TITLE = 'ລາຍງານປະຈຳອາທິດ';
const BODY = 'ທ່ານໄດ້ເຮັດລາຍງານແລ້ວບໍ?\nHave you done your weekly report?\nคุณทำรายงานประจำสัปดาห์แล้วหรือยัง?';

// ປ່ຽນເລກເວີຊັນນີ້ທຸກຄັ້ງທີ່ຢາກບັງຄັບໃຫ້ເຄື່ອງທຸກເຄື່ອງລ້າງ cache ເກົ່າ
const CACHE = 'wr-shell-v2';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'Images-gb.png'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      // ໄຟລ໌ໃດຍັງບໍ່ມີ (ເຊັ່ນ icon ທີ່ຍັງບໍ່ອັບໂຫຼດ) ຈະຖືກຂ້າມ ບໍ່ເຮັດໃຫ້ການຕິດຕັ້ງລົ້ມ
      .then(function (c) { return Promise.allSettled(SHELL.map(function (u) { return c.add(u); })); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) { return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.clients.claim(); })
  );
});

function withTimeout(p, ms) {
  return new Promise(function (resolve, reject) {
    const t = setTimeout(function () { reject(new Error('timeout')); }, ms);
    p.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
  });
}

// ໄຟລ໌ຂອງເວັບເອງ: ລອງເນັດກ່ອນ (ໄດ້ເວີຊັນໃໝ່ສະເໝີ) ຖ້າເນັດຊ້າ/ຂາດ ໃຊ້ສຳເນົາໃນເຄື່ອງ
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await withTimeout(fetch(req), 4000);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = (await cache.match(req, { ignoreSearch: true })) ||
      (req.mode === 'navigate' ? ((await cache.match('index.html')) || (await cache.match('./'))) : null);
    return hit || Response.error();
  }
}

// ຟອນ Google: ໃຊ້ສຳເນົາທີ່ມີກ່ອນ ແລ້ວອັບເດດຢູ່ເບື້ອງຫຼັງ
async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const net = fetch(req).then(function (res) {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  }).catch(function () { return null; });
  return hit || (await net) || Response.error();
}

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;            // POST ສົ່ງລາຍງານ ບໍ່ຜ່ານ cache
  const url = new URL(req.url);
  if (url.origin === self.location.origin) { e.respondWith(networkFirst(req)); return; }
  if (FONT_HOSTS.indexOf(url.hostname) >= 0) { e.respondWith(staleWhileRevalidate(req)); return; }
  // ອື່ນໆ (Apps Script, Worker) ໃຫ້ເບຣົາເຊີຈັດການເອງ ບໍ່ cache ຂໍ້ມູນລາຍງານ
});

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
