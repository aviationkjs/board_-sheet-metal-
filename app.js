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
  if (!username) username = "익명";
  localStorage.setItem("username", username);
}
usernameDiv.innerText = "👤 " + username;

/* 이름별 색상 */
function colorFromName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const color = Math.abs(hash) % 360;
  return `hsl(${color}, 80%, 75%)`;
}

/* 스티커 추가 */
window.addNote = () => {
  push(notesRef, {
    user: username,
    text: "하고싶은말",
    vote: 0,
    voters: {},
    pin: false
  });
};

/* 전체 삭제 */
window.deleteAll = () => {
  const pw = prompt("관리자 비밀번호");
  if (pw === "1111") {
    if (confirm("전체 삭제?")) {
      remove(notesRef);
    }
  }
};

/* 로딩 */
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

  /* 중요 → 투표순 정렬 */
  notes.sort((a, b) => {
    if (a.pin && !b.pin) return -1;
    if (!a.pin && b.pin) return 1;
    return (b.vote || 0) - (a.vote || 0);
  });

  notes.forEach(n => {
    const note = document.createElement("div");
    note.className = "note";
    note.style.background = colorFromName(n.user);
    note.innerHTML = `
      <b>${n.user}</b>
      <textarea>${n.text}</textarea>
      <div class="vote">👍 ${n.vote || 0}</div>
      <button class="pin">${n.pin ? "📌해제" : "📌고정"}</button>
      <button class="delete">삭제</button>
    `;
    board.appendChild(note);

    const textarea = note.querySelector("textarea");
    autoResize(textarea);

    /* 모바일 키보드 해결 */
    textarea.onblur = () => {
      update(ref(db, "notes/" + n.id), {
        text: textarea.value
      });
    };

    /* 투표 1인1회 */
    note.querySelector(".vote").onclick = () => {
      if (n.voters && n.voters[username]) {
        alert("이미 투표했습니다");
        return;
      }
      let voters = n.voters || {};
      voters[username] = true;
      update(ref(db, "notes/" + n.id), {
        vote: (n.vote || 0) + 1,
        voters: voters
      });
    };

    /* 중요 스티커 */
    note.querySelector(".pin").onclick = () => {
      update(ref(db, "notes/" + n.id), {
        pin: !n.pin
      });
    };

    /* 삭제 */
    note.querySelector(".delete").onclick = () => {
      remove(ref(db, "notes/" + n.id));
    };
  });
});

function autoResize(el) {
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

// DOM 로드 후 버튼 이벤트 리스너 등록
document.addEventListener("DOMContentLoaded", () => {
  const addNoteBtn = document.getElementById("addNoteBtn");
  const deleteAllBtn = document.getElementById("deleteAllBtn");
  
  if (addNoteBtn) addNoteBtn.onclick = window.addNote;
  if (deleteAllBtn) deleteAllBtn.onclick = window.deleteAll;
});
