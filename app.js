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
appId: "1:300454183349:web:7a5e681d9c6c1f7b5999fc"

};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const notesRef = ref(db,"notes");

const board = document.getElementById("board");
const usernameDiv = document.getElementById("username");


let username = localStorage.getItem("username");

if(!username){

username = prompt("이름을 입력하세요");
localStorage.setItem("username",username);

}

usernameDiv.innerText = "👤 "+username;



window.addNote = ()=>{

push(notesRef,{
user:username,
text:"아이디어",
vote:0,
voters:{}
});

};



window.deleteAll = ()=>{

const pw = prompt("관리자 비밀번호");

if(pw==="1234"){

if(confirm("모든 스티커 삭제?")){

remove(notesRef);

}

}

};



onValue(notesRef,(snap)=>{

board.innerHTML="";

const data=snap.val();

if(!data) return;

for(const key in data){

const n=data[key];

const note=document.createElement("div");
note.className="note";

note.innerHTML=`

<b>${n.user}</b>

<textarea>${n.text}</textarea>

<div class="vote">👍 ${n.vote}</div>

<button class="delete">삭제</button>

`;

board.appendChild(note);



const textarea=note.querySelector("textarea");

autoResize(textarea);

textarea.oninput=()=>{

autoResize(textarea);

update(ref(db,"notes/"+key),{
text:textarea.value
});

};



note.querySelector(".vote").onclick=()=>{

if(n.voters && n.voters[username]){

alert("이미 투표했습니다");
return;

}

let voters=n.voters || {};

voters[username]=true;

update(ref(db,"notes/"+key),{

vote:n.vote+1,
voters:voters

});

};



note.querySelector(".delete").onclick=()=>{

const pw=prompt("관리자 비밀번호");

if(pw==="1234"){

remove(ref(db,"notes/"+key));

}

};

}

});



function autoResize(el){

el.style.height="auto";
el.style.height=el.scrollHeight+"px";

}