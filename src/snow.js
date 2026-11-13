import * as THREE from 'three';
import { WORLD } from './terrain.js';

const CLASSES = 4;
const FALL_MUL = [0.72, 0.9, 1.06, 1.28];
const WIND_MUL = [1.12, 1.02, 0.95, 0.86];

const VERT = /* glsl */ `
attribute vec3 aSeed; attribute vec4 aRand;
uniform vec3 uBox; uniform vec3 uCenter; uniform vec3 uOff[${CLASSES}]; uniform vec3 uVel[${CLASSES}];
uniform float uTime; uniform float uDensity; uniform float uSize; uniform float uTurb; uniform float uShutter;
uniform float uFocus; uniform float uAperture; uniform float uProj; uniform vec2 uRes; uniform float uAlpha;
uniform vec3 uAmbient; uniform vec3 uLampPos; uniform vec3 uLampCol; uniform vec3 uWinPos; uniform vec3 uWinCol; uniform vec3 uDirCol;
uniform vec3 uFogColor; uniform float uFogDensity; uniform float uGround; uniform float uRain;
uniform sampler2D uTerrain; uniform float uSnowDepth;
varying vec2 vLocal; varying float vHalf; varying float vR; varying float vSoft; varying vec4 vColor;

void main(){
  float vis = smoothstep(aRand.w, aRand.w + 0.03, uDensity);
  if (vis <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  int cls = int(floor(aRand.y * ${CLASSES}.0));
  vec3 off = uOff[cls]; vec3 vel = uVel[cls];
  vec3 lo = uCenter - 0.5 * uBox;
  vec3 local = mod(aSeed * uBox + off - lo, uBox);
  vec3 w = lo + local;
  float ph = aRand.z * 6.2831853;
  float tb = uTurb * (0.5 + aRand.x);
  vec3 sw = vec3(
    sin(w.y * 0.9 + uTime * 0.7 + ph) + 0.5 * sin(w.z * 0.45 + uTime * 1.3 + ph * 1.7),
    0.25 * sin(w.x * 0.6 + uTime * 0.9 + ph),
    cos(w.y * 0.8 + uTime * 0.6 + ph * 1.3) + 0.5 * sin(w.x * 0.5 - uTime * 1.1 + ph));
  w += sw * tb;
  if (uGround > 0.5) {
    vec4 tt = texture2D(uTerrain, w.xz / ${WORLD.toFixed(1)} + 0.5);
    float hgt = aSeed.y * aSeed.y;
    w.y = tt.r + uSnowDepth * tt.g + 0.03 + hgt * uBox.y + 0.12 * sin(w.x * 0.7 + w.z * 0.5 + uTime * 2.0 + ph) * hgt;
  }
  vec3 wPrev = w - vel * uShutter;

  vec4 mv = viewMatrix * vec4(w, 1.0);
  float depth = -mv.z;
  if (depth < 0.12) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec4 c0 = projectionMatrix * mv;
  vec4 c1 = projectionMatrix * viewMatrix * vec4(wPrev, 1.0);
  vec2 s0 = c0.xy / c0.w * 0.5 * uRes;
  vec2 s1 = (c1.w > 0.05) ? c1.xy / c1.w * 0.5 * uRes : s0;
  vec2 dpx = s1 - s0; float len = min(length(dpx), 0.35 * uRes.y);
  vec2 axis = len > 0.01 ? normalize(dpx) : vec2(0.0, 1.0);
  vec2 perp = vec2(-axis.y, axis.x);

  float diam = uSize * (0.45 + 1.4 * aRand.x * aRand.x);
  float r0 = 0.5 * diam * uProj / depth;
  float coc = min(uAperture * abs(depth - uFocus) / depth, 0.03 * uRes.y);
  float r = max(r0 + coc, 0.75);
  float a = min(1.0, (r0 * r0 + 0.03) / (r * r));
  a = pow(a, 0.8);
  float half_ = 0.5 * len;
  a *= r / (r + half_ * 0.55);
  vSoft = clamp(1.0 - coc / (r0 + coc + 0.001) * 0.6, 0.15, 0.85) * mix(1.0, 0.4, step(r, 1.2));

  vec2 corner = position.xy;
  vec2 ofs = perp * corner.x * (r + 1.0) + axis * corner.y * (r + 1.0 + half_);
  vec2 center = 0.5 * (s0 + s1);
  vec2 ndc = (center + ofs) / (0.5 * uRes);
  gl_Position = vec4(ndc * c0.w, c0.z, c0.w);
  vLocal = vec2(corner.x * (r + 1.0), corner.y * (r + 1.0 + half_));
  vHalf = half_; vR = r;

  // lighting: sky ambient + lamp + window, with forward scattering toward the camera
  vec3 toCam = normalize(cameraPosition - w);
  vec3 dl = w - uLampPos; float dl2 = dot(dl, dl);
  vec3 ldir = dl * inversesqrt(dl2 + 1e-4);
  float below = smoothstep(-0.25, 0.25, -ldir.y);
  float phL = 0.6 + 1.3 * pow(max(dot(ldir, toCam), 0.0), 8.0);
  vec3 lamp = uLampCol * (0.16 + 0.84 * below) * phL / (dl2 + 0.9);
  vec3 dw = w - uWinPos; float dw2 = dot(dw, dw);
  vec3 wdir = dw * inversesqrt(dw2 + 1e-4);
  vec3 win = uWinCol * (0.5 + 2.0 * pow(max(dot(wdir, toCam), 0.0), 5.0)) / (dw2 + 0.8);
  vec3 col = uAmbient + (lamp + win) * 0.13 + uDirCol * 0.1;
  col *= 0.82 + 0.3 * sin(uTime * (1.5 + aRand.z * 3.0) + ph * 3.0);
  col = mix(col, uAmbient * 0.75 + (lamp + win) * 0.03, uRain * 0.6);

  float fog = 1.0 - exp(-uFogDensity * uFogDensity * depth * depth);
  col = mix(col, uFogColor, fog * 0.9);
  vec3 ed = min(local, uBox - local) / uBox;
  float edge = smoothstep(0.0, 0.08, min(ed.x, ed.z)) * (uGround > 0.5 ? 1.0 : smoothstep(0.0, 0.06, ed.y));
  float nearFade = smoothstep(0.12, 0.5, depth);
  vColor = vec4(col, a * vis * edge * nearFade * uAlpha * (1.0 - fog * 0.55) * mix(1.0, 0.55, uRain));
}`;

