import { initializeApp } from 
"https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

import {
getDatabase,
ref,
push,
onValue,
update,
remove
} from
"https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
 apiKey: "AIzaSyBsOQMj6GTx1GVJVqjurZGlk0c1v1MjNOk",
  authDomain: "board-sheet-metal.firebaseapp.com",
  databaseURL: "https://board-sheet-metal-default-rtdb.firebaseio.com",
  projectId: "board-sheet-metal",
  storageBucket: "board-sheet-metal.firebasestorage.app",
  messagingSenderId: "300454183349",
  appId: "1:300454183349:web:7a5e681d9c6c1f7b5999fc",
  measurementId: "G-BK5QB5S01P"
};

const app=initializeApp(firebaseConfig);
const db=getDatabase(app);

const notesRef=ref(db,"notes");

const board=document.getElementById("board");
const usernameDiv=document.getElementById("username");


// 사용자 이름 저장/불러오기

let username=localStorage.getItem("username");

if(!username){

username=prompt("이름을 입력하세요");

localStorage.setItem("username",username);

}

usernameDiv.innerText="👤 "+username;


// 스티커 추가

window.addNote=()=>{

push(notesRef,{
user:username,
text:"아이디어",
x:Math.random()*300,
y:Math.random()*300,
vote:0
});

};


// 실시간 로딩

onValue(notesRef,(snap)=>{

board.innerHTML="";

const data=snap.val();

for(const key in data){

const n=data[key];

const note=document.createElement("div");
note.className="note";

note.style.left=n.x+"px";
note.style.top=n.y+"px";

note.innerHTML=`

<b>${n.user}</b>

<textarea>${n.text}</textarea>

<div class="vote">👍 ${n.vote}</div>

<button class="delete">삭제</button>

`;

board.appendChild(note);


// 텍스트 수정

const textarea=note.querySelector("textarea");

textarea.onchange=()=>{

update(ref(db,"notes/"+key),{
text:textarea.value
});

};


// 투표

note.querySelector(".vote").onclick=()=>{

update(ref(db,"notes/"+key),{
vote:n.vote+1
});

};


// 삭제 (관리자 비밀번호)

note.querySelector(".delete").onclick=()=>{

const pw=prompt("관리자 비밀번호");

if(pw==="1234"){
remove(ref(db,"notes/"+key));
}

};


// 드래그 이동

drag(note,key);

}

});


// 드래그 기능

function drag(el,key){

let offsetX,offsetY;

el.onmousedown=(e)=>{

offsetX=e.offsetX;
offsetY=e.offsetY;

document.onmousemove=(e)=>{

el.style.left=(e.pageX-offsetX)+"px";
el.style.top=(e.pageY-offsetY)+"px";

};

document.onmouseup=()=>{

update(ref(db,"notes/"+key),{
x:parseInt(el.style.left),
y:parseInt(el.style.top)
});

document.onmousemove=null;

};

};

}