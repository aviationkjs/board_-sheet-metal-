// ============================================================
// 전투기 런 (Fighter Jet Run)
// 디노런 스타일 무한러너 - 전투기 상승/하강 조작 버전
// 보드(스티커보드)와 동일한 Firebase Realtime Database / 로그인 방식 사용
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase,
  ref,
  get,
  set
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

// 보드와 동일하게 localStorage 로그인 정보를 사용
const username = localStorage.getItem("username");
if (!username) {
  window.location.href = "auth.html";
}
document.getElementById("hud-user").textContent = "👤 " + username;

// RTDB 키로 쓸 수 없는 문자 치환 (. # $ [ ] /)
const userKey = String(username).replace(/[.#$/[\]]/g, "_");
const scoresRef = ref(db, "fighterjet_scores");

let myBest = 0;

/* 사용자별 최고 점수만 저장 */
async function saveScore(name, score) {
  try {
    if (score <= myBest) return false;
    await set(ref(db, `fighterjet_scores/${userKey}`), {
      name,
      score,
      updatedAt: Date.now()
    });
    myBest = score;
    return true;
  } catch (e) {
    console.error("점수 저장 실패:", e);
    return false;
  }
}

async function fetchTop3() {
  try {
    const snap = await get(scoresRef);
    const data = snap.val() || {};
    return Object.values(data)
      .filter((e) => e && typeof e.score === "number")
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  } catch (e) {
    console.error("순위 조회 실패:", e);
    return [];
  }
}

async function loadMyBest() {
  try {
    const snap = await get(ref(db, `fighterjet_scores/${userKey}`));
    myBest = snap.val()?.score || 0;
  } catch (e) {
    console.error("최고 점수 조회 실패:", e);
    myBest = 0;
  }
  updateBestHud();
}

function updateBestHud() {
  document.getElementById("hud-best").textContent = `BEST: ${myBest}`;
}

function renderLeaderboard(listEl, entries) {
  listEl.innerHTML = "";
  if (entries.length === 0) {
    listEl.innerHTML = "<li>기록이 없습니다</li>";
    return;
  }
  entries.forEach((e, i) => {
    const li = document.createElement("li");
    if (e.name === username) li.classList.add("me");
    li.innerHTML = `<span>${i + 1}위 ${e.name}</span><span>${e.score}</span>`;
    listEl.appendChild(li);
  });
}

async function refreshLeaderboards() {
  const top3 = await fetchTop3();
  renderLeaderboard(document.getElementById("leaderboard-start-list"), top3);
  renderLeaderboard(document.getElementById("leaderboard-over-list"), top3);
  return top3;
}

// --- 화면 전환 ------------------------------------------------
const screens = {
  start: document.getElementById("screen-start"),
  play: document.getElementById("screen-play"),
  over: document.getElementById("screen-over"),
};
function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove("active"));
  screens[name].classList.add("active");
}

// --- 게임 로직 ------------------------------------------------
const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;

const GROUND_MARGIN = 0; // 상/하단 경계는 캔버스 끝까지 사용
const JET = {
  x: 80,
  y: H / 2,
  w: 56,
  h: 20,            // jet.png 비율(약 2.8:1)에 맞춘 크기
  vy: 0,
  lift: -0.55,      // 키를 누르고 있을 때 위로 받는 가속도
  gravity: 0.35,    // 기본 중력
  maxVy: 8,
};

// 전투기 이미지 (기수가 오른쪽을 향하도록 좌우 반전해 둔 스프라이트)
const jetImg = new Image();
let jetImgReady = false;
jetImg.onload = () => { jetImgReady = true; };
jetImg.src = "jet.png";

// 충돌 판정은 스프라이트보다 살짝 작게 (날개 여백 보정)
function jetHitbox() {
  return { x: JET.x + 5, y: JET.y + 3, w: JET.w - 10, h: JET.h - 6 };
}

const INITIAL_SPEED = 4;

