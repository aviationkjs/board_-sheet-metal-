import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  onValue,
  update,
  remove,
  set,
  get
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

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const notesRef = ref(db, "notes");
const usersRef = ref(db, "users");
const logsRef = ref(db, "logs");
const dutyRef = ref(db, "duty");

const board = document.getElementById("board");
const usernameDiv = document.getElementById("username");

let username = localStorage.getItem("username");

// 로그인 확인
if (!username) {
  window.location.href = "auth.html";
}

usernameDiv.innerText = "👤 " + username;

/* 로그아웃 함수 */
async function handleLogout() {
  try {
    // 로그아웃 로그 기록
    const newLogRef = ref(db, `logs/${Date.now()}`);
    await set(newLogRef, {
      user: username,
      action: 'LOGOUT',
      timestamp: Date.now()
    });
    
    localStorage.removeItem('username');
    window.location.href = 'auth.html';
  } catch (error) {
    console.error('로그아웃 오류:', error);
    localStorage.removeItem('username');
    window.location.href = 'auth.html';
  }
}

window.handleLogout = handleLogout;

/* 로그 기록 함수 */
async function recordLog(action, details = {}) {
  try {
    const newLogRef = ref(db, `logs/${Date.now()}`);
    await set(newLogRef, {
      user: username,
      action: action,
      details: details,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('로그 기록 오류:', error);
  }
}

/* 이름별 고유 색상 생성 */
function colorFromName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 80%)`;
}

/* 스티커 추가 (한 명당 최대 2개) */
const MAX_NOTES_PER_USER = 2;
window.addNote = async () => {
  try {
    const snap = await get(notesRef);
    const data = snap.val() || {};
    const myCount = Object.values(data).filter(n => n && n.user === username).length;
    if (myCount >= MAX_NOTES_PER_USER) {
      alert(`스티커는 한 명당 최대 ${MAX_NOTES_PER_USER}개까지만 만들 수 있습니다.`);
      return;
    }
    const newNoteRef = await push(notesRef, {
      user: username,
      text: "",
      vote: 0,
      voters: {},
      pin: false,
      createdAt: Date.now()
    });
    recordLog('CREATE_NOTE', { noteId: newNoteRef.key });
  } catch (error) {
    console.error('스티커 추가 오류:', error);
    alert('스티커 추가 중 오류가 발생했습니다: ' + error.message);
  }
};

/* 전체 삭제 (고정된 스티커 제외, 관리자만 가능) */
window.deleteAll = async () => {
  // 관리자 확인
  if (username !== 'admin') {
    alert('이 작업은 관리자만 수행할 수 있습니다.');
    return;
  }
  
  if (confirm("정말로 모든 스티커를 삭제하시겠습니까?\n(고정된 스티커는 삭제되지 않습니다)")) {
    try {
      board.innerHTML = "<div style='grid-column: 1/-1; text-align: center; padding: 50px;'>삭제 중...</div>";
      
      // 현재 데이터 조회
      const notesSnapshot = await get(notesRef);
      const data = notesSnapshot.val();
      
      if (!data) {
        alert("삭제할 스티커가 없습니다.");
        recordLog('DELETE_ALL', { success: true, deletedCount: 0 });
        location.reload();
        return;
      }
      
      // 고정되지 않은 스티커만 삭제
      const updates = {};
      let deleteCount = 0;
      
      for (const key in data) {
        if (!data[key].pin) {
          updates[key] = null;
          deleteCount++;
        }
      }
      
      // 삭제할 항목이 있으면 업데이트 수행
      if (deleteCount > 0) {
        await update(notesRef, updates);
        alert(`${deleteCount}개의 스티커가 삭제되었습니다.`);
        recordLog('DELETE_ALL', { success: true, deletedCount: deleteCount });
      } else {
        alert("삭제할 스티커가 없습니다. (모든 스티커가 고정되어 있습니다)");
        recordLog('DELETE_ALL', { success: true, deletedCount: 0 });
      }
      
      // 페이지 새로고침
      setTimeout(() => {
        location.reload();
      }, 300);
    } catch (error) {
      console.error("삭제 실패:", error);
      alert("삭제 중 오류가 발생했습니다: " + error.message);
      recordLog('DELETE_ALL', { success: false, reason: error.message });
      location.reload();
    }
  }
};

/* 데이터 로딩 및 표시 */
onValue(notesRef, (snap) => {
  const data = snap.val();

  // 본인 스티커 개수에 따라 '스티커 추가' 버튼 상태 갱신 (최대 2개)
  const addNoteBtn = document.getElementById("addNoteBtn");
  if (addNoteBtn) {
    const myCount = data ? Object.values(data).filter(n => n && n.user === username).length : 0;
    const reached = myCount >= MAX_NOTES_PER_USER;
    addNoteBtn.disabled = reached;
    addNoteBtn.style.opacity = reached ? "0.5" : "";
    addNoteBtn.title = reached ? `스티커는 한 명당 최대 ${MAX_NOTES_PER_USER}개까지입니다` : "";
  }

  if (!data) {
    board.innerHTML = "<div style='grid-column: 1/-1; text-align: center; padding: 50px; color: #888;'>스티커가 없습니다.</div>";
    return;
  }

  board.innerHTML = "";
  let notes = [];
  for (const key in data) {
    notes.push({
      id: key,
      ...data[key]
    });
  }

  /* 정렬 로직 */
  notes.sort((a, b) => {
    const isMineA = a.user === username;
    const isMineB = b.user === username;
    if (isMineA && !isMineB) return -1;
    if (!isMineA && isMineB) return 1;
    if (a.pin && !b.pin) return -1;
    if (!a.pin && b.pin) return 1;
    return (b.vote || 0) - (a.vote || 0);
  });

  notes.forEach(n => {
    const note = document.createElement("div");
    note.className = "note";
    if (n.user === username) note.classList.add("mine");
    note.style.backgroundColor = colorFromName(n.user);
    
    note.innerHTML = `
      <div class="note-header">
        <b>${n.user}</b>
        <div class="note-actions">
          <button class="action-btn pin-btn" title="${n.pin ? '고정 해제' : '고정'}">${n.pin ? '📌' : '📍'}</button>
          <button class="action-btn delete-btn" title="삭제">❌</button>
        </div>
      </div>
      <textarea placeholder="내용을 입력하세요...">${n.text || ""}</textarea>
      <div class="note-footer">
        <div class="vote-badge${n.voters && n.voters[username] ? ' voted' : ''}" title="${n.voters && n.voters[username] ? '좋아요 취소' : '좋아요'}">👍 ${n.vote || 0}</div>
      </div>
    `;
    board.appendChild(note);

    const textarea = note.querySelector("textarea");
    autoResize(textarea);

    // 작성자만 수정 가능
    if (n.user !== username) {
      textarea.disabled = true;
      textarea.style.opacity = '0.6';
      textarea.style.cursor = 'not-allowed';
      textarea.title = '작성자만 수정할 수 있습니다.';
    } else {
      textarea.onblur = () => {
        if (n.text !== textarea.value) {
          update(ref(db, "notes/" + n.id), {
            text: textarea.value
          });
          recordLog('UPDATE_NOTE', { noteId: n.id, oldText: n.text, newText: textarea.value });
        }
      };
    }

    note.querySelector(".vote-badge").onclick = () => {
      // 좋아요는 한 사람당 한 번. 이미 눌렀으면 다시 눌러 취소(토글).
      const voters = { ...(n.voters || {}) };
      if (voters[username]) {
        delete voters[username];
        update(ref(db, "notes/" + n.id), {
          vote: Math.max(0, (n.vote || 0) - 1),
          voters: voters
        });
        recordLog('VOTE_CANCEL', { noteId: n.id });
      } else {
        voters[username] = true;
        update(ref(db, "notes/" + n.id), {
          vote: (n.vote || 0) + 1,
          voters: voters
        });
        recordLog('VOTE', { noteId: n.id });
      }
    };

    note.querySelector(".pin-btn").onclick = () => {
      update(ref(db, "notes/" + n.id), {
        pin: !n.pin
      });
      recordLog('PIN_NOTE', { noteId: n.id, pinned: !n.pin });
    };

    note.querySelector(".delete-btn").onclick = () => {
      if (n.pin) {
        alert("고정된 스티커는 삭제할 수 없습니다.\n먼저 고정을 풀어주세요.");
        return;
      }
      
      // 작성자 또는 관리자만 삭제 가능
      if (n.user !== username && username !== 'admin') {
        alert("본인이 작성한 스티커만 삭제할 수 있습니다.");
        return;
      }
      
      if (confirm("이 스티커를 삭제할까요?")) {
        remove(ref(db, "notes/" + n.id));
        recordLog('DELETE_NOTE', { noteId: n.id, author: n.user, text: n.text });
      }
    };
  });
});

function autoResize(el) {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

document.addEventListener("DOMContentLoaded", () => {
  const addNoteBtn = document.getElementById("addNoteBtn");
  const deleteAllBtn = document.getElementById("deleteAllBtn");
  const infoBtn = document.getElementById("infoBtn");
  const logsBtn = document.getElementById("logsBtn");
  const huckViewBtn = document.getElementById("huckViewBtn");
  const dutyViewBtn = document.getElementById("dutyViewBtn");
  const gameBtn = document.getElementById("gameBtn");
  const logoutBtnEl = document.getElementById("logoutBtn");

  if (addNoteBtn) addNoteBtn.onclick = window.addNote;
  if (deleteAllBtn) deleteAllBtn.onclick = window.deleteAll;
  if (logoutBtnEl) logoutBtnEl.onclick = handleLogout;
  if (infoBtn) {
    infoBtn.onclick = () => {
      window.location.href = "info.html";
    };
  }
  if (huckViewBtn) {
    huckViewBtn.onclick = () => {
      window.location.href = "pdf_viewer.html";
    };
  }
  if (dutyViewBtn) {
    dutyViewBtn.onclick = () => {
      window.location.href = "duty_roster.html";
    };
  }
  if (gameBtn) {
    gameBtn.onclick = () => {
      window.location.href = "game.html";
    };
  }

  // 관리자(admin)만 로그 조회 버튼 표시
  if (logsBtn && username === 'admin') {
    logsBtn.style.display = 'block';
    logsBtn.onclick = () => {
      window.location.href = "logs.html";
    };
  }

  // 관리자(admin)만 회원 관리 버튼 표시
  const usersBtn = document.getElementById("usersBtn");
  if (usersBtn && username === 'admin') {
    usersBtn.style.display = 'block';
    usersBtn.onclick = () => {
      window.location.href = "admin.html";
    };
  }

  // 헤더 드롭다운 메뉴 토글
  const menus = [
    { btn: "stickerMenuBtn", menu: "stickerMenu" },
    { btn: "dutyMenuBtn", menu: "dutyMenu" },
    { btn: "moreMenuBtn", menu: "moreMenu" }
  ];

  menus.forEach(({ btn, menu }) => {
    const btnEl = document.getElementById(btn);
    const menuEl = document.getElementById(menu);
    if (!btnEl || !menuEl) return;
    btnEl.onclick = (e) => {
      e.stopPropagation();
      const isOpen = menuEl.classList.contains("open");
      document.querySelectorAll(".dropdown").forEach(d => d.classList.remove("open"));
      if (!isOpen) menuEl.classList.add("open");
    };
    menuEl.onclick = (e) => e.stopPropagation();
  });

  document.addEventListener("click", () => {
    document.querySelectorAll(".dropdown").forEach(d => d.classList.remove("open"));
  });

  // 현재 사역 순번 표시
  const dutyCurrentLabel = document.getElementById("dutyCurrentLabel");
  const dutyCurrentName = document.getElementById("dutyCurrentName");
  onValue(dutyRef, (snap) => {
    const data = snap.val();
    const members = (data && data.members) || [];
    const currentIndex = (data && data.currentIndex) || 0;
    const currentName = members[currentIndex]?.name || "미설정";
    if (dutyCurrentLabel) dutyCurrentLabel.textContent = `: ${currentName}`;
    if (dutyCurrentName) dutyCurrentName.textContent = currentName;
  });
});
