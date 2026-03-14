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

const board = document.getElementById("board");
const usernameDiv = document.getElementById("username");

let username = localStorage.getItem("username");
if (!username) {
  username = prompt("이름 입력");
  if (!username || username.trim() === "") username = "익명_" + Math.floor(Math.random() * 1000);
  localStorage.setItem("username", username);
}
usernameDiv.innerText = "👤 " + username;

/* 이름별 고유 색상 생성 */
function colorFromName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
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

/* 전체 삭제 (고정된 스티커 제외) */
window.deleteAll = async () => {
  const pw = prompt("관리자 비밀번호");
  if (pw === "1111") {
    if (confirm("정말로 모든 스티커를 삭제하시겠습니까?\n(고정된 스티커는 삭제되지 않습니다)")) {
      try {
        board.innerHTML = "<div style='grid-column: 1/-1; text-align: center; padding: 50px;'>삭제 중...</div>";
        
        // 현재 데이터 조회
        const snapshot = await get(notesRef);
        const data = snapshot.val();
        
        if (!data) {
          alert("삭제할 스티커가 없습니다.");
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
        } else {
          alert("삭제할 스티커가 없습니다. (모든 스티커가 고정되어 있습니다)");
        }
        
        // 페이지 새로고침
        setTimeout(() => {
          location.reload();
        }, 300);
      } catch (error) {
        console.error("삭제 실패:", error);
        alert("삭제 중 오류가 발생했습니다: " + error.message);
        location.reload();
      }
    }
  } else if (pw !== null) {
    alert("비밀번호가 틀렸습니다.");
  }
};

/* 데이터 로딩 및 표시 */
onValue(notesRef, (snap) => {
  const data = snap.val();
  
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
        <div class="vote-badge">👍 ${n.vote || 0}</div>
      </div>
    `;
    board.appendChild(note);

    const textarea = note.querySelector("textarea");
    autoResize(textarea);

    textarea.onblur = () => {
      if (n.text !== textarea.value) {
        update(ref(db, "notes/" + n.id), {
          text: textarea.value
        });
      }
    };

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

    note.querySelector(".pin-btn").onclick = () => {
      update(ref(db, "notes/" + n.id), {
        pin: !n.pin
      });
    };

    note.querySelector(".delete-btn").onclick = () => {
      if (n.pin) {
        alert("고정된 스티커는 삭제할 수 없습니다.\n먼저 고정을 풀어주세요.");
        return;
      }
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

document.addEventListener("DOMContentLoaded", () => {
  const addNoteBtn = document.getElementById("addNoteBtn");
  const deleteAllBtn = document.getElementById("deleteAllBtn");
  const infoBtn = document.getElementById("infoBtn");
  
  if (addNoteBtn) addNoteBtn.onclick = window.addNote;
  if (deleteAllBtn) deleteAllBtn.onclick = window.deleteAll;
  if (infoBtn) {
    infoBtn.onclick = () => {
      window.location.href = "info.html";
    };
  }
});
