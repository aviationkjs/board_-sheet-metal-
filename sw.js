/*
 * 서비스 워커 — 오프라인에서도 화면이 뜨게 하고, 다시 들어올 때 빠르게 열리게 합니다.
 *
 * ★ 파일을 고쳐 배포할 때마다 아래 VERSION 을 반드시 올리세요.
 *   올리지 않으면 사용자 기기에 예전 화면이 남아 있을 수 있습니다.
 *
 * 저장하지 않는 것
 *   - Firebase 실시간 데이터( *.firebaseio.com ) : 항상 실시간으로 주고받아야 함
 *   - FT-200 PDF (13MB) : 용량이 커서 제외
 */
const VERSION = "v20261127-5";
const CACHE = "board-" + VERSION;

/* 처음 설치할 때 미리 받아 두는 화면들 (쿼리 ?v= 없이 적습니다) */
const SHELL = [
  "./",
  "index.html",
  "auth.html",
  "admin.html",
  "logs.html",
  "duty_roster.html",
  "remove_list.html",
  "material_request.html",
  "divider.html",
  "info.html",
  "gantt.html",
  "takryu.html",
  "ladder.html",
  "pdf_viewer.html",
  "tokens.css",
  "style.css",
  "pages.css",
  "header.css",
  "app.js",
  "matreq-notify.js",
  "notice.js",
  "pwa.js",
  "manifest.json",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/apple-touch-icon.png"
];

/* 저장해도 되는 바깥 주소 (글꼴 · Firebase SDK 파일) */
const CDN = ["fonts.googleapis.com", "fonts.gstatic.com", "www.gstatic.com"];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // 하나가 실패해도 설치 자체는 되도록 개별 처리합니다.
    await Promise.all(SHELL.map(u => c.add(u).catch(err => console.warn("[sw] 미리받기 실패:", u, err))));
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("board-") && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* 새 버전을 바로 적용하라는 신호 (pwa.js 의 '새로고침' 단추) */
self.addEventListener("message", e => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // 실시간 데이터·PDF·범위 요청은 손대지 않습니다.
  if (!sameOrigin && !CDN.includes(url.hostname)) return;
  if (url.pathname.endsWith(".pdf")) return;
  if (req.headers.has("range")) return;

  // 화면 이동: 네트워크 우선 (항상 최신), 안 되면 저장본
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const c = await caches.open(CACHE);
        c.put(req, fresh.clone());
        return fresh;
      } catch (err) {
        const c = await caches.open(CACHE);
        return (await c.match(req, { ignoreSearch: true })) ||
               (await c.match("index.html")) ||
               new Response("오프라인입니다. 연결되면 다시 열어 주세요.",
                 { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    })());
    return;
  }

  // 그 밖의 파일: 저장본을 먼저 보여 주고 뒤에서 새로 받아 둡니다.
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then(res => {
      if (res && (res.ok || res.type === "opaque")) c.put(req, res.clone());
      return res;
    }).catch(() => null);
    return hit || (await net) ||
      new Response("", { status: 504, statusText: "오프라인" });
  })());
});

/* 알림을 누르면 해당 화면(자재청구)으로 — 이미 열린 창이 있으면 그 창을 씁니다 */
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (w.url.startsWith(self.registration.scope) && "focus" in w) {
        await w.focus();
        if ("navigate" in w) return w.navigate(url);
        return;
      }
    }
    return self.clients.openWindow(url);
  })());
});