const FRAG = /* glsl */ `
uniform float uOcclude;
varying vec2 vLocal; varying float vHalf; varying float vR; varying float vSoft; varying vec4 vColor;
void main(){
  vec2 p = vLocal; p.y -= clamp(p.y, -vHalf, vHalf);
  float d = length(p);
  float a = 1.0 - smoothstep(vR * vSoft, vR + 0.5, d);
  if (a * vColor.a < 0.003) discard;
  a *= vColor.a;
  gl_FragColor = vec4(vColor.rgb * a, a * uOcclude);
}`;

function makeLayer(count, box, opts, shared) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0]), 3));
  geo.setIndex([0, 1, 2, 2, 1, 3]);
  const seed = new Float32Array(count * 3), rand = new Float32Array(count * 4);
  for (let i = 0; i < count * 3; i++) seed[i] = Math.random();
  for (let i = 0; i < count * 4; i++) rand[i] = Math.random();
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 3));
  geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(rand, 4));
  geo.instanceCount = count;
  const uniforms = {
    uBox: { value: new THREE.Vector3(...box) }, uCenter: { value: new THREE.Vector3() },
    uOff: { value: Array.from({ length: CLASSES }, () => new THREE.Vector3()) },
    uVel: { value: Array.from({ length: CLASSES }, () => new THREE.Vector3()) },
    uDensity: { value: 0 }, uSize: { value: 0.01 }, uTurb: { value: 0.15 }, uAlpha: { value: 1 },
    uGround: { value: opts.ground ? 1 : 0 },
    ...shared,
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 5;
  return { mesh, uniforms, box: new THREE.Vector3(...box), opts };
}

