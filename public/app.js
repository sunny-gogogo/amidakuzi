// ====== 状態 ======
let ladder = null;        // { n, levels, rungs, top[], bottom[] }
let canvas, ctx;
let W, H, marginTop = 60, marginBottom = 60, marginX = 80;

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

// Canvasクリア
function clearCanvas() {
  ctx.clearRect(0, 0, W, H);
}

// ベース線（縦線・横線）描画（状態を漏らさない）
function drawBase() {
  if (!ladder) {
    console.warn("drawBase: ladder is null");
    return;
  }

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

// 下の入力欄（ボトム）生成
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

// 上側の入力＋スタートボタン群
function makeTopInputs(n) {
  const row = document.getElementById("top-labels");
  row.innerHTML = "";
  row.style.gridTemplateColumns = `repeat(${n}, minmax(80px, 1fr))`;

  for (let i = 0; i < n; i++) {
    const col = document.createElement("div");
    col.className = "label-col";

    // ❌ 上1〜上Nのラベルを削除
    // const label = document.createElement("span");
    // label.className = "badge";
    // label.textContent = `上 ${i + 1}`;

    const input = document.createElement("input");
    input.placeholder = "なまえ(任意)";
    input.value = ladder?.top?.[i] || "";
    input.addEventListener("input", () => {
      ladder.top[i] = input.value;
    });

    const btn = document.createElement("button");
    btn.textContent = "スタート ▶";
    btn.className = "start-btn";
    btn.addEventListener("click", () => startTrace(i));

    // ラベルを入れないように変更
    col.appendChild(input);
    col.appendChild(btn);
    row.appendChild(col);
  }
}

// 下側の結果表示（固定ラベル）
function renderBottom(n, labels) {
  const row = document.getElementById("bottom-labels");
  row.innerHTML = "";
  row.style.gridTemplateColumns = `repeat(${n}, minmax(80px, 1fr))`;
  for (let i = 0; i < n; i++) {
    const col = document.createElement("div");
    col.className = "label-col";
    const label = document.createElement("span");
    label.className = "badge";
    label.textContent = labels[i] ?? "";
    col.appendChild(label);
    row.appendChild(col);
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
  canvas = document.getElementById("canvas");
  ctx = canvas.getContext("2d");
  W = canvas.width;
  H = canvas.height;

  const n = Math.max(2, Math.min(50, Number(document.getElementById("n").value || 5)));
  const bottomVals = collectBottomInputs();

  const payload = {
    n,
    levels: 0,
    rungDensity: 0.55,
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

  makeTopInputs(ladder.n);
  renderBottom(ladder.n, ladder.bottom);
  clearCanvas();
  drawBase();

  requestAnimationFrame(() => {
    clearCanvas();
    drawBase();
  });
}

// 初期化
window.addEventListener("DOMContentLoaded", () => {
  canvas = document.getElementById("canvas");
  ctx = canvas.getContext("2d");
  W = canvas.width;
  H = canvas.height;

  const nInput = document.getElementById("n");
  nInput.addEventListener("input", () => {
    const prev = collectBottomInputs();
    const n = Math.max(2, Math.min(50, Number(nInput.value || 5)));
    makeBottomInputs(n, prev);
  });

  makeBottomInputs(Number(nInput.value || 5));
  document.getElementById("btn-generate").addEventListener("click", onGenerate);
  onGenerate();
});
