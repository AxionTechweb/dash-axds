/*
 * Service worker do PWA do painel.
 *
 * Só guarda os ÍCONES do app. Nunca o HTML/JS/CSS nem os dados: é um painel
 * ao vivo e a Vercel publica versão nova a cada push — cachear o código
 * prenderia gente numa versão velha, e cachear dados mostraria número
 * desatualizado sem ninguém perceber. Todo o resto vai direto para a rede.
 */
const CACHE = "axion-icons-v1";
const ICONS = [
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ICONS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Apaga caches de versões anteriores deste service worker.
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (!ICONS.includes(url.pathname)) return; // resto: rede, sem interceptar

  event.respondWith(caches.match(event.request).then((hit) => hit || fetch(event.request)));
});

/* ------------------------------------------------------------ notificações */

// Push do servidor (src/lib/push.ts) → notificação na barra do aparelho, com
// o som/vibração padrão do sistema.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Axion", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Axion";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      vibrate: [200, 100, 200],
      data: { url: data.url || "/dashboard" },
    }),
  );
});

// Toque na notificação → foca o painel já aberto (navegando para a página) ou abre um novo.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/dashboard", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
