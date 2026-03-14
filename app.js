import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  onValue,
  update,
  remove
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

const board = document.getElementById("board");
const usernameDiv = document.getElementById("username");

let username = localStorage.getItem("username");
if (!username) {
  username = prompt("이름 입력");
  if (!username || username.trim() === "") username = "익명_" + Math.floor(Math.random() * 1000);
  localStorage.setItem("username", username);
}
usernameDiv.innerText = "👤 " + username;

/* 이름별 고유 색상 생성 (HSL 사용으로 부드러운 색상 유지) */
function colorFromName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  // 채도 70%, 명도 80%로 파스텔톤 유지하며 색상값만 변경
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 80%)`;
}

/* 스티커 추가 */
window.addNote = () => {
  push(notesRef, {
    user: username,
    text: "",
    vote: 0,
    voters: {},
    pin: false,
    createdAt: Date.now()
  });
};

/* 전체 삭제 */
window.deleteAll = () => {
  const pw = prompt("관리자 비밀번호");
  if (pw === "1111") {
    if (confirm("전체 삭제하시겠습니까?")) {
      remove(notesRef);
    }
  }
};

/* 데이터 로딩 및 표시 */
onValue(notesRef, (snap) => {
  board.innerHTML = "";
  const data = snap.val();
  if (!data) return;

  let notes = [];
  for (const key in data) {
    notes.push({
      id: key,
      ...data[key]
    });
  }

  /* 정렬 로직: 
     1. 본인 작성 스티커 최상단
     2. 고정(pin)된 스티커 다음
     3. 투표순 정렬
  */
  notes.sort((a, b) => {
    // 1. 본인 작성 여부 확인
    const isMineA = a.user === username;
    const isMineB = b.user === username;
    if (isMineA && !isMineB) return -1;
    if (!isMineA && isMineB) return 1;

    // 2. 고정 여부 확인
    if (a.pin && !b.pin) return -1;
    if (!a.pin && b.pin) return 1;

    // 3. 투표수 확인
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
        <div class="vote-badge">👍 ${n.vote || 0}</div>
      </div>
    `;
    board.appendChild(note);

    const textarea = note.querySelector("textarea");
    autoResize(textarea);

    // 내용 수정 시 자동 저장 (포커스 아웃 시)
    textarea.onblur = () => {
      if (n.text !== textarea.value) {
        update(ref(db, "notes/" + n.id), {
          text: textarea.value
        });
      }
    };

    // 투표 기능
    note.querySelector(".vote-badge").onclick = () => {
      if (n.voters && n.voters[username]) {
        alert("이미 투표했습니다!");
        return;
      }
      let voters = n.voters || {};
      voters[username] = true;
      update(ref(db, "notes/" + n.id), {
        vote: (n.vote || 0) + 1,
        voters: voters
      });
    };

    // 고정 기능
    note.querySelector(".pin-btn").onclick = () => {
      update(ref(db, "notes/" + n.id), {
        pin: !n.pin
      });
    };

    // 삭제 기능
    note.querySelector(".delete-btn").onclick = () => {
      if (confirm("이 스티커를 삭제할까요?")) {
        remove(ref(db, "notes/" + n.id));
      }
    };
  });
});

function autoResize(el) {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

// 버튼 이벤트 리스너 등록
document.addEventListener("DOMContentLoaded", () => {
  const addNoteBtn = document.getElementById("addNoteBtn");
  const deleteAllBtn = document.getElementById("deleteAllBtn");
  
  if (addNoteBtn) addNoteBtn.onclick = window.addNote;
  if (deleteAllBtn) deleteAllBtn.onclick = window.deleteAll;
});
