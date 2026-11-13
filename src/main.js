import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { state, rateAt, applyPreset, PRESETS, MAX_DEPTH } from './state.js';
import { buildScene } from './scene.js';
import { createSnow } from './snow.js';
import { createPost } from './post.js';
import { createUI } from './ui.js';
import { createWind } from './audio.js';

const QUALITY = {
  low: { flakes: 36000, shadow: 1024, msaa: 0, pr: 1, aur: 10 },
  medium: { flakes: 170000, shadow: 2048, msaa: 4, pr: 1.5, aur: 18 },
  high: { flakes: 440000, shadow: 4096, msaa: 4, pr: 2, aur: 28 },
};
const params = new URLSearchParams(location.search);
const qKey = QUALITY[params.get('q')] ? params.get('q') : 'medium';
const quality = { ...QUALITY[qKey] };
// capture mode: frames are stepped by a script with a fixed dt (used to record videos)
const capture = params.has('capture');
for (const k of ['pr', 'msaa', 'flakes', 'shadow']) if (params.has(k)) quality[k] = parseFloat(params.get(k));
if (PRESETS[params.get('preset')]) applyPreset(params.get('preset'));
for (const k of ['time', 'temp', 'wind', 'depth', 'haze', 'gust', 'windDir', 'aurora', 'cloud']) if (params.has(k)) state[k] = parseFloat(params.get(k));
if (params.has('pause')) state.playing = false;
if (params.has('ui') && params.get('ui') === '0') document.body.classList.add('hide-ui');
if (params.has('rate')) state.curve = state.curve.map(() => parseFloat(params.get('rate')));

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
camera.position.set(9.8, 2.35, 15.2);
const controls = new OrbitControls(camera, canvas);
controls.target.set(-0.6, 3.3, -1.4);
Object.assign(controls, {
  enableDamping: true, dampingFactor: 0.06, minDistance: 7, maxDistance: 30, enablePan: false,
  minPolarAngle: 1.05, maxPolarAngle: 1.63, minAzimuthAngle: -0.3, maxAzimuthAngle: 1.2,
  autoRotate: true, autoRotateSpeed: 0.11, rotateSpeed: 0.5, zoomSpeed: 0.6,
});
if (params.has('az')) {
  const az = parseFloat(params.get('az')), r = 19.5;
  camera.position.set(controls.target.x + Math.sin(az) * r, 2.35, controls.target.z + Math.cos(az) * r);
}
controls.update();

// uniforms shared by ground, objects and snowflakes
const U = {
  uTime: { value: 0 }, uSnowDepth: { value: state.depth }, uSnowCover: { value: 0 }, uTerrain: { value: null }, uOcc: { value: null },
  uLampPos: { value: new THREE.Vector3() }, uLampCol: { value: new THREE.Color() },
  uWinPos: { value: new THREE.Vector3() }, uWinCol: { value: new THREE.Color() },
  uDirCol: { value: new THREE.Color() }, uWind: { value: new THREE.Vector3() }, uSkyRef: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
};

const world = buildScene(scene, U, quality);
const snow = createSnow(scene, U, quality, world.lampPos);
const post = createPost(renderer, scene, camera, quality);
const windAudio = createWind();
const ui = createUI({
  quality: qKey,
  onSound: (on) => windAudio.setEnabled(on),
  onQuality: (q) => { params.set('q', q); location.search = params.toString(); },
});

let W = 1, H = 1, PR = 1, resScale = 1;
function resize() {
  W = window.innerWidth; H = window.innerHeight; PR = Math.min(window.devicePixelRatio || 1, quality.pr) * resScale;
  renderer.setPixelRatio(PR); renderer.setSize(W, H, false);
  camera.aspect = W / H; camera.updateProjectionMatrix();
  post.resize(W, H, PR);
  viewShift = NaN;
}
// keep the scene centred in the area that the panel does not cover
let viewShift = 0, viewShiftNow = 0;
function updateViewShift(dt) {
  const open = !document.body.classList.contains('panel-closed') && !document.body.classList.contains('hide-ui') && W > 900;
  const target = open ? 190 : 0;
  viewShiftNow += (target - viewShiftNow) * (1 - Math.exp(-dt * 5));
  if (Math.abs(viewShiftNow - viewShift) < 0.5) return;
  viewShift = viewShiftNow;
  if (Math.abs(viewShift) < 0.5) camera.clearViewOffset(); else camera.setViewOffset(W, H, -viewShift, 0, W, H);
}
window.addEventListener('resize', resize);
resize();

const lerpKeys = (keys, vals, x) => {
  if (x <= keys[0]) return vals[0];
  for (let i = 1; i < keys.length; i++) if (x <= keys[i]) return vals[i - 1] + ((vals[i] - vals[i - 1]) * (x - keys[i - 1])) / (keys[i] - keys[i - 1]);
  return vals[vals.length - 1];
};
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const T_KEYS = [-25, -10, -3, 0, 1.2, 3];
const FALL = [0.55, 0.75, 1.05, 1.5, 2.8, 7.0];
const SIZE = [0.004, 0.0055, 0.0085, 0.016, 0.012, 0.006];
const TURB = [0.3, 0.26, 0.2, 0.1, 0.05, 0.01];
const RAIN = [0, 0, 0, 0, 0.45, 1];

const vis = { rate: rateAt(state.time), temp: state.temp, wind: state.wind, haze: state.haze, aurora: state.aurora, cloud: state.cloud, growth: 0, dirX: -Math.sin((state.windDir * Math.PI) / 180), dirZ: Math.cos((state.windDir * Math.PI) / 180) };
const windVec = new THREE.Vector3(), ambient = new THREE.Color();
const clock = new THREE.Clock();
let elapsed = 0, rotDir = 1;

