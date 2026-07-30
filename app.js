import init, {
  wasm_calculate,
  wasm_simulate,
} from "./pkg/ftl_calculator.js";

// ─── Init WASM ────────────────────────────────────────────────────────────────

await init();

// ─── Tab switching ────────────────────────────────────────────────────────────

for (const btn of document.querySelectorAll(".tab-btn")) {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtVec(arr) {
  return `(${arr[0].toFixed(3)}, ${arr[1].toFixed(3)}, ${arr[2].toFixed(3)})`;
}

function setStatus(id, msg, isError = false) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className = "status" + (isError ? " error" : "");
}

// ─── Calculate TNT ────────────────────────────────────────────────────────────

let calcResults = []; // store full result objects for row selection

document.getElementById("btn-calculate").addEventListener("click", () => {
  const pearlX    = Math.floor(parseFloat(document.getElementById("pearl-x").value)) + 0.51;
  const pearlZ    = Math.floor(parseFloat(document.getElementById("pearl-z").value)) + 0.51;
  const destX     = parseFloat(document.getElementById("dest-x").value);
  const destZ     = parseFloat(document.getElementById("dest-z").value);
  const maxTnt       = parseInt(document.getElementById("max-tnt").value, 10);
  const maxTicks     = parseInt(document.getElementById("max-ticks").value, 10);
  const maxDist      = parseFloat(document.getElementById("max-distance").value);
  const cannonMaxTnt = parseInt(document.getElementById("cannon-size").value, 10);
  const mcVersion    = document.getElementById("mc-version").value;

  if ([pearlX, pearlZ, destX, destZ, maxTnt, maxTicks, maxDist, cannonMaxTnt].some(isNaN)) {
    setStatus("calc-status", "Invalid input — all fields are required.", true);
    return;
  }

  setStatus("calc-status", "Calculating…");
  const tbody = document.getElementById("results-body");
  tbody.innerHTML = "";
  calcResults = [];

  // Run WASM (synchronous — happens in microseconds to a few seconds)
  let results;
  try {
    results = wasm_calculate(pearlX, pearlZ, destX, destZ, maxTnt, maxTicks, maxDist, cannonMaxTnt, mcVersion);
  } catch (e) {
    setStatus("calc-status", `Error: ${e}`, true);
    return;
  }

  if (!results || results.length === 0) {
    setStatus("calc-status", "No results found.");
    return;
  }

  calcResults = results;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const tr = document.createElement("tr");
    tr.dataset.idx = i;
    tr.innerHTML = `
      <td>${r.distance.toFixed(3)}</td>
      <td>${fmtVec(r.end_pos)}</td>
      <td>${r.ticks}</td>
      <td>${r.early_tnt}</td>
      <td>${r.late_tnt}</td>
      <td>${r.early_tnt + r.late_tnt}</td>
    `;
    tr.addEventListener("click", () => onResultSelected(i, tr));
    tbody.appendChild(tr);
  }

  setStatus("calc-status", `${results.length} result${results.length !== 1 ? "s" : ""} found.`);
});

function onResultSelected(idx, tr) {
  // Highlight row
  document.querySelectorAll("#results-body tr").forEach((r) => r.classList.remove("selected"));
  tr.classList.add("selected");

  const r = calcResults[idx];

  // Fill Pearl Simulate tab
  document.getElementById("sim-pos-x").value = r.sim_pos[0];
  document.getElementById("sim-pos-y").value = r.sim_pos[1];
  document.getElementById("sim-pos-z").value = r.sim_pos[2];
  document.getElementById("sim-mot-x").value = r.sim_motion[0];
  document.getElementById("sim-mot-y").value = r.sim_motion[1];
  document.getElementById("sim-mot-z").value = r.sim_motion[2];

  // Auto-run simulation
  runSimulate();

  // Show encoding
  renderEncoding(r.encoding);
}

// ─── Encoding renderer ────────────────────────────────────────────────────────

function renderEncoding(encodingStr) {
  const placeholder = document.getElementById("encoding-placeholder");
  const container   = document.getElementById("encoding-container");
  const rowsEl      = document.getElementById("encoding-rows");
  const blockEl     = document.getElementById("encoding-block-row");

  if (!encodingStr) {
    placeholder.style.display = "";
    container.style.display = "none";
    return;
  }

  placeholder.style.display = "none";
  container.style.display = "";
  rowsEl.innerHTML = "";
  blockEl.innerHTML = "";

  for (const line of encodingStr.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // "label:  [value]"
    const bracketMatch = trimmed.match(/^([^:]+):\s+\[([^\]]*)\]$/);
    if (bracketMatch) {
      const label = bracketMatch[1].trim();
      const value = bracketMatch[2];
      const row = document.createElement("div");
      row.className = "enc-row";
      row.innerHTML = `<label>${label}</label><input type="text" readonly value="${value}">`;
      rowsEl.appendChild(row);
      continue;
    }

    // "place a block at: value"
    const blockMatch = trimmed.match(/^place a block at:\s*(.+)$/);
    if (blockMatch) {
      const row = document.createElement("div");
      row.className = "enc-row";
      row.innerHTML = `<label>coordinates</label><input type="text" readonly value="${blockMatch[1].trim()}">`;
      blockEl.appendChild(row);
    }
  }
}

// ─── Pearl Simulate ───────────────────────────────────────────────────────────

document.getElementById("btn-simulate").addEventListener("click", runSimulate);

function runSimulate() {
  const px = parseFloat(document.getElementById("sim-pos-x").value);
  const py = parseFloat(document.getElementById("sim-pos-y").value);
  const pz = parseFloat(document.getElementById("sim-pos-z").value);
  const mx = parseFloat(document.getElementById("sim-mot-x").value);
  const my = parseFloat(document.getElementById("sim-mot-y").value);
  const mz = parseFloat(document.getElementById("sim-mot-z").value);

  if ([px, py, pz, mx, my, mz].some(isNaN)) {
    setStatus("sim-status", "Invalid input.", true);
    return;
  }

  const tbody = document.getElementById("sim-body");
  tbody.innerHTML = "";
  document.getElementById("tp-output").textContent = "";

  let ticks;
  try {
    ticks = wasm_simulate(px, py, pz, mx, my, mz);
  } catch (e) {
    setStatus("sim-status", `Error: ${e}`, true);
    return;
  }

  if (!ticks || ticks.length === 0) {
    setStatus("sim-status", "Pearl starts at or below stop height.");
    return;
  }

  for (const t of ticks) {
    const tr = document.createElement("tr");
    // Store raw pos for /tp command on click
    tr.dataset.pos = JSON.stringify(t.pos);
    tr.innerHTML = `
      <td>${t.tick}</td>
      <td>${fmtVec(t.pos)}</td>
      <td>${fmtVec(t.motion)}</td>
    `;
    tr.addEventListener("click", () => {
      document.querySelectorAll("#sim-body tr").forEach((r) => r.classList.remove("selected"));
      tr.classList.add("selected");
      const [x, y, z] = t.pos;
      document.getElementById("tp-output").textContent = `/tp @p ${x} ${y} ${z}`;
    });
    tbody.appendChild(tr);
  }

  setStatus("sim-status", `${ticks.length} tick${ticks.length !== 1 ? "s" : ""} simulated.`);
}
