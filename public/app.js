// ====== 状態 ======
let ladder = null;        // { n, levels, rungs, top[], bottom[] }
let canvas, ctx;
let W, H, marginTop=60, marginBottom=60, marginX=80;

// 列x座標（Canvas）
function colX(i, n, W) {
  const usableW = W - marginX*2;
  if (n === 1) return marginX + usableW/2;
  return marginX + i * (usableW / (n - 1));
}
// 段y座標（Canvas）
function levelY(y, levels, H) {
  const usableH = H - (marginTop + marginBottom);
  return marginTop + y * (usableH / levels);
}

function clearCanvas() {
  ctx.clearRect(0, 0, W, H);
}

function drawBase() {
  if (!ladder) return;
  const { n, levels, rungs } = ladder;

  // 背景
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);

  // 縦線
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#333";
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.moveTo(colX(i,n,W), levelY(0,levels,H));
    ctx.lineTo(colX(i,n,W), levelY(levels,levels,H));
    ctx.stroke();
  }

  // 横線
  ctx.strokeStyle = "#888";
  for (const r of rungs) {
    const y = levelY(r.y, levels, H);
    ctx.beginPath();
    ctx.moveTo(colX(r.left, n, W), y);
    ctx.lineTo(colX(r.left+1, n, W), y);
    ctx.stroke();
  }
}

function makeTopInputs(n) {
  const row = document.getElementById("top-labels");
  row.innerHTML = "";
  row.style.gridTemplateColumns = `repeat(${n}, minmax(80px, 1fr))`;
  for (let i=0; i<n; i++) {
    const col = document.createElement("div");
    col.className = "label-col";
    const label = document.createElement("span");
    label.className = "badge";
    label.textContent = `上 ${i+1}`;
    const input = document.createElement("input");
    input.placeholder = "上の項目（任意）";
    input.value = ladder?.top?.[i] || "";
    input.addEventListener("input", () => {
      ladder.top[i] = input.value;
    });
    const btn = document.createElement("button");
    btn.textContent = "スタート ▶";
    btn.className = "start-btn";
    btn.addEventListener("click", () => startTrace(i));
    col.appendChild(label);
    col.appendChild(input);
    col.appendChild(btn);
    row.appendChild(col);
  }
}

function renderBottom(n, labels) {
  const row = document.getElementById("bottom-labels");
  row.innerHTML = "";
  row.style.gridTemplateColumns = `repeat(${n}, minmax(80px, 1fr))`;
  for (let i=0; i<n; i++) {
    const col = document.createElement("div");
    col.className = "label-col";
    const label = document.createElement("span");
    label.className = "badge";
    label.textContent = labels[i] ?? "";
    col.appendChild(label);
    row.appendChild(col);
  }
}

async function startTrace(startIdx) {
  if (!ladder) return;
  const payload = {
    n: ladder.n,
    levels: ladder.levels,
    rungs: ladder.rungs,
    start: startIdx
  };
  const res = await fetch("/api/trace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  const path = data.path; // [{x,y}...] x:列, y:段

  // アニメーション描画
  clearCanvas();
  drawBase();

  // 事前に Canvas 座標へ変換
  const pts = path.map(p => ({
    x: colX(p.x, ladder.n, W),
    y: levelY(p.y, ladder.levels, H)
  }));

  // 赤線アニメーション
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#e02";
  ctx.lineCap = "round";

  // 線分ごとに一定時間で描画
  let seg = 0;
  let t = 0;
  const segDur = 180; // ms / segment（縦/横ごと）

  function step(ts) {
    if (seg >= pts.length - 1) return;
    if (!t) t = ts;
    const elapsed = ts - t;

    // 現在のセグメント
    const a = pts[seg], b = pts[seg+1];
    const ratio = Math.min(1, elapsed / segDur);

    // 直前までを確定描画
    clearCanvas();
    drawBase();
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i=1; i<=seg; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    // 現在の途中点
    const x = a.x + (b.x - a.x) * ratio;
    const y = a.y + (b.y - a.y) * ratio;
    ctx.lineTo(x, y);
    ctx.stroke();

    if (ratio >= 1) {
      seg++;
      t = ts;
    }
    if (seg < pts.length - 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// 生成ボタン
async function onGenerate() {
  const n = Math.max(2, Math.min(50, Number(document.getElementById("n").value || 5)));
  const levelsRaw = document.getElementById("levels").value;
  const levels = levelsRaw ? Math.max(1, Number(levelsRaw)) : undefined;
  const density = Number(document.getElementById("density").value || 0.55);
  const bottomRaw = document.getElementById("bottom").value.trim();
  const bottom = bottomRaw.length ? bottomRaw.split(",").map(s => s.trim()) : [];

  const payload = {
    n,
    levels,
    rungDensity: density,
    bottom: bottom,
    defaultAtari: !bottomRaw.length
  };
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  ladder = data.ladder;

  // Canvas 再計算
  canvas = document.getElementById("canvas");
  ctx = canvas.getContext("2d");
  W = canvas.width;
  H = canvas.height;

  // UI・描画更新
  makeTopInputs(ladder.n);
  renderBottom(ladder.n, ladder.bottom);
  clearCanvas();
  drawBase();
}

window.addEventListener("DOMContentLoaded", () => {
  canvas = document.getElementById("canvas");
  ctx = canvas.getContext("2d");
  W = canvas.width;
  H = canvas.height;

  document.getElementById("btn-generate").addEventListener("click", onGenerate);

  // 初期生成
  onGenerate();
});
