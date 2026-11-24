/*
 * 공지 · 달력 — 대문(index.html)의 탭 3개(공지 / 달력 / 스티커)를 담당합니다.
 * 스티커 보드 자체는 기존 app.js가 그대로 맡고 있어 이 파일은 손대지 않습니다.
 * Firebase 설정은 다른 단일 페이지들(remove_list.html, gantt.html …)과 같은 방식으로 각자 가집니다.
 */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase, ref, push, onValue, update, remove, get
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBsOQMj6GTx1GVJVqjurZGlk0c1v1MjNOk",
  authDomain: "board-sheet-metal.firebaseapp.com",
  databaseURL: "https://board-sheet-metal-default-rtdb.firebaseio.com",
  projectId: "board-sheet-metal",
  storageBucket: "board-sheet-metal.firebasestorage.app",
  messagingSenderId: "300454183349",
  appId: "1:300454183349:web:7a5e681d9c6c1f7b5999fc"
};

// app.js가 이미 초기화했으면 그 앱을 그대로 씁니다.
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getDatabase(app);

const username = localStorage.getItem("username");

/* ── 작은 도구들 ───────────────────────────────── */
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g,
  c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const pad2 = n => String(n).padStart(2, "0");
const ymd = d => d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
const todayYmd = () => ymd(new Date());
function parseYmd(s) { const p = String(s).split("-").map(Number); return new Date(p[0], p[1] - 1, p[2]); }
function mdLabel(s) { const d = parseYmd(s); return (d.getMonth() + 1) + "/" + d.getDate(); }
function dateLabel(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return (d.getMonth() + 1) + "월 " + d.getDate() + "일 " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
}
function rangeLabel(from, to) {
  return (!to || to === from) ? mdLabel(from) : mdLabel(from) + "~" + mdLabel(to);
}

const COLOR = {
  accent: "var(--color-accent)",
  blue:   "var(--note-blue-line)",
  green:  "var(--note-green-line)",
  orange: "var(--note-orange-line)",
  pink:   "var(--note-pink-line)",
  purple: "var(--note-purple-line)",
  teal:   "var(--note-teal-line)"
};

async function recordLog(action, details = {}) {
  try {
    await update(ref(db, "logs/" + Date.now()), { user: username, action, details, timestamp: Date.now() });
  } catch (e) { console.error("로그 기록 오류:", e); }
}

/* ── 상태 ──────────────────────────────────────── */
let canManage = username === "admin";   // 관리자 또는 공지 부관리자
let notices = {};
let events = {};
let showArchived = false;
let openId = null;          // 펼쳐 둔 공지
let replyUnsub = null;      // 그 공지의 답글 구독 해제 함수
let replyData = {};
let replyDraft = {};        // 입력 중이던 답글 (다시 그릴 때 보존)
let replyFocused = false;
let view = new Date();      // 달력이 보고 있는 달
let selected = todayYmd();  // 달력에서 고른 날
let tab = localStorage.getItem("boardTab") || "notice";

/* ── 탭 ────────────────────────────────────────── */
function setTab(name) {
  tab = name;
  try { localStorage.setItem("boardTab", name); } catch (e) {}

  document.querySelectorAll(".tab").forEach(b => {
    const on = b.dataset.tab === name;
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });

  $("panelNotice").hidden   = name !== "notice";
  $("panelCalendar").hidden = name !== "calendar";
  $("board").hidden         = name !== "board";

  $("addNoticeBtn").hidden = !(name === "notice" && canManage);
  $("addEventBtn").hidden  = name !== "calendar";          // 일정 등록은 전원
  $("addNoteBtn").hidden   = name !== "board";
  $("noticeBar").hidden    = !(name === "notice" && canManage);
}

/* ── 공지 목록 ─────────────────────────────────── */
function noticeList() {
  return Object.entries(notices)
    .map(([id, n]) => Object.assign({ id }, n))
    .filter(n => showArchived ? !!n.archived : !n.archived)
    .sort((a, b) =>
      (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) ||
      (b.createdAt || 0) - (a.createdAt || 0));
}

