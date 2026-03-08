import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, push, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "여기에키",
  authDomain: "여기에",
  databaseURL: "여기에",
  projectId: "여기에",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const board = document.getElementById("board");
const addBtn = document.getElementById("addBtn");

const notesRef = ref(db, "notes");

addBtn.onclick = () => {
  push(notesRef, {
    text: "새 스티커",
    x: Math.random()*500,
    y: Math.random()*300
  });
};

onValue(notesRef, (snapshot) => {
  board.innerHTML = "";

  snapshot.forEach((child)=>{
    const data = child.val();

    const note = document.createElement("div");
    note.className="note";
    note.style.left=data.x+"px";
    note.style.top=data.y+"px";
    note.innerText=data.text;

    board.appendChild(note);
  });

});