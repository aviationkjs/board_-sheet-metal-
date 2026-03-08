import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, push, onValue, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBsOQMj6GTx1GVJVqjurZGlk0c1v1MjNOk",
  authDomain: "board-sheet-metal.firebaseapp.com",
  projectId: "board-sheet-metal",
  storageBucket: "board-sheet-metal.firebasestorage.app",
  messagingSenderId: "300454183349",
  appId: "1:300454183349:web:7a5e681d9c6c1f7b5999fc",
  measurementId: "G-BK5QB5S01P"
};

const app=initializeApp(firebaseConfig);
const db=getDatabase(app);

const users=[];
for(let i=1;i<=30;i++) users.push("사용자"+i);

const userSelect=document.getElementById("userSelect");

users.forEach(u=>{
const o=document.createElement("option");
o.value=u;
o.text=u;
userSelect.appendChild(o);
});

const notesRef=ref(db,"notes");

function showBoard(){

document.getElementById("boardView").style.display="block";
document.getElementById("calendarView").style.display="none";

}

function showCalendar(){

document.getElementById("boardView").style.display="none";
document.getElementById("calendarView").style.display="grid";

}

window.showBoard=showBoard;
window.showCalendar=showCalendar;

window.addNote=()=>{

push(notesRef,{
user:userSelect.value,
text:"아이디어",
x:50,
y:50,
vote:0
});

};

onValue(notesRef,(snap)=>{

const board=document.getElementById("boardView");
board.innerHTML="";

snap.forEach(c=>{

const d=c.val();
const key=c.key;

const note=document.createElement("div");

note.className="note";
note.style.left=d.x+"px";
note.style.top=d.y+"px";

note.innerHTML=
"<b>"+d.user+"</b><br>"+d.text+
"<div class='vote'>👍 "+d.vote+"</div>";

note.querySelector(".vote").onclick=()=>{

update(ref(db,"notes/"+key),{
vote:d.vote+1
});

};

board.appendChild(note);

});

});