function updateBadge() {
  const n = Object.values(notices)
    .filter(x => x && !x.archived && !(x.readers && x.readers[username])).length;
  const el = $("noticeBadge");
  el.hidden = n === 0;
  el.textContent = n;
}

function cardHtml(n) {
  const unread = !(n.readers && n.readers[username]);
  const readers = n.readers ? Object.keys(n.readers) : [];
  const open = openId === n.id;
  const cls = ["notice"];
  if (open) cls.push("open");
  if (unread) cls.push("unread");
  if (n.level === "important") cls.push("important");

  const badges =
    (unread ? '<span class="badge new">새 글</span>' : "") +
    (n.level === "important" ? '<span class="badge important">중요</span>' : "") +
    (n.pinned ? '<span class="badge pin">고정</span>' : "") +
    (n.dateFrom ? `<span class="badge date">${esc(rangeLabel(n.dateFrom, n.dateTo))}</span>` : "");

  const edited = n.updatedAt && n.updatedAt !== n.createdAt
    ? ` · 수정 ${esc(dateLabel(n.updatedAt))}` : "";

  const manage = canManage
    ? (n.archived
        ? `<button class="chip restore-btn">보관 해제</button>`
        : `<button class="chip edit-btn">수정</button><button class="chip archive-btn">보관</button>`)
    : "";

  return `
  <article class="${cls.join(" ")}" data-id="${esc(n.id)}">
    <div class="notice-head">
      ${badges}
      <h3 class="notice-title">${esc(n.title || "(제목 없음)")}</h3>
    </div>
    <div class="notice-sub">${esc(n.author || "?")} · ${esc(dateLabel(n.createdAt))}${edited}</div>
    <div class="notice-body">${esc(n.body || "")}</div>
    <div class="notice-foot">
      <span class="chip plain" title="${esc(readers.join(", "))}">읽음 ${readers.length}</span>
      <button class="chip reply-chip">답글 ${n.replyCount || 0}</button>
      <span class="grow"></span>
      ${manage}
    </div>
    <div class="replies" ${open ? "" : "hidden"}></div>
  </article>`;
}

function renderNotices() {
  const box = $("noticeList");
  const arr = noticeList();
  $("archiveToggle").textContent = showArchived ? "← 공지 목록" : "보관함 보기";

  if (!arr.length) {
    box.innerHTML = `<div class="empty-msg">${showArchived ? "보관된 공지가 없습니다." : "등록된 공지가 없습니다."}</div>`;
    return;
  }

  box.innerHTML = arr.map(cardHtml).join("");

  box.querySelectorAll(".notice").forEach(card => {
    const id = card.dataset.id;
    card.querySelector(".notice-head").onclick = () => toggleNotice(id);
    const rc = card.querySelector(".reply-chip");
    if (rc) rc.onclick = () => toggleNotice(id);
    const eb = card.querySelector(".edit-btn");
    if (eb) eb.onclick = () => openNoticeDlg(id);
    const ab = card.querySelector(".archive-btn");
    if (ab) ab.onclick = () => archiveNotice(id, true);
    const rb = card.querySelector(".restore-btn");
    if (rb) rb.onclick = () => archiveNotice(id, false);
  });

  if (openId) renderReplies(openId);
}

/* ── 펼치기 · 읽음 ─────────────────────────────── */
function closeOpen() {
  if (replyUnsub) { replyUnsub(); replyUnsub = null; }
  openId = null;
  replyData = {};
}

function toggleNotice(id) {
  if (openId === id) { closeOpen(); renderNotices(); return; }
  closeOpen();
  openId = id;
  markRead(id);
  replyUnsub = onValue(ref(db, "replies/" + id), snap => {
    replyData = snap.val() || {};
    renderReplies(id);
    syncReplyCount(id);
  });
  renderNotices();
}

