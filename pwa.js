/*
 * PWA 연결 — 서비스 워커 등록, 새 버전 알림, 홈 화면 설치 안내.
 * 모든 페이지에서 불러 쓰므로 바깥 CSS 에 기대지 않고 생김새를 직접 넣었습니다.
 */
(function () {
  "use strict";

  /* ── 안내 띠 ─────────────────────────────── */
  function toast(text, btnText, onClick) {
    const box = document.createElement("div");
    box.setAttribute("role", "status");
    box.style.cssText = [
      "position:fixed", "left:50%", "bottom:20px", "transform:translateX(-50%)",
      "z-index:9999", "display:flex", "align-items:center", "gap:12px",
      "max-width:calc(100vw - 32px)", "padding:10px 12px 10px 16px",
      "border-radius:12px", "background:#0A1317", "color:#fff",
      "font-family:'Pretendard',-apple-system,'Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif",
      "font-size:14px", "line-height:20px",
      "box-shadow:0 8px 24px rgba(0,0,0,.25)"
    ].join(";");

    const msg = document.createElement("span");
    msg.textContent = text;
    box.appendChild(msg);

    if (btnText) {
      const b = document.createElement("button");
      b.textContent = btnText;
      b.style.cssText = [
        "border:none", "border-radius:8px", "padding:6px 12px",
        "background:#0064E0", "color:#fff", "font:inherit",
        "font-weight:600", "cursor:pointer", "white-space:nowrap"
      ].join(";");
      b.onclick = () => { box.remove(); onClick && onClick(); };
      box.appendChild(b);
    }

    const x = document.createElement("button");
    x.textContent = "✕";
    x.setAttribute("aria-label", "닫기");
    x.style.cssText = "border:none;background:transparent;color:#AAAFB5;font:inherit;cursor:pointer;padding:4px";
    x.onclick = () => box.remove();
    box.appendChild(x);

    document.body.appendChild(box);
    return box;
  }

  /* ── 서비스 워커 ─────────────────────────── */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").then(function (reg) {
        // 이미 기다리는 새 버전이 있으면 바로 알림
        if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);

        reg.addEventListener("updatefound", function () {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener("statechange", function () {
            // controller 가 있어야 '처음 설치'가 아니라 '갱신'입니다.
            if (sw.state === "installed" && navigator.serviceWorker.controller) offerUpdate(sw);
          });
        });
      }).catch(function (e) {
        console.warn("[pwa] 서비스 워커 등록 실패:", e);
      });

      // 새 워커가 실제로 켜지면 한 번만 새로 그립니다.
      let reloading = false;
      navigator.serviceWorker.addEventListener("controllerchange", function () {
        if (reloading) return;
        reloading = true;
        location.reload();
      });
    });
  }

  function offerUpdate(worker) {
    toast("새 버전이 있습니다.", "새로고침", function () {
      worker.postMessage("SKIP_WAITING");   // controllerchange 가 뜨면서 새로 그려집니다
    });
  }

  /* ── 홈 화면에 설치 ──────────────────────── */
  const installBtn = document.getElementById("installBtn");
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches ||
                     window.navigator.standalone === true;
  let deferred = null;

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferred = e;
    if (installBtn) installBtn.hidden = false;
  });

  // 아이폰·아이패드는 beforeinstallprompt 가 없어서 직접 안내합니다.
  if (installBtn && isIOS && !standalone) installBtn.hidden = false;

  if (installBtn) {
    installBtn.onclick = function () {
      if (deferred) {
        deferred.prompt();
        deferred.userChoice.finally(function () {
          deferred = null;
          installBtn.hidden = true;
        });
      } else if (isIOS) {
        alert("홈 화면에 추가하기\n\n1. 아래 공유 단추(□↑)를 누릅니다\n2. '홈 화면에 추가'를 고릅니다\n3. 오른쪽 위 '추가'를 누릅니다");
      } else {
        alert("브라우저 메뉴에서 '앱 설치' 또는 '홈 화면에 추가'를 눌러 주세요.");
      }
    };
  }

  window.addEventListener("appinstalled", function () {
    if (installBtn) installBtn.hidden = true;
  });
})();