// dynamic resolution: trade sharpness for a steady frame rate on weaker GPUs
const dynRes = params.get('dr') !== '0';
let fpsFrames = 0, fpsTime = 0, warm = 0;
function adaptResolution(dt) {
  fpsFrames++; fpsTime += dt; warm += dt;
  if (fpsTime < 1) return;
  const fps = fpsFrames / fpsTime; fpsFrames = 0; fpsTime = 0;
  if (!dynRes || warm < 3 || document.hidden) return;
  const next = fps < 27 ? Math.max(0.5, resScale * 0.85) : fps > 56 ? Math.min(1, resScale * 1.08) : resScale;
  if (next !== resScale) { resScale = next; resize(); }
}

function frame(now, fixedDt) {
  const raw = fixedDt ?? clock.getDelta(), dt = fixedDt ?? Math.min(raw, 0.05);
  if (!capture) adaptResolution(raw);
  elapsed += dt;
  U.uTime.value = elapsed;

  // simulated time, accumulation and melt
  const dtH = state.playing ? (dt * 24) / state.dayLength : 0;
  state.time = (state.time + dtH) % 24;
  const rate = rateAt(state.time);
  const snowFrac = 1 - smooth(0.3, 2.5, state.temp), depth0 = state.depth;
  state.depth += (rate / 100) * snowFrac * dtH;
  if (state.temp > 0) state.depth -= state.temp * 0.015 * dtH;
  state.depth -= state.depth * 0.03 * dtH; // settling under its own weight
  state.depth = Math.min(MAX_DEPTH, Math.max(0, state.depth));
  if (dtH > 0) vis.growth = ((state.depth - depth0) / dtH) * 100; // cm per simulated hour

  // ease the visible weather toward the targets
  const k = 1 - Math.exp(-dt * 1.6);
  vis.rate += (rate - vis.rate) * k; vis.temp += (state.temp - vis.temp) * k; vis.haze += (state.haze - vis.haze) * k;
  const g = state.gust;
  const gustF = Math.max(0.15, 1 + g * (0.55 * Math.sin(elapsed * 0.37) + 0.3 * Math.sin(elapsed * 1.13 + 1.7) + 0.25 * Math.sin(elapsed * 2.9 + 0.4)));
  vis.wind += (state.wind * gustF - vis.wind) * (1 - Math.exp(-dt * 2.5));
  const dr = THREE.MathUtils.degToRad(state.windDir + g * 14 * Math.sin(elapsed * 0.23 + 2));
  vis.dirX += (-Math.sin(dr) - vis.dirX) * k; vis.dirZ += (Math.cos(dr) - vis.dirZ) * k;
  windVec.set(vis.dirX, 0, vis.dirZ).normalize().multiplyScalar(vis.wind);
  U.uWind.value.copy(windVec);
  U.uSnowDepth.value += (state.depth - U.uSnowDepth.value) * (1 - Math.exp(-dt * 4));
  const depth = U.uSnowDepth.value;
  U.uSnowCover.value = smooth(0, 0.16, depth) * (1 - 0.3 * smooth(9, 22, vis.wind));

  // camera
  controls.autoRotate = state.autoCam;
  const az = controls.getAzimuthalAngle();
  if (az > controls.maxAzimuthAngle - 0.03) rotDir = 1; else if (az < controls.minAzimuthAngle + 0.03) rotDir = -1;
  controls.autoRotateSpeed = 0.11 * rotDir;
  controls.update();
  updateViewShift(dt);

  vis.aurora += (state.aurora - vis.aurora) * k; vis.cloud += (state.cloud - vis.cloud) * k;
  const env = world.update({
    time: state.time, rate: vis.rate, haze: vis.haze, depth, camera, windMag: vis.wind, aurora: vis.aurora, cloud: vis.cloud, dt,
    pxScale: (H * PR) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))),
  });
  renderer.toneMappingExposure = env.exposure;
  post.bloom.strength = env.bloom;
  post.film.uniforms.uTime.value = elapsed;

  const rain = lerpKeys(T_KEYS, RAIN, vis.temp);
  ambient.copy(env.ambient).multiplyScalar(env.ambI * 0.42);
  snow.update(dt, {
    camera, width: W * PR, height: H * PR, wind: windVec,
    fall: lerpKeys(T_KEYS, FALL, vis.temp), size: lerpKeys(T_KEYS, SIZE, vis.temp), turb: lerpKeys(T_KEYS, TURB, vis.temp) * (1 + vis.wind * 0.06),
    density: Math.min(1, Math.pow(Math.max(vis.rate, 0) / 6.5, 0.75)), rain,
    drift: smooth(4, 16, vis.wind) * smooth(0.01, 0.08, depth) * (1 - rain),
    ambient, occlude: 0.35 + 0.5 * env.dayF, fogColor: env.fogColor, fogDensity: env.fogD, focus: camera.position.distanceTo(world.lampPos),
  });

  windAudio.update(vis.wind);
  post.composer.render(dt);
  ui.frame(capture ? elapsed * 1000 : now, vis);
  if (!capture) requestAnimationFrame(frame);
}
if (capture) frame(0, 1 / 30); else requestAnimationFrame(frame);
window.__snow = { state, vis, renderer, camera, controls, snow, scene, world, U, step: (dt) => frame(0, dt) };