export function createSnow(scene, U, quality, lampPos) {
  const shared = {
    uTime: U.uTime, uOcclude: { value: 0.5 }, uShutter: { value: 1 / 80 }, uFocus: { value: 14 }, uAperture: { value: 10 }, uProj: { value: 1000 },
    uRes: { value: new THREE.Vector2(1, 1) }, uAmbient: { value: new THREE.Color() },
    uLampPos: U.uLampPos, uLampCol: U.uLampCol, uWinPos: U.uWinPos, uWinCol: U.uWinCol, uDirCol: U.uDirCol,
    uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.01 }, uRain: { value: 0 },
    uTerrain: U.uTerrain, uSnowDepth: U.uSnowDepth,
  };
  const n = quality.flakes;
  const layers = [
    makeLayer(Math.round(n * 0.4), [84, 34, 84], { follow: 0.34, size: 1.25 }, shared),
    makeLayer(Math.round(n * 0.34), [30, 16, 30], { follow: 0.3, size: 1.0 }, shared),
    makeLayer(Math.round(n * 0.02), [9, 6, 9], { follow: 0.25, size: 0.8 }, shared),
    makeLayer(Math.round(n * 0.16), [13, 7.5, 13], { fixed: new THREE.Vector3(lampPos.x, lampPos.y - 2.6, lampPos.z), size: 1.0 }, shared),
    makeLayer(Math.round(n * 0.08), [46, 0.9, 46], { follow: 0.3, ground: true, size: 0.8 }, shared),
  ];
  layers.forEach((l) => scene.add(l.mesh));
  const fwd = new THREE.Vector3(), vel = new THREE.Vector3();

  function update(dt, p) {
    // p: { camera, wind:Vector3, fall, size, turb, density, rain, drift, ambient:Color, fogColor, fogDensity, height }
    shared.uProj.value = p.height / (2 * Math.tan(THREE.MathUtils.degToRad(p.camera.fov) / 2));
    shared.uRes.value.set(p.width, p.height);
    shared.uAperture.value = 2.6 * (p.height / 1080);
    shared.uOcclude.value = p.occlude;
    shared.uFocus.value = p.focus;
    shared.uAmbient.value.copy(p.ambient);
    shared.uFogColor.value.copy(p.fogColor); shared.uFogDensity.value = p.fogDensity;
    shared.uRain.value = p.rain;
    p.camera.getWorldDirection(fwd);
    for (const l of layers) {
      const u = l.uniforms, g = l.opts.ground;
      if (l.opts.fixed) u.uCenter.value.copy(l.opts.fixed);
      else {
        u.uCenter.value.copy(p.camera.position).addScaledVector(fwd, l.box.z * l.opts.follow);
        if (!g) u.uCenter.value.y = Math.max(u.uCenter.value.y, l.box.y * 0.5 - 1.5);
      }
      u.uDensity.value = g ? p.drift : p.density;
      u.uSize.value = p.size * l.opts.size * (g ? 0.8 : 1);
      u.uTurb.value = g ? 0.1 : p.turb;
      u.uAlpha.value = g ? 0.75 : 1;
      for (let c = 0; c < CLASSES; c++) {
        vel.set(p.wind.x * WIND_MUL[c] * (g ? 0.75 : 1), g ? 0 : -p.fall * FALL_MUL[c], p.wind.z * WIND_MUL[c] * (g ? 0.75 : 1));
        u.uVel.value[c].copy(vel);
        const o = u.uOff.value[c];
        o.addScaledVector(vel, dt);
        o.set(((o.x % l.box.x) + l.box.x) % l.box.x, ((o.y % l.box.y) + l.box.y) % l.box.y, ((o.z % l.box.z) + l.box.z) % l.box.z);
      }
    }
  }
  return { update, layers };
}