let obstacles = [];
let clouds = [];
let scrollSpeed = INITIAL_SPEED;
let baseScrollSpeed = INITIAL_SPEED;
let score = 0;
let distance = 0;
let isHolding = false;
let gameOver = false;
let running = false;
let penaltyTimer = 0; // 경계 충돌 감속 패널티 지속 프레임
let rafId = null;
let spawnTimer = 0;
let spawnInterval = 90; // 프레임 단위, 랜덤하게 변동

function resetGame() {
  JET.y = H / 2;
  JET.vy = 0;
  obstacles = [];
  clouds = [];
  for (let i = 0; i < 6; i++) {
    clouds.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 20 + Math.random() * 40,
      speed: 0.2 + Math.random() * 0.5,
    });
  }
  baseScrollSpeed = INITIAL_SPEED;
  scrollSpeed = INITIAL_SPEED;
  score = 0;
  distance = 0;
  isHolding = false;
  gameOver = false;
  penaltyTimer = 0;
  spawnTimer = 0;
  spawnInterval = 90;
  document.getElementById("hud-score").textContent = "SCORE: 0";
}

function spawnObstacle() {
  // 완전 랜덤 위치 + 랜덤 크기 + 랜덤 타입
  const types = ["shell", "bird"];
  const type = types[Math.floor(Math.random() * types.length)];
  const size = 20 + Math.random() * 20;
  const y = Math.random() * (H - size);
  obstacles.push({
    x: W + size,
    y,
    w: size,
    h: size,
    type,
    // 새 타입은 약간의 수직 이동을 랜덤으로 가짐
    vy: type === "bird" ? (Math.random() - 0.5) * 2 : 0,
  });
}

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function update() {
  if (gameOver) return;

  // 조작: 누르고 있으면 상승, 아니면 중력으로 하강
  if (isHolding) {
    JET.vy += JET.lift;
  } else {
    JET.vy += JET.gravity;
  }
  JET.vy = Math.max(-JET.maxVy, Math.min(JET.maxVy, JET.vy));
  JET.y += JET.vy;

  // 경계 충돌 -> 감속 패널티 (게임오버 아님)
  let hitBoundary = false;
  if (JET.y < GROUND_MARGIN) {
    JET.y = GROUND_MARGIN;
    JET.vy = 0;
    hitBoundary = true;
  } else if (JET.y + JET.h > H - GROUND_MARGIN) {
    JET.y = H - GROUND_MARGIN - JET.h;
    JET.vy = 0;
    hitBoundary = true;
  }
  if (hitBoundary) {
    penaltyTimer = 45; // 약 0.75초(60fps 기준) 동안 감속 패널티
  }
  scrollSpeed = penaltyTimer > 0 ? baseScrollSpeed * 0.4 : baseScrollSpeed;
  if (penaltyTimer > 0) penaltyTimer--;

  // 배경 구름 스크롤
  clouds.forEach((c) => {
    c.x -= c.speed * (scrollSpeed / INITIAL_SPEED);
    if (c.x + c.r < 0) {
      c.x = W + c.r;
      c.y = Math.random() * H;
    }
  });

  // 장애물 스폰 (랜덤 간격)
  spawnTimer++;
  if (spawnTimer >= spawnInterval) {
    spawnObstacle();
    spawnTimer = 0;
    spawnInterval = 60 + Math.random() * 60; // 다음 스폰까지 랜덤 간격
  }

  // 장애물 이동 및 충돌 판정
  const jetBox = jetHitbox();
  let crashed = false;
  obstacles.forEach((o) => {
    o.x -= scrollSpeed;
    o.y += o.vy || 0;
    // 새는 화면 위아래에서 반사
    if (o.vy) {
      if (o.y < 0 || o.y + o.h > H) o.vy *= -1;
    }
    if (rectsOverlap(jetBox, o)) crashed = true;
  });
  obstacles = obstacles.filter((o) => o.x + o.w > 0);

  // 점수 및 난이도 상승
  distance += scrollSpeed;
  score = Math.floor(distance / 5);
  baseScrollSpeed = INITIAL_SPEED + Math.floor(distance / 1500) * 0.5;

  document.getElementById("hud-score").textContent = `SCORE: ${score}`;

  if (crashed) endGame();
}

