// 사용자 이름
let user = localStorage.getItem("user")

document.getElementById("user").innerText = user

// Firebase 설정
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT",
}

// Firebase v8 CDN 사용
firebase.initializeApp(firebaseConfig)

const db = firebase.database()

// 스티커 추가
function addNote(){

let text = prompt("의견을 입력하세요")

if(!text) return

db.ref("notes").push({
  user:user,
  text:text,
  likes:0
})

}

// 실시간 표시
db.ref("notes").on("value", function(snapshot){

let board = document.getElementById("board")

board.innerHTML=""

snapshot.forEach(function(data){

let n=data.val()
let key=data.key

let div=document.createElement("div")

div.className="note"

div.innerHTML=
"<b>"+n.user+"</b><br>"+
n.text+
"<br><button onclick='likeNote(\""+key+"\")'>👍 "+n.likes+"</button>"

board.appendChild(div)

})

})

// 좋아요
function likeNote(key){

let ref=db.ref("notes/"+key)

ref.once("value",function(snap){

let likes=snap.val().likes+1

ref.update({likes:likes})

})

}