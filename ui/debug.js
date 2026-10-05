// Development diagnostics, rendered only inside the closed "Debug details"
// disclosure. Not part of the normal user interface.

export function renderDebug(container, info) {
  container.replaceChildren();
  const { recognition, solution, timingsMs, error, resumed } = info;
  const rows = [];
  if (resumed) {
    rows.push(['Source', 'Resumed from saved progress (no screenshot diagnostics)']);
    rows.push(['State', resumed.start.join(' ')]);
    rows.push(['Solution', `${resumed.taps.length} taps (saved) · resumed at move ${resumed.index + 1}`]);
    rows.push(['Taps', resumed.taps.join(' ')]);
  }
  if (error) rows.push(['Error', `${error.code}: ${error.message}`]);
  if (timingsMs) rows.push(['Timings (ms)', Object.entries(timingsMs).map(([k, v]) => `${k} ${Math.round(v)}`).join(', ')]);
  const d = recognition?.diagnostics;
  if (d) {
    const b = d.boardDetection;
    rows.push(['Image', `${d.image.width} × ${d.image.height}`]);
    rows.push(['Board detection', b.ok ? `confidence ${b.confidence} · rect ${fmt(b.rect.x)},${fmt(b.rect.y)} ${fmt(b.rect.w)}×${fmt(b.rect.h)}` : b.reason]);
    if (d.tiles) rows.push(['Tiles', `mean ΔE ${d.tiles.meanDeltaE} · worst ΔE ${d.tiles.worstDeltaE} · weakest margin ${d.tiles.minMargin}`]);
    if (d.boardConfidence != null) rows.push(['Overall confidence', String(d.boardConfidence)]);
    const st = recognition.state ?? d.candidate?.state;
    if (st) rows.push(['State', st.join(' ')]);
  }
  if (solution?.ok) {
    rows.push(['Solution', `${solution.length} taps · ${solution.orientation} (rows-first ${solution.candidates['rows-first'].length}, columns-first ${solution.candidates['columns-first'].length})`]);
    rows.push(['Taps', solution.taps.join(' ')]);
  } else if (solution && !solution.ok) {
    rows.push(['Solver', `${solution.error.code}: ${solution.error.message}`]);
  }
  const dl = document.createElement('dl');
  for (const [k, v] of rows) dl.append(el('dt', k), el('dd', v));
  container.append(dl);

  if (d?.tiles) {
    const t = document.createElement('table');
    header(t, ['Cell', 'Tile', 'Best ΔE', '2nd', '2nd ΔE', 'Margin', 'Source', 'OK']);
    for (const c of d.tiles.cells) {
      row(t, [`r${c.row + 1}c${c.col + 1}`, c.tile, c.bestDeltaE, c.secondTile, c.secondDeltaE, c.margin, c.marginSource, c.confident ? '✓' : '✗']);
    }
    const wrap = document.createElement('div');
    wrap.className = 'scroll';
    wrap.append(t);
    container.append(wrap);
  }
  const pre = document.createElement('pre');
  pre.textContent = JSON.stringify({ recognition: d ?? null, solution: solution ?? null }, null, 1);
  container.append(pre);
}

function header(t, cols) { const tr = t.createTHead().insertRow(); for (const c of cols) tr.append(el('th', c)); }
function row(t, vals) { const tr = (t.tBodies[0] ?? t.createTBody()).insertRow(); for (const v of vals) tr.insertCell().textContent = String(v ?? ''); }
function el(tag, text) { const e = document.createElement(tag); e.textContent = text; return e; }
function fmt(v) { return Math.round(v); }
