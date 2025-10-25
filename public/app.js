// ====== 状態 ======
let ladder = null;        // { n, levels, rungs, top[], bottom[] }
let canvas, ctx;
let W, H, marginTop=60, marginBottom=60, marginX=80;

// ...（座標系・描画系はそのまま）...

function makeBottomInputs(n, values = []) {
  const wrap = document.getElementById("bottom-editor");
  wrap.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const def = (i === 0) ? "あたり" : "はずれ";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = def;          // 参考表示としても置いておく
    input.value = (values[i] ?? def); // ← 初期値を実際の値として入力
    wrap.appendChild(input);
  }
}

function collectBottomInputs() {
  const wrap = document.getElementById("bottom-editor");
  const inputs = Array.from(wrap.querySelectorAll("input"));
  const vals = inputs.map((el, i) => {
    const v = el.value.trim();
    return v.length ? v : (i === 0 ? "あたり" : "はずれ"); // ← 空なら補完
  });
  return vals;
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
    input.addEventListener("input", () => { ladder.top[i] = input.value; });
    const btn = document.createElement("button");
    btn.textContent = "スタート ▶";
    btn.className = "start-btn";
    btn.addEventListener("click", () => startTrace(i));
    col.appendChild(label); col.appendChild(input); col.appendChild(btn);
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

// 生成ボタン
async function onGenerate() {
  const n = Math.max(2, Math.min(50, Number(document.getElementById("n").value || 5)));
  const bottomVals = collectBottomInputs(); // 下の入力値（またはデフォルト）

  const payload = {
    n,
    levels: 0,             // ← 明示的に送る（未入力扱い）
    rungDensity: 0.55,     // ← デフォルトの密度を常に送る
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

  // Canvas 再計算＆描画
  canvas = document.getElementById("canvas");
  ctx = canvas.getContext("2d");
  W = canvas.width;
  H = canvas.height;

  makeTopInputs(ladder.n);
  renderBottom(ladder.n, ladder.bottom);
  clearCanvas();
  drawBase();
}

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
  if (!res.ok) { console.error(await res.text()); return; }
  const data = await res.json();

  // アニメーション（元のまま）
  clearCanvas(); drawBase();
  const pts = data.path.map(p => ({ x: colX(p.x, ladder.n, W), y: levelY(p.y, ladder.levels, H) }));
  ctx.lineWidth = 4; ctx.strokeStyle = "#e02"; ctx.lineCap = "round";
  let seg = 0, t = 0, segDur = 180;
  function step(ts) {
    if (seg >= pts.length - 1) return;
    if (!t) t = ts;
    const a = pts[seg], b = pts[seg+1];
    const ratio = Math.min(1, (ts - t) / segDur);
    clearCanvas(); drawBase();
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i=1; i<=seg; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.lineTo(a.x + (b.x-a.x)*ratio, a.y + (b.y-a.y)*ratio);
    ctx.stroke();
    if (ratio >= 1) { seg++; t = ts; }
    if (seg < pts.length - 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

window.addEventListener("DOMContentLoaded", () => {
  canvas = document.getElementById("canvas");
  ctx = canvas.getContext("2d");
  W = canvas.width; H = canvas.height;

  const nInput = document.getElementById("n");
  nInput.addEventListener("input", () => {
    // 変更前の値を拾って、できるだけ引き継ぐ
    const prev = collectBottomInputs();
    const n = Math.max(2, Math.min(50, Number(nInput.value || 5)));
    makeBottomInputs(n, prev); // 足りない分はデフォルトで埋まる
  });

  // 初期表示
  makeBottomInputs(Number(nInput.value || 5));

  document.getElementById("btn-generate").addEventListener("click", onGenerate);
  onGenerate(); // 初期生成
});