function markRead(id) {
  const n = notices[id];
  if (!n || (n.readers && n.readers[username])) return;
  update(ref(db, "notices/" + id + "/readers"), { [username]: Date.now() })
    .catch(e => console.error("읽음 기록 오류:", e));
}

function syncReplyCount(id) {
  const c = Object.keys(replyData).length;
  const n = notices[id];
  if (n && (n.replyCount || 0) !== c) {
    update(ref(db, "notices/" + id), { replyCount: c }).catch(() => {});
  }
}

/* ── 답글 ──────────────────────────────────────── */
function renderReplies(id) {
  const card = $("noticeList").querySelector(`.notice[data-id="${CSS.escape(id)}"]`);
  if (!card) return;
  const box = card.querySelector(".replies");
  box.hidden = false;

  const arr = Object.entries(replyData)
    .map(([rid, r]) => Object.assign({ rid }, r))
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  const items = arr.map(r => `
    <div class="reply" data-rid="${esc(r.rid)}">
      <div class="reply-main">
        <div class="reply-who">${esc(r.user)} · ${esc(dateLabel(r.createdAt))}</div>
        <div class="reply-text">${esc(r.text)}</div>
      </div>
      ${(r.user === username || canManage)
        ? '<button class="action-btn del-reply" title="답글 삭제" aria-label="답글 삭제">✕</button>' : ""}
    </div>`).join("");

  box.innerHTML = (items || '<div class="reply-who">첫 답글을 남겨 보세요.</div>') + `
    <div class="reply-form">
      <textarea rows="1" placeholder="답글 달기 (Enter 등록, Shift+Enter 줄바꿈)" maxlength="500"></textarea>
      <button class="nav-btn accent send-reply">등록</button>
    </div>`;

  const ta = box.querySelector("textarea");
  ta.value = replyDraft[id] || "";
  autoGrow(ta);
  if (replyFocused) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); replyFocused = false; }

  ta.oninput = () => { replyDraft[id] = ta.value; autoGrow(ta); };
  ta.onkeydown = e => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendReply(id, ta); }
  };
  box.querySelector(".send-reply").onclick = () => sendReply(id, ta);
  box.querySelectorAll(".del-reply").forEach(btn => {
    btn.onclick = () => delReply(id, btn.closest(".reply").dataset.rid);
  });
}

function autoGrow(ta) {
  ta.style.height = "auto";
  ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
}

async function sendReply(id, ta) {
  const text = ta.value.trim();
  if (!text) return;
  ta.value = "";
  replyDraft[id] = "";
  replyFocused = true;
  try {
    await push(ref(db, "replies/" + id), { user: username, text, createdAt: Date.now() });
    await update(ref(db, "notices/" + id), { replyCount: Object.keys(replyData).length + 1 });
    recordLog("CREATE_REPLY", { noticeId: id });
  } catch (e) {
    console.error("답글 저장 오류:", e);
    alert("답글을 저장하지 못했습니다: " + e.message);
    replyDraft[id] = text;
  }
}

async function delReply(id, rid) {
  if (!confirm("이 답글을 삭제할까요?")) return;
  try {
    await remove(ref(db, "replies/" + id + "/" + rid));
    recordLog("DELETE_REPLY", { noticeId: id, replyId: rid });
  } catch (e) {
    alert("삭제하지 못했습니다: " + e.message);
  }
}

/* ── 공지 작성 · 수정 · 보관 ───────────────────── */
let editingNotice = null;

function openNoticeDlg(id) {
  if (!canManage) return;
  editingNotice = id || null;
  const n = id ? notices[id] : null;
  $("noticeDlgTitle").textContent = id ? "공지 수정" : "공지 작성";
  $("nTitle").value = n ? (n.title || "") : "";
  $("nBody").value = n ? (n.body || "") : "";
  $("nImportant").checked = !!(n && n.level === "important");
  $("nPinned").checked = !!(n && n.pinned);
  $("nFrom").value = (n && n.dateFrom) || "";
  $("nTo").value = (n && n.dateTo) || "";
  $("noticeDlg").showModal();
}

