// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const app=initializeApp(firebaseConfig);
const db=getDatabase(app);

const users=[];
for(let i=1;i<=30;i++) users.push("성능기골팀원"+i);

const userSelect=document.getElementById("userSelect");

users.forEach(u=>{
const o=document.createElement("option");
o.value=u;
o.text=u;
userSelect.appendChild(o);
});

const notesRef=ref(db,"notes");
const eventsRef=ref(db,"events");

let notesData=[];

function getFreePosition(){

const size=130;
const gap=10;

for(let y=10;y<600;y+=size+gap){

for(let x=10;x<800;x+=size+gap){

let overlap=false;

notesData.forEach(n=>{

if(
x < n.x + size &&
x + size > n.x &&
y < n.y + size &&
y + size > n.y
){
overlap=true;
}

});

if(!overlap) return {x,y};

}

}

return {x:50,y:50};

}

window.showBoard=()=>{
document.getElementById("boardView").style.display="block";
document.getElementById("calendarView").style.display="none";
};

window.showCalendar=()=>{
document.getElementById("boardView").style.display="none";
document.getElementById("calendarView").style.display="grid";
};

window.addNote=()=>{

const pos=getFreePosition();

push(notesRef,{
user:userSelect.value,
text:"자유로운 글쓰기",
x:pos.x,
y:pos.y,
vote:0
});

};

onValue(notesRef,(snap)=>{

const board=document.getElementById("boardView");
board.innerHTML="";

notesData=[];

snap.forEach(c=>{

const d=c.val();
const key=c.key;

notesData.push(d);

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

let offsetX,offsetY;

note.onmousedown=(e)=>{

offsetX=e.offsetX;
offsetY=e.offsetY;

document.onmousemove=(e)=>{

note.style.left=(e.pageX-offsetX)+"px";
note.style.top=(e.pageY-offsetY)+"px";

};

document.onmouseup=()=>{

update(ref(db,"notes/"+key),{
x:parseInt(note.style.left),
y:parseInt(note.style.top)
});

document.onmousemove=null;

};

};

board.appendChild(note);

});

});

let current=new Date();

function drawCalendar(events){

const cal=document.getElementById("calendarView");
cal.innerHTML="";

const y=current.getFullYear();
const m=current.getMonth();

const firstDay=new Date(y,m,1).getDay();
const lastDate=new Date(y,m+1,0).getDate();

for(let i=0;i<firstDay;i++){
cal.appendChild(document.createElement("div"));
}

for(let d=1;d<=lastDate;d++){

const day=document.createElement("div");
day.className="day";

const date=`${y}-${m+1}-${d}`;

day.innerHTML="<b>"+d+"</b>";

events.forEach(ev=>{

if(ev.date===date){

const e=document.createElement("div");
e.className="event";
e.innerText=ev.text;

e.onclick=()=>{

const newText=prompt("일정 수정",ev.text);

if(newText){
update(ref(db,"events/"+ev.key),{
text:newText
});
}

};

e.oncontextmenu=(x)=>{

x.preventDefault();

if(confirm("삭제?")){
remove(ref(db,"events/"+ev.key));
}

};

day.appendChild(e);

}

});

day.onclick=()=>{

const text=prompt("일정 입력");

if(text){

push(eventsRef,{
date:date,
text:text
});

}

};

cal.appendChild(day);

}

}

onValue(eventsRef,(snap)=>{

let events=[];

snap.forEach(c=>{
events.push({...c.val(),key:c.key});
});

drawCalendar(events);

});
