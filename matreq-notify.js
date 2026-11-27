/*
 * 자재청구 새 청구 알림 — 자재청구 담당자(requestAdmin)와 주관리자(admin)에게만.
 *
 * 성능보드판이 열려 있거나 뒤에 떠 있을 때 새 청구가 들어오면 폰 알림을 띄웁니다.
 * 앱을 완전히 끈 상태에서는 오지 않습니다 (그건 Firebase Blaze + 서버 함수가 필요).
 * 대문(app.js)과 자재청구 페이지(material_request.html)가 함께 불러 씁니다.
 */
import { ref, onValue, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const ITEMS = "materialRequests/items";
const PAGE = "material_request.html";

/** 담당자인지 확인 */
export async function isRequestManager(db, username) {
  if (!username) return false;
  if (username === "admin") return true;
  try {
    const s = await get(ref(db, "users/" + username));
    return s.exists() && s.val().requestAdmin === true;
  } catch (e) { return false; }
}

export function notifySupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

/** 알림 권한 요청 — 반드시 단추 누름 같은 사용자 동작 안에서 부르세요 */
export async function askNotifyPermission() {
  if (!notifySupported()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  try { return await Notification.requestPermission(); } catch (e) { return "denied"; }
}

async function show(key, r) {
  if (!notifySupported() || Notification.permission !== "granted") return;
  const title = `새 자재청구 · ${r.no || ""}`.trim();
  const body = [r.category, r.process, r.pn, `${r.qty || ""}${r.unit ? " " + r.unit : ""}`, r.requester]
    .filter(Boolean).join(" · ");
  const opt = { body, tag: "matreq-" + key, icon: "assets/icon-192.png", badge: "assets/icon-192.png",
                data: { url: PAGE } };
  try {
    // 안드로이드 크롬은 서비스 워커를 통해야만 알림이 뜹니다
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if (reg) { await reg.showNotification(title, opt); return; }
    const n = new Notification(title, opt);
    n.onclick = () => { window.focus(); location.href = PAGE; };
  } catch (e) { console.warn("[알림] 표시 실패:", e); }
}

/**
 * 새 청구 감시 시작. 담당자가 아니면 아무것도 하지 않고 false.
 * 처음 불러온 목록은 알리지 않고, 그 뒤 새로 생긴 청구만 알립니다.
 * 내가 올린 청구는 알리지 않습니다.
 */
export async function watchNewRequests(db, username) {
  if (!(await isRequestManager(db, username))) return false;
  const seen = new Set();
  let first = true;
  const start = Date.now();
  onValue(ref(db, ITEMS), snap => {
    const all = snap.val() || {};
    Object.entries(all).forEach(([k, r]) => {
      if (seen.has(k)) return;
      seen.add(k);
      if (first || !r) return;
      if ((r.createdAt || 0) < start - 60000) return;
      if (r.createdBy === username) return;
      show(k, r);
    });
    first = false;
  });
  return true;
}