$("noticeForm").addEventListener("submit", async e => {
  if (!e.submitter || e.submitter.value !== "ok") return;   // 취소
  const title = $("nTitle").value.trim();
  if (!title) return;

  let from = $("nFrom").value || null;
  let to = $("nTo").value || null;
  if (!from && to) { from = to; to = null; }          // 종료일만 넣은 경우
  if (from && to && to < from) to = from;             // 거꾸로 넣은 경우

  const data = {
    title,
    body: $("nBody").value.trim(),
    level: $("nImportant").checked ? "important" : "normal",
    pinned: $("nPinned").checked,
    dateFrom: from,
    dateTo: to,
    updatedAt: Date.now(),
    updatedBy: username
  };

  try {
    if (editingNotice) {
      await update(ref(db, "notices/" + editingNotice), data);
      recordLog("UPDATE_NOTICE", { noticeId: editingNotice, title });
    } else {
      data.author = username;
      data.createdAt = Date.now();
      data.replyCount = 0;
      data.readers = { [username]: Date.now() };   // 쓴 사람은 읽은 것으로
      const r = await push(ref(db, "notices"), data);
      recordLog("CREATE_NOTICE", { noticeId: r.key, title });
    }
  } catch (err) {
    console.error("공지 저장 오류:", err);
    alert("공지를 저장하지 못했습니다: " + err.message +
      "\n\n(Firebase 콘솔 규칙에 notices 경로가 없으면 저장이 거부됩니다.)");
  }
});

async function archiveNotice(id, on) {
  if (!canManage) return;
  const n = notices[id] || {};
  if (on && !confirm(`'${n.title || ""}' 공지를 보관함으로 옮길까요?\n(지워지지 않고 보관함에서 다시 꺼낼 수 있습니다)`)) return;
  try {
    await update(ref(db, "notices/" + id), {
      archived: on ? true : null,
      archivedBy: on ? username : null,
      archivedAt: on ? Date.now() : null
    });
    recordLog(on ? "ARCHIVE_NOTICE" : "RESTORE_NOTICE", { noticeId: id, title: n.title });
  } catch (e) {
    alert("처리하지 못했습니다: " + e.message);
  }
}

/* ── 달력 ──────────────────────────────────────── */
function itemsOn(key) {
  const out = [];
  if ($("layerNotice").checked) {
    for (const id in notices) {
      const n = notices[id];
      if (!n || n.archived || !n.dateFrom) continue;
      const to = n.dateTo || n.dateFrom;
      if (key >= n.dateFrom && key <= to) {
        out.push({ kind: "notice", id, title: n.title || "(제목 없음)", color: "accent",
                   start: key === n.dateFrom, from: n.dateFrom, to });
      }
    }
  }
  if ($("layerEvent").checked) {
    for (const id in events) {
      const ev = events[id];
      if (!ev || !ev.date) continue;
      const to = ev.endDate || ev.date;
      if (key >= ev.date && key <= to) {
        out.push({ kind: "event", id, title: ev.title || "(제목 없음)", color: ev.color || "blue",
                   start: key === ev.date, from: ev.date, to, author: ev.author || "" });
      }
    }
  }
  return out;
}

