import { state, emit, onChange, rateAt, rateLabel, fmtTime, applyPreset, PRESETS, DEFAULT_CURVE, HOURS, MAX_RATE, MAX_DEPTH } from './state.js';

const $ = (id) => document.getElementById(id);
const SVG = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(SVG, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function snowType(temp) {
  if (temp > 2.5) return '雨';
  if (temp > 0.8) return '雨夹雪';
  if (temp > -1.5) return '湿雪';
  if (temp > -9) return '干雪';
  return '粉雪';
}

export function createUI({ onSound, onQuality, quality }) {
  // ---------- curve ----------
  const svg = $('curve');
  const X0 = 26, X1 = 332, Y0 = 12, Y1 = 146;
  const xOf = (h) => X0 + ((X1 - X0) * h) / 24, yOf = (v) => Y1 - ((Y1 - Y0) * v) / MAX_RATE;
  const defs = el('defs', {}, svg);
  const grad = el('linearGradient', { id: 'areaGrad', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  el('stop', { offset: '0', 'stop-color': 'rgba(210,228,255,0.34)' }, grad);
  el('stop', { offset: '1', 'stop-color': 'rgba(210,228,255,0)' }, grad);
  el('rect', { class: 'night', x: xOf(0), y: Y0, width: xOf(7.3) - xOf(0), height: Y1 - Y0 }, svg);
  el('rect', { class: 'night', x: xOf(17), y: Y0, width: xOf(24) - xOf(17), height: Y1 - Y0 }, svg);
  for (const v of [0, 2, 4, 6, 8]) {
    el('line', { class: 'grid', x1: X0, x2: X1, y1: yOf(v), y2: yOf(v) }, svg);
    el('text', { x: X0 - 6, y: yOf(v) + 3, 'text-anchor': 'end' }, svg).textContent = v;
  }
  for (const h of [0, 6, 12, 18, 24]) {
    el('line', { class: 'grid', x1: xOf(h), x2: xOf(h), y1: Y0, y2: Y1 }, svg);
    el('text', { x: xOf(h), y: Y1 + 14, 'text-anchor': 'middle' }, svg).textContent = String(h).padStart(2, '0');
  }
  const area = el('path', { class: 'area' }, svg), line = el('path', { class: 'line' }, svg);
  const play = el('line', { class: 'play', y1: Y0, y2: Y1 }, svg), playDot = el('circle', { class: 'playdot', r: 3.2 }, svg);
  const hits = [], nodes = [];
  let active = -1;
  for (let i = 0; i < HOURS; i++) {
    const hit = el('circle', { class: 'hit', r: 8, tabindex: 0 }, svg);
    const node = el('circle', { class: 'node', r: 2.6 }, svg);
    hits.push(hit); nodes.push(node);
    const setFromEvent = (ev) => {
      const r = svg.getBoundingClientRect();
      const y = ((ev.clientY - r.top) / r.height) * 170;
      setValue(i, ((Y1 - y) / (Y1 - Y0)) * MAX_RATE);
    };
    hit.addEventListener('pointerdown', (ev) => { hit.setPointerCapture(ev.pointerId); active = i; hit.classList.add('active'); setFromEvent(ev); ev.preventDefault(); });
    hit.addEventListener('pointermove', (ev) => { if (hit.hasPointerCapture(ev.pointerId)) setFromEvent(ev); });
    const end = () => { hit.classList.remove('active'); active = -1; drawReadout(); };
    hit.addEventListener('pointerup', end); hit.addEventListener('pointercancel', end);
    hit.addEventListener('pointerenter', () => { if (active < 0) drawReadout(i); });
    hit.addEventListener('pointerleave', () => { if (active < 0) drawReadout(); });
    hit.addEventListener('focus', () => drawReadout(i));
    hit.addEventListener('blur', () => drawReadout());
    hit.addEventListener('keydown', (ev) => {
      const step = ev.shiftKey ? 0.5 : 0.1;
      if (ev.key === 'ArrowUp') { setValue(i, state.curve[i] + step); drawReadout(i); ev.preventDefault(); }
      else if (ev.key === 'ArrowDown') { setValue(i, state.curve[i] - step); drawReadout(i); ev.preventDefault(); }
      else if (ev.key === 'ArrowRight') { hits[Math.min(HOURS - 1, i + 1)].focus(); ev.preventDefault(); }
      else if (ev.key === 'ArrowLeft') { hits[Math.max(0, i - 1)].focus(); ev.preventDefault(); }
    });
  }
  function setValue(i, v) {
    state.curve[i] = Math.round(clamp(v, 0, MAX_RATE) * 10) / 10;
    emit('curve');
  }
  function drawCurve() {
    let d = '';
    for (let s = 0; s <= 24 * 6; s++) d += `${s ? 'L' : 'M'}${xOf(s / 6).toFixed(1)} ${yOf(rateAt(s / 6)).toFixed(1)}`;
    line.setAttribute('d', d);
    area.setAttribute('d', `${d}L${X1} ${Y1}L${X0} ${Y1}Z`);
    state.curve.forEach((v, i) => {
      for (const c of [hits[i], nodes[i]]) { c.setAttribute('cx', xOf(i)); c.setAttribute('cy', yOf(v)); }
      const inp = inputs[i];
      if (inp && document.activeElement !== inp) inp.value = v.toFixed(1);
    });
    drawReadout(active >= 0 ? active : undefined);
  }
  function drawReadout(i) {
    const t = i === undefined ? state.time : i, v = i === undefined ? rateAt(state.time) : state.curve[i];
    $('curveTime').textContent = fmtTime(t); $('curveVal').textContent = v.toFixed(1);
  }

  // ---------- precise inputs ----------
  const inputs = [];
  const grid = $('grid');
  for (let i = 0; i < HOURS; i++) {
    const cell = document.createElement('label'); cell.className = 'cell';
    cell.innerHTML = `<span>${String(i).padStart(2, '0')}:00</span><input type="number" min="0" max="${MAX_RATE}" step="0.1" /><i>cm/h</i>`;
    const inp = cell.querySelector('input');
    inp.addEventListener('input', () => { const v = parseFloat(inp.value); if (!Number.isNaN(v)) setValue(i, v); });
    inp.addEventListener('blur', () => { inp.value = state.curve[i].toFixed(1); });
    inputs.push(inp); grid.appendChild(cell);
  }

  // ---------- sliders ----------
  const windName = (d) => ['北', '东北', '东', '东南', '南', '西南', '西', '西北'][Math.round(d / 45) % 8];
  const defsS = [
    { key: 'temp', label: '气温', min: -25, max: 5, step: 0.1, fmt: (v) => `${v.toFixed(1)} °C` },
    { key: 'wind', label: '风速', min: 0, max: 25, step: 0.1, fmt: (v) => `${v.toFixed(1)} m/s` },
    { key: 'windDir', label: '风向', min: 0, max: 359, step: 1, fmt: (v) => `${windName(v)}风 ${v.toFixed(0)}°` },
    { key: 'gust', label: '阵风', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)} %` },
    { key: 'haze', label: '雾气', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)} %` },
    { key: 'cloud', label: '云量', min: 0, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)} %` },
    { key: 'aurora', label: '极光', min: 0, max: 1, step: 0.01, fmt: (v) => (v < 0.01 ? '关' : `${Math.round(v * 100)} %`) },
    { key: 'depth', label: '积雪厚度', min: 0, max: MAX_DEPTH, step: 0.005, fmt: (v) => `${(v * 100).toFixed(0)} cm` },
  ];
  const sliders = {};
  for (const s of defsS) {
    const row = document.createElement('div'); row.className = 'slider';
    row.innerHTML = `<label>${s.label}</label><input type="range" min="${s.min}" max="${s.max}" step="${s.step}" /><output></output>`;
    const inp = row.querySelector('input'), out = row.querySelector('output');
    inp.addEventListener('input', () => { state[s.key] = parseFloat(inp.value); out.textContent = s.fmt(state[s.key]); emit(s.key); });
    sliders[s.key] = { inp, out, s, dragging: false };
    inp.addEventListener('pointerdown', () => { sliders[s.key].dragging = true; });
    window.addEventListener('pointerup', () => { sliders[s.key].dragging = false; });
    $('sliders').appendChild(row);
  }
  function syncSliders() {
    for (const k in sliders) { const { inp, out, s } = sliders[k]; inp.value = state[k]; out.textContent = s.fmt(state[k]); }
  }

  // ---------- presets ----------
  for (const key in PRESETS) {
    const b = document.createElement('button'); b.textContent = PRESETS[key].name;
    b.addEventListener('click', () => applyPreset(key));
    $('presets').appendChild(b);
  }

  // ---------- timeline / buttons ----------
  const time = $('time');
  time.addEventListener('input', () => { state.time = parseFloat(time.value); emit('time'); });
  const setPlay = (p) => { state.playing = p; $('btnPlay').textContent = p ? '❚❚' : '▶'; };
  $('btnPlay').addEventListener('click', () => setPlay(!state.playing));
  $('speed').value = String(state.dayLength);
  $('speed').addEventListener('change', (e) => { state.dayLength = parseFloat(e.target.value); });
  $('btnReset').addEventListener('click', () => { state.curve = [...DEFAULT_CURVE]; emit('curve'); });
  $('btnClear').addEventListener('click', () => { state.depth = 0; emit('depth'); syncSliders(); });
  $('btnPanel').addEventListener('click', () => document.body.classList.toggle('panel-closed'));
  $('btnCam').addEventListener('click', (e) => { state.autoCam = !state.autoCam; e.target.classList.toggle('on', state.autoCam); });
  $('btnSound').addEventListener('click', (e) => {
    state.sound = !state.sound; e.target.classList.toggle('on', state.sound);
    e.target.textContent = state.sound ? '风声 开' : '风声 关'; onSound(state.sound);
  });
  $('selQuality').value = quality;
  $('selQuality').addEventListener('change', (e) => onQuality(e.target.value));
  $('btnFull').addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); });
  window.addEventListener('keydown', (ev) => {
    if (ev.target.tagName === 'INPUT' || ev.target.tagName === 'SELECT') return;
    if (ev.key === 'h' || ev.key === 'H') document.body.classList.toggle('hide-ui');
    if (ev.key === ' ') { setPlay(!state.playing); ev.preventDefault(); }
  });

  onChange((what) => { if (what === 'all' || what === 'curve') drawCurve(); if (what === 'all') syncSliders(); });
  drawCurve(); syncSliders(); setPlay(state.playing);

  let last = 0;
  return {
    frame(now, vis) {
      if (now - last < 90) return;
      last = now;
      const rate = rateAt(state.time);
      if (document.activeElement !== time) time.value = state.time;
      play.setAttribute('x1', xOf(state.time)); play.setAttribute('x2', xOf(state.time));
      playDot.setAttribute('cx', xOf(state.time)); playDot.setAttribute('cy', yOf(rate));
      if (active < 0 && !svg.querySelector('.hit:hover, .hit:focus')) drawReadout();
      const d = sliders.depth;
      if (!d.dragging) { d.inp.value = state.depth; d.out.textContent = d.s.fmt(state.depth); }
      $('hudTime').textContent = fmtTime(state.time);
      $('hudRate').textContent = `${rate.toFixed(1)} cm/h`;
      $('hudLabel').textContent = rateLabel(rate);
      $('hudTemp').textContent = `${state.temp.toFixed(1)} °C`;
      $('hudType').textContent = snowType(state.temp);
      $('hudWind').textContent = `${vis.wind.toFixed(1)} m/s`;
      $('hudDepth').textContent = `${(state.depth * 100).toFixed(0)} cm${vis.growth > 0.15 ? ' ↑' : vis.growth < -0.15 ? ' ↓' : ''}`;
    },
  };
}