function draw() {
  ctx.clearRect(0, 0, W, H);

  // 배경 구름
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  clouds.forEach((c) => {
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fill();
  });

  // 상승 중 엔진 화염 (기체 뒤쪽)
  if (isHolding) {
    ctx.fillStyle = "#ff9f43";
    ctx.beginPath();
    ctx.moveTo(JET.x + 2, JET.y + JET.h * 0.32);
    ctx.lineTo(JET.x - 14 - Math.random() * 8, JET.y + JET.h * 0.5);
    ctx.lineTo(JET.x + 2, JET.y + JET.h * 0.62);
    ctx.closePath();
    ctx.fill();
  }

  // 전투기 (이미지 로딩 전에는 삼각형으로 대체 표시)
  if (jetImgReady) {
    ctx.drawImage(jetImg, JET.x, JET.y, JET.w, JET.h);
  } else {
    ctx.fillStyle = "#6fb3ff";
    ctx.beginPath();
    ctx.moveTo(JET.x + JET.w, JET.y + JET.h / 2);
    ctx.lineTo(JET.x, JET.y);
    ctx.lineTo(JET.x, JET.y + JET.h);
    ctx.closePath();
    ctx.fill();
  }

  // 장애물
  obstacles.forEach((o) => {
    ctx.fillStyle = o.type === "bird" ? "#ff8a65" : "#ffd54f";
    ctx.beginPath();
    ctx.arc(o.x + o.w / 2, o.y + o.h / 2, o.w / 2, 0, Math.PI * 2);
    ctx.fill();
  });

  // 경계 패널티 시각 피드백
  if (penaltyTimer > 0) {
    ctx.fillStyle = "rgba(255,0,0,0.08)";
    ctx.fillRect(0, 0, W, H);
  }
}

function loop() {
  update();
  draw();
  if (!gameOver) {
    rafId = requestAnimationFrame(loop);
  }
}

async function endGame() {
  if (gameOver) return;
  gameOver = true;
  running = false;
  isHolding = false;
  cancelAnimationFrame(rafId);

  const finalScore = score;
  document.getElementById("final-score").textContent = `최종 점수: ${finalScore}`;
  showScreen("over");

  const isNewBest = await saveScore(username, finalScore);
  updateBestHud();
  const top3 = await refreshLeaderboards();

  const madeTop3 = top3.some((e) => e.name === username && e.score === finalScore);
  const recordEl = document.getElementById("new-record");
  recordEl.textContent = madeTop3 ? "🎉 TOP 3 진입!" : "🎉 개인 최고 기록 갱신!";
  recordEl.classList.toggle("hidden", !(madeTop3 || isNewBest));
}

function startGame() {
  resetGame();
  running = true;
  showScreen("play");
  loop();
}

// --- 입력 처리 ------------------------------------------------
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    if (running) isHolding = true;
    e.preventDefault();
  }
});
window.addEventListener("keyup", (e) => {
  if (e.code === "Space") { isHolding = false; }
});
canvas.addEventListener("mousedown", () => { isHolding = true; });
window.addEventListener("mouseup", () => { isHolding = false; });
canvas.addEventListener("touchstart", (e) => { isHolding = true; e.preventDefault(); }, { passive: false });
canvas.addEventListener("touchend", (e) => { isHolding = false; e.preventDefault(); }, { passive: false });
canvas.addEventListener("touchcancel", () => { isHolding = false; });

document.getElementById("btn-start").addEventListener("click", startGame);
document.getElementById("btn-restart").addEventListener("click", startGame);

// 초기 로딩 시 순위 / 개인 최고 점수 표시
loadMyBest();
refreshLeaderboards();
showScreen("start");
