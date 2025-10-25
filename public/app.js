// ====== 状態 ======
let ladder = null;        // { n, levels, rungs, top[], bottom[] }
let canvas, ctx;
let W, H;
const marginTop = 60, marginBottom = 60, marginX = 80;
const COL_SPACING = 100; // 縦線間の最低ピクセル間隔（多いときは横スクロール）

// 列x座標（Canvas）
function colX(i, n, W) {
  const usableW = W - marginX * 2;
  if (n === 1) return marginX + usableW / 2;
  return marginX + i * (usableW / (n - 1));
}

// 段y座標（Canvas）
function levelY(y, levels, H) {
  const usableH = H - (marginTop + marginBottom);
  return marginTop + y * (usableH / levels);
}

// Canvas サイズを縦線本数に応じて決定（横スクロール許容）
function computeCanvasWidth(n) {
  const minW = 900; // 最低幅
  const needed = marginX * 2 + (n - 1) * COL_SPACING;
  return Math.max(minW, needed);
}

function initCanvas(n) {
  canvas = document.getElementById("canvas");
  ctx = canvas.getContext("2d");

  // 幅は列数から算出、高さは固定（必要なら調整可）
  W = computeCanvasWidth(n);
  H = canvas.height; // index.html で 560 固定

  canvas.width = W;

  // board-wrap の幅も Canvas に合わせる（overlay と一体化）
  const wrap = document.getElementById("board-wrap");
  wrap.style.width = `${W}px`;
}

function clearCanvas() {
  ctx.clearRect(0, 0, W, H);
}

// ベース線（縦線・横線）描画（状態を漏らさない）
function drawBase() {
  if (!ladder) return;
  const { n, levels, rungs } = ladder;

  ctx.save();

  // 背景
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);

  // 縦線
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#333";
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.moveTo(colX(i, n, W), levelY(0, levels, H));
    ctx.lineTo(colX(i, n, W), levelY(levels, levels, H));
    ctx.stroke();
  }

  // 横線
  ctx.strokeStyle = "#888";
  for (const r of rungs) {
    const y = levelY(r.y, levels, H);
    ctx.beginPath();
    ctx.moveTo(colX(r.left, n, W), y);
    ctx.lineTo(colX(r.left + 1, n, W), y);
    ctx.stroke();
  }

  ctx.restore();
}

// 下の入力欄（ボトム）生成（コントロール部）
function makeBottomInputs(n, values = []) {
  const wrap = document.getElementById("bottom-editor");
  wrap.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const def = (i === 0) ? "あたり" : "はずれ";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = def;
    input.value = (values[i] ?? def);
    wrap.appendChild(input);
  }
}

// 下入力の値を取得
function collectBottomInputs() {
  const wrap = document.getElementById("bottom-editor");
  const inputs = Array.from(wrap.querySelectorAll("input"));
  const vals = inputs.map((el, i) => {
    const v = el.value.trim();
    return v.length ? v : (i === 0 ? "あたり" : "はずれ");
  });
  return vals;
}

// ★ Overlay を Canvas 座標に同期配置（ズレを根絶）
function renderTopOverlay(n) {
  const top = document.getElementById("top-overlay");
  top.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const node = document.createElement("div");
    node.className = "top-node";
    node.style.left = `${colX(i, n, W)}px`;

    const input = document.createElement("input");
    input.placeholder = "なまえ";
    input.value = ladder?.top?.[i] || "";
    input.addEventListener("input", () => {
      ladder.top[i] = input.value;
    });

    const btn = document.createElement("button");
    btn.textContent = "スタート ▶";
    btn.className = "start-btn";
    btn.addEventListener("click", () => startTrace(i));

    node.appendChild(input);
    node.appendChild(btn);
    top.appendChild(node);
  }
}

function renderBottomOverlay(n, labels) {
  const bottom = document.getElementById("bottom-overlay");
  bottom.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const node = document.createElement("div");
    node.className = "bottom-node";
    node.style.left = `${colX(i, n, W)}px`;

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = labels[i] ?? "";

    node.appendChild(badge);
    bottom.appendChild(node);
  }
}

// 経路アニメーション
async function startTrace(startIdx) {
  if (!ladder) return;

  const payload = {
    n: ladder.n,
    levels: ladder.levels,
    rungs: ladder.rungs,
    start: startIdx
  };

  const res = await fetch("/api/trace/main", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    console.error(await res.text());
    return;
  }

  const data = await res.json();
  const path = data.path;

  clearCanvas();
  drawBase();

  const pts = path.map(p => ({
    x: colX(p.x, ladder.n, W),
    y: levelY(p.y, ladder.levels, H)
  }));

  const applyRedStyle = () => {
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#e02";
    ctx.lineCap = "round";
  };
  applyRedStyle();

  let seg = 0;
  let t = 0;
  const segDur = 180;

  function step(ts) {
    if (seg >= pts.length - 1) return;
    if (!t) t = ts;
    const elapsed = ts - t;

    const a = pts[seg], b = pts[seg + 1];
    const ratio = Math.min(1, elapsed / segDur);

    clearCanvas();
    drawBase();
    applyRedStyle();

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i <= seg; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.lineTo(a.x + (b.x - a.x) * ratio, a.y + (b.y - a.y) * ratio);
    ctx.stroke();

    if (ratio >= 1) {
      seg++;
      t = ts;
    }
    if (seg < pts.length - 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

// 生成ボタン処理
async function onGenerate() {
  const n = Math.max(2, Math.min(50, Number(document.getElementById("n").value || 5)));
  initCanvas(n);

  const bottomVals = collectBottomInputs();

  const payload = {
    n,
    levels: 0,          // バックエンドが n*3 に補完
    bottom: bottomVals,
    defaultAtari: false
  };

  const res = await fetch("/api/generate/main", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    alert(`Generate failed: ${res.status} ${txt}`);
    return;
  }

  const data = await res.json();
  ladder = data.ladder;

  // Overlay を Canvas の列位置に同期
  renderTopOverlay(ladder.n);
  renderBottomOverlay(ladder.n, ladder.bottom);

  clearCanvas();
  drawBase();

  // 念のため1フレーム後に再描画（リサイズ直後の安全策）
  requestAnimationFrame(() => {
    clearCanvas();
    drawBase();
  });
}

// 初期化
window.addEventListener("DOMContentLoaded", () => {
  // 初期 Canvas セットアップ（n 初期値に合わせる）
  const n0 = Number(document.getElementById("n").value || 5);
  initCanvas(n0);

  const nInput = document.getElementById("n");
  nInput.addEventListener("input", () => {
    const prev = collectBottomInputs();
    const n = Math.max(2, Math.min(50, Number(nInput.value || 5)));
    makeBottomInputs(n, prev);
    // 入力変更時点では描画は行わず、生成時にまとめてリサイズ
  });

  // 下入力欄の初期生成
  makeBottomInputs(n0);

  document.getElementById("btn-generate").addEventListener("click", onGenerate);
  onGenerate(); // 初期生成
});