function renderCalendar() {
  const y = view.getFullYear(), m = view.getMonth();
  $("calTitle").textContent = y + "년 " + (m + 1) + "월";

  const first = new Date(y, m, 1);
  const lastDay = new Date(y, m + 1, 0).getDate();
  const rows = Math.ceil((first.getDay() + lastDay) / 7);
  const today = todayYmd();

  let h = ["일", "월", "화", "수", "목", "금", "토"]
    .map(d => `<div class="cal-dow">${d}</div>`).join("");

  for (let i = 0; i < rows * 7; i++) {
    const d = new Date(y, m, 1 - first.getDay() + i);
    const key = ymd(d);
    const cls = ["cal-cell"];
    if (d.getMonth() !== m) cls.push("other");
    if (key === today) cls.push("today");
    if (key === selected) cls.push("sel");
    if (d.getDay() === 0) cls.push("sun");
    if (d.getDay() === 6) cls.push("sat");

    const items = itemsOn(key);
    const shown = items.slice(0, 3).map(it =>
      `<span class="cal-chip${it.start ? "" : " cont"}" data-kind="${it.kind}" data-id="${esc(it.id)}"
             style="--chip-color:${COLOR[it.color] || COLOR.blue}" title="${esc(it.title)}">${esc(it.title)}</span>`
    ).join("");
    const more = items.length > 3 ? `<span class="cal-more">+${items.length - 3}</span>` : "";

    h += `<div class="${cls.join(" ")}" data-day="${key}">
            <div class="cal-day">${d.getDate()}</div>${shown}${more}
          </div>`;
  }

  $("calGrid").innerHTML = h;

  $("calGrid").querySelectorAll(".cal-cell").forEach(cell => {
    cell.onclick = () => { selected = cell.dataset.day; renderCalendar(); };
  });
  $("calGrid").querySelectorAll(".cal-chip").forEach(chip => {
    chip.onclick = e => {
      e.stopPropagation();
      selected = chip.closest(".cal-cell").dataset.day;
      if (chip.dataset.kind === "notice") gotoNotice(chip.dataset.id);
      else if (canEditEvent(chip.dataset.id)) openEventDlg(chip.dataset.id);
      else renderCalendar();
    };
  });

  renderDayPanel();
}

function renderDayPanel() {
  const items = itemsOn(selected);
  const d = parseYmd(selected);
  let h = `<h3>${d.getMonth() + 1}월 ${d.getDate()}일 (${["일","월","화","수","목","금","토"][d.getDay()]})</h3>`;

  if (!items.length) {
    h += `<div class="reply-who">이 날에는 일정이 없습니다.</div>`;
  } else {
    h += items.map(it => {
      // 누를 수 있을 때만 단추를 답니다 (공지는 누구나 열람, 일정 수정은 담당자만)
      const btn = it.kind === "notice"
        ? `<button class="chip go-btn" data-kind="notice" data-id="${esc(it.id)}">공지 보기</button>`
        : (canEditEvent(it.id)
            ? `<button class="chip go-btn" data-kind="event" data-id="${esc(it.id)}">수정</button>`
            : "");
      const span = (it.to && it.to !== it.from)
        ? `<span class="kind">${esc(rangeLabel(it.from, it.to))}</span>` : "";
      const who = it.author ? `<span class="kind">${esc(it.author)}</span>` : "";
      return `
      <div class="day-item" style="--chip-color:${COLOR[it.color] || COLOR.blue}">
        <span class="kind">${it.kind === "notice" ? "공지" : "일정"}</span>
        <span class="t">${esc(it.title)}</span>
        ${span}${who}${btn}
      </div>`;
    }).join("");
  }
  $("dayPanel").innerHTML = h;

  $("dayPanel").querySelectorAll(".go-btn").forEach(btn => {
    btn.onclick = () => {
      if (btn.dataset.kind === "notice") gotoNotice(btn.dataset.id);
      else if (canEditEvent(btn.dataset.id)) openEventDlg(btn.dataset.id);
    };
  });
}

function gotoNotice(id) {
  if (notices[id] && notices[id].archived) showArchived = true;
  setTab("notice");
  if (openId !== id) toggleNotice(id); else renderNotices();
  const card = $("noticeList").querySelector(`.notice[data-id="${CSS.escape(id)}"]`);
  if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
}

/* ── 일정 작성 · 수정 ──────────────────────────── */
/* 등록은 전원, 고치고 지우는 것은 올린 사람과 담당자만 */
let editingEvent = null;

function canEditEvent(id) {
  const ev = events[id];
  return !!ev && (canManage || ev.author === username);
}

function openEventDlg(id) {
  if (id && !canEditEvent(id)) return;
  editingEvent = id || null;
  const ev = id ? events[id] : null;
  $("eventDlgTitle").textContent = id ? "일정 수정" : "일정 추가";
  $("eTitle").value = ev ? (ev.title || "") : "";
  $("eFrom").value = ev ? (ev.date || "") : selected;
  $("eTo").value = ev ? (ev.endDate || "") : "";
  $("eColor").value = (ev && ev.color) || "blue";
  $("eventDelete").hidden = !id;
  $("eventDlg").showModal();
}

$("eventForm").addEventListener("submit", async e => {
  if (!e.submitter || e.submitter.value !== "ok") return;
  const title = $("eTitle").value.trim();
  const date = $("eFrom").value;
  if (!title || !date) return;
  let endDate = $("eTo").value || null;
  if (endDate && endDate < date) endDate = date;

  if (editingEvent && !canEditEvent(editingEvent)) return;

  const data = { title, date, endDate, color: $("eColor").value, updatedAt: Date.now(), updatedBy: username };
  try {
    if (editingEvent) {
      await update(ref(db, "events/" + editingEvent), data);
      recordLog("UPDATE_EVENT", { eventId: editingEvent, title });
    } else {
      data.author = username;
      data.createdAt = Date.now();
      const r = await push(ref(db, "events"), data);
      recordLog("CREATE_EVENT", { eventId: r.key, title });
    }
    selected = date;                       // 저장한 날짜로 달력을 옮겨 보여 줍니다
    view = new Date(parseYmd(date).getFullYear(), parseYmd(date).getMonth(), 1);
    renderCalendar();
  } catch (err) {
    console.error("일정 저장 오류:", err);
    alert("일정을 저장하지 못했습니다: " + err.message +
      "\n\n(Firebase 콘솔 규칙에 events 경로가 없으면 저장이 거부됩니다.)");
  }
});

$("eventDelete").onclick = async () => {
  if (!editingEvent || !canEditEvent(editingEvent)) return;
  const ev = events[editingEvent] || {};
  if (!confirm(`'${ev.title || ""}' 일정을 삭제할까요?`)) return;
  try {
    await remove(ref(db, "events/" + editingEvent));
    recordLog("DELETE_EVENT", { eventId: editingEvent, title: ev.title });
    $("eventDlg").close();
  } catch (e) {
    alert("삭제하지 못했습니다: " + e.message);
  }
};

/* ── 연결 ──────────────────────────────────────── */
if (username) {
  document.querySelectorAll(".tab").forEach(b => { b.onclick = () => setTab(b.dataset.tab); });

  $("addNoticeBtn").onclick = () => openNoticeDlg(null);
  $("addEventBtn").onclick = () => openEventDlg(null);
  $("archiveToggle").onclick = () => { showArchived = !showArchived; closeOpen(); renderNotices(); };

  $("calPrev").onclick = () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); renderCalendar(); };
  $("calNext").onclick = () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); renderCalendar(); };
  $("calToday").onclick = () => { view = new Date(); selected = todayYmd(); renderCalendar(); };
  $("layerNotice").onchange = renderCalendar;
  $("layerEvent").onchange = renderCalendar;

  // 공지 부관리자 확인 (users/{id}.noticeAdmin — 사역표·자재소모와 같은 방식)
  get(ref(db, "users/" + username)).then(s => {
    if (s.exists() && s.val() && s.val().noticeAdmin === true) canManage = true;
    setTab(tab);
    renderNotices();
  }).catch(() => {});

  onValue(ref(db, "notices"), snap => {
    notices = snap.val() || {};
    updateBadge();
    renderNotices();
    renderCalendar();
  }, e => console.error("공지 읽기 오류:", e));

  onValue(ref(db, "events"), snap => {
    events = snap.val() || {};
    renderCalendar();
  }, e => console.error("일정 읽기 오류:", e));

  setTab(tab);
  renderCalendar();
}
