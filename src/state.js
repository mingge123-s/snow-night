export const HOURS = 25;
export const MAX_RATE = 8; // cm/h
export const MAX_DEPTH = 0.8; // m

export const DEFAULT_CURVE = [
  0.4, 0.6, 1.2, 2.2, 3.0, 2.4, 1.5, 0.8, 0.4, 0.2, 0.1, 0.3, 0.8,
  1.4, 1.0, 0.6, 1.2, 2.4, 3.8, 4.6, 4.0, 2.8, 1.6, 0.8, 0.4,
];

export const PRESETS = {
  calm: {
    name: '小雪静夜',
    curve: Array.from({ length: HOURS }, (_, i) => +(0.5 + 0.35 * Math.sin(i * 0.7)).toFixed(1)),
    temp: -4, wind: 0.8, windDir: 250, gust: 0.15, haze: 0.15, time: 21, depth: 0.1, aurora: 0.6, cloud: 0.4,
  },
  heavy: {
    name: '鹅毛大雪',
    curve: Array.from({ length: HOURS }, (_, i) => +(3.6 + 1.2 * Math.sin(i * 0.5)).toFixed(1)),
    temp: -0.5, wind: 1.5, windDir: 230, gust: 0.25, haze: 0.35, time: 19, depth: 0.22, aurora: 0.6, cloud: 0.5,
  },
  blizzard: {
    name: '暴风雪',
    curve: Array.from({ length: HOURS }, (_, i) => +(5.8 + 1.8 * Math.sin(i * 0.9)).toFixed(1)),
    temp: -16, wind: 17, windDir: 265, gust: 0.8, haze: 0.7, time: 22, depth: 0.4, aurora: 0.6, cloud: 0.6,
  },
  sleet: {
    name: '雨夹雪',
    curve: Array.from({ length: HOURS }, (_, i) => +(2.4 + 1.0 * Math.sin(i * 0.6)).toFixed(1)),
    temp: 1.6, wind: 4, windDir: 240, gust: 0.4, haze: 0.4, time: 17.5, depth: 0.08, aurora: 0.6, cloud: 0.6,
  },
  clear: {
    name: '雪后初晴',
    curve: Array.from({ length: HOURS }, () => 0),
    temp: -9, wind: 1.2, windDir: 250, gust: 0.2, haze: 0.0, time: 9.5, depth: 0.45, aurora: 0.6, cloud: 0.3,
  },
  sunset: {
    name: '雪后夕阳',
    curve: Array.from({ length: HOURS }, (_, i) => +(i < 20 ? 0 : (i - 19) * 0.4).toFixed(1)),
    temp: -7, wind: 1.5, windDir: 250, gust: 0.2, haze: 0.04, time: 16.4, depth: 0.5, aurora: 0.6, cloud: 0.55,
  },
  aurora: {
    name: '极光之夜',
    curve: Array.from({ length: HOURS }, () => 0),
    temp: -18, wind: 0.8, windDir: 250, gust: 0.15, haze: 0.0, time: 23, depth: 0.55, aurora: 1, cloud: 0.12,
  },
};

export const state = {
  curve: [...DEFAULT_CURVE],
  time: 18.6,
  playing: true,
  dayLength: 240, // real seconds per simulated 24h
  temp: -6,
  wind: 3,
  windDir: 250,
  gust: 0.4,
  haze: 0.3,
  depth: 0.1,
  aurora: 0.6,
  cloud: 0.4,
  sound: false,
  autoCam: true,
};

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emit(what = 'all') { listeners.forEach((fn) => fn(what)); }

export function rateAt(t) {
  const c = state.curve;
  const x = Math.max(0, Math.min(24, t));
  const i = Math.min(23, Math.floor(x));
  const f = x - i;
  const s = f * f * (3 - 2 * f);
  return c[i] * (1 - s) + c[i + 1] * s;
}

export function rateLabel(r) {
  if (r < 0.05) return '无雪';
  if (r < 1) return '小雪';
  if (r < 2.5) return '中雪';
  if (r < 5) return '大雪';
  return '暴雪';
}

export function fmtTime(t) {
  const m = Math.round(t * 60) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function applyPreset(key) {
  const p = PRESETS[key];
  if (!p) return;
  state.curve = [...p.curve];
  Object.assign(state, { temp: p.temp, wind: p.wind, windDir: p.windDir, gust: p.gust, haze: p.haze, time: p.time, depth: p.depth, aurora: p.aurora, cloud: p.cloud });
  emit('all');
}
