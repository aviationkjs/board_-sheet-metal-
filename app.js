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
const eventsRef=ref(db,"events");

const board=document.getElementById("board");
const calendar=document.getElementById("calendar");
const userSelect=document.getElementById("user");

for(let i=1;i<=30;i++){
const opt=document.createElement("option");
opt.value="user"+i;
opt.text="user"+i;
userSelect.appendChild(opt);
}

window.addNote=()=>{

push(notesRef,{
user:userSelect.value,
text:"아이디어",
x:Math.random()*300,
y:Math.random()*200,
vote:0
});

};

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
${n.user}<br>
<textarea>${n.text}</textarea>
<div class="vote">👍 ${n.vote}</div>
<button>삭제</button>
`;

board.appendChild(note);

const textarea=note.querySelector("textarea");

textarea.onchange=()=>{
update(ref(db,"notes/"+key),{text:textarea.value});
};

note.querySelector(".vote").onclick=()=>{

update(ref(db,"notes/"+key),{
vote:n.vote+1
});

};

note.querySelector("button").onclick=()=>{

const pw=prompt("관리자 비밀번호");

if(pw==="1234"){
remove(ref(db,"notes/"+key));
}

};

drag(note,key);

}

});

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

function buildCalendar(){

calendar.innerHTML="";

for(let d=1;d<=31;d++){

const day=document.createElement("div");
day.className="day";
day.dataset.day=d;
day.innerHTML="<b>"+d+"</b>";

day.onclick=()=>{

const text=prompt("일정");

if(text){

push(eventsRef,{
day:d,
user:userSelect.value,
text:text
});

}

};

calendar.appendChild(day);

}

}

buildCalendar();

onValue(eventsRef,(snap)=>{

buildCalendar();

const data=snap.val();

for(const key in data){

const e=data[key];

const day=document.querySelector(`[data-day='${e.day}']`);

const div=document.createElement("div");

div.className="event";
div.innerText=e.user+" : "+e.text;

div.onclick=()=>{

const newText=prompt("수정",e.text);

if(newText){
update(ref(db,"events/"+key),{text:newText});
}

};

div.oncontextmenu=(ev)=>{

ev.preventDefault();

if(confirm("삭제?")){
remove(ref(db,"events/"+key));
}

};

day.appendChild(div);

}

});

window.addEvent=()=>{
alert("날짜를 클릭하세요");
};