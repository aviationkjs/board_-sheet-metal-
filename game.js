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

// 기준 해상도. 실제 캔버스 크기가 달라져도 이 기준으로 환산해
// 어느 화면에서든 체감 난이도와 점수 증가 속도가 같도록 맞춘다.
const BASE_W = 800;
const BASE_H = 400;
let W = BASE_W;   // 현재 캔버스 논리 너비(CSS px)
let H = BASE_H;   // 현재 캔버스 논리 높이(CSS px)
let sx = 1;       // 가로 배율
let sy = 1;       // 세로 배율
let su = 1;       // 오브젝트 크기용 균일 배율(가로·세로 배율의 기하평균)

const INITIAL_SPEED = 4;   // 기준 해상도 기준 스크롤 속도(프레임당)
const GRAVITY = 0.35;
const LIFT = -0.55;
const MAX_VY = 8;

const JET = {
  x: 80,
  y: BASE_H / 2,
  w: 56,
  h: 20,            // jet.png 비율(약 2.8:1)에 맞춘 크기
  vy: 0,
};

// 전투기 이미지 (기수가 오른쪽을 향하도록 좌우 반전해 둔 스프라이트)
const jetImg = new Image();
let jetImgReady = false;
jetImg.onload = () => { jetImgReady = true; draw(); };
jetImg.src = "jet.png";

// 충돌 판정은 스프라이트보다 살짝 작게 (날개 여백 보정)
function jetHitbox() {
  const ix = JET.w * 0.09;
  const iy = JET.h * 0.15;
  return { x: JET.x + ix, y: JET.y + iy, w: JET.w - ix * 2, h: JET.h - iy * 2 };
}

let obstacles = [];
let clouds = [];
let speedBase = INITIAL_SPEED; // 기준 해상도 기준 속도
let score = 0;
let distance = 0;
let isHolding = false;
let gameOver = false;
let running = false;
let rafId = null;
let spawnTimer = 0;
let spawnInterval = 90; // 프레임 단위, 랜덤하게 변동

/* 캔버스를 실제 표시 크기에 맞춰 다시 잡는다 (반응형) */
function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  // 플레이 화면이 숨겨져 있으면 크기를 0으로 읽으므로 그대로 둔다
  if (rect.width < 1 || rect.height < 1) return;
  const cssW = Math.round(rect.width);
  const cssH = Math.round(rect.height);
  if (cssW === W && cssH === H) return;

  const prevW = W;
  const prevH = H;
  W = cssW;
  H = cssH;
  sx = W / BASE_W;
  sy = H / BASE_H;
  su = Math.sqrt(sx * sy);

  // 고해상도 화면 대응 (과도한 메모리 사용을 막기 위해 2배까지만)
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // 진행 중이던 오브젝트들을 새 크기에 맞춰 비례 이동
  const rx = W / prevW;
  const ry = H / prevH;
  JET.x = 80 * sx;
  JET.w = 56 * su;
  JET.h = 20 * su;
  JET.y = JET.y * ry;
  JET.y = Math.max(0, Math.min(H - JET.h, JET.y));
  const rs = Math.sqrt(rx * ry);
  obstacles.forEach((o) => { o.x *= rx; o.y *= ry; o.w *= rs; o.h *= rs; });
  clouds.forEach((c) => { c.x *= rx; c.y *= ry; c.r *= rs; });

  draw();
}

function resetGame() {
  obstacles = [];
  clouds = [];
  resizeCanvas();
  for (let i = 0; i < 6; i++) {
    clouds.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: (20 + Math.random() * 40) * su,
      speed: (0.2 + Math.random() * 0.5),
    });
  }
  JET.y = H / 2 - JET.h / 2;
  JET.vy = 0;
  speedBase = INITIAL_SPEED;
  score = 0;
  distance = 0;
  isHolding = false;
  gameOver = false;
  spawnTimer = 0;
  spawnInterval = 90;
  document.getElementById("hud-score").textContent = "SCORE: 0";
}

function spawnObstacle() {
  // 완전 랜덤 위치 + 랜덤 크기 + 랜덤 타입
  const types = ["shell", "bird"];
  const type = types[Math.floor(Math.random() * types.length)];
  const size = (20 + Math.random() * 20) * su;
  const y = Math.random() * (H - size);
  obstacles.push({
    x: W + size,
    y,
    w: size,
    h: size,
    type,
    // 새 타입은 약간의 수직 이동을 랜덤으로 가짐
    vy: type === "bird" ? (Math.random() - 0.5) * 2 * sy : 0,
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
  JET.vy += (isHolding ? LIFT : GRAVITY) * sy;
  const maxVy = MAX_VY * sy;
  JET.vy = Math.max(-maxVy, Math.min(maxVy, JET.vy));
  JET.y += JET.vy;

  // 상/하단 경계에 닿으면 즉시 게임오버
  if (JET.y <= 0) {
    JET.y = 0;
    endGame();
    return;
  }
  if (JET.y + JET.h >= H) {
    JET.y = H - JET.h;
    endGame();
    return;
  }

  const dx = speedBase * sx; // 실제 픽셀 이동량

  // 배경 구름 스크롤
  clouds.forEach((c) => {
    c.x -= c.speed * sx * (speedBase / INITIAL_SPEED);
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
    o.x -= dx;
    o.y += o.vy || 0;
    // 새는 화면 위아래에서 반사
    if (o.vy) {
      if (o.y < 0 || o.y + o.h > H) o.vy *= -1;
    }
    if (rectsOverlap(jetBox, o)) crashed = true;
  });
  obstacles = obstacles.filter((o) => o.x + o.w > 0);

  // 점수 및 난이도 상승 (해상도와 무관하게 기준 단위로 누적)
  distance += speedBase;
  score = Math.floor(distance / 5);
  speedBase = INITIAL_SPEED + Math.floor(distance / 1500) * 0.5;

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
  if (isHolding && running) {
    ctx.fillStyle = "#ff9f43";
    ctx.beginPath();
    ctx.moveTo(JET.x + 2 * su, JET.y + JET.h * 0.32);
    ctx.lineTo(JET.x - (14 + Math.random() * 8) * su, JET.y + JET.h * 0.5);
    ctx.lineTo(JET.x + 2 * su, JET.y + JET.h * 0.62);
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

  // 상/하단 경계선 (닿으면 게임오버라 명확히 표시)
  ctx.fillStyle = "rgba(255,90,90,0.55)";
  const edge = Math.max(2, 3 * su);
  ctx.fillRect(0, 0, W, edge);
  ctx.fillRect(0, H - edge, W, edge);
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
  draw();

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
  showScreen("play");
  resetGame();
  running = true;
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

// 화면 크기 / 방향 변경 대응
window.addEventListener("resize", resizeCanvas);
window.addEventListener("orientationchange", resizeCanvas);

// 초기 로딩 시 순위 / 개인 최고 점수 표시
resizeCanvas();
loadMyBest();
refreshLeaderboards();
showScreen("start");
