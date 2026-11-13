import * as THREE from 'three';
import { NOISE, SPARKLE } from './glsl.js';

export const WORLD = 200;
const TEX = 1024;

export const CABIN = { x: -4.2, z: -5.2, w: 6.2, d: 4.6, rot: 0.2 };
export const LAMP = { x: 3.4, z: 2.4, h: 4.1 };

export function cabinToWorld(lx, lz) {
  const c = Math.cos(CABIN.rot), s = Math.sin(CABIN.rot);
  return [CABIN.x + lx * c + lz * s, CABIN.z - lx * s + lz * c];
}
export const DOOR_LOCAL = [1.35, CABIN.d / 2];
const door = cabinToWorld(DOOR_LOCAL[0], DOOR_LOCAL[1] + 0.6);
export const PATH = [[7.5, 20], [5.6, 11], [2.4, 3.6], [door[0] + 0.8, door[1] + 2.2], door];

function hash2(ix, iz) {
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise2(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  let fx = x - ix, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
export function fbm2(x, z, oct = 4) {
  let v = 0, a = 0.5, n = 0;
  for (let i = 0; i < oct; i++) { v += a * vnoise2(x, z); n += a; x = x * 2.03 + 17.1; z = z * 2.03 - 9.7; a *= 0.5; }
  return v / n;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function pathDist(x, z) {
  let best = 1e9;
  for (let i = 0; i < PATH.length - 1; i++) {
    const [ax, az] = PATH[i], [bx, bz] = PATH[i + 1];
    const dx = bx - ax, dz = bz - az;
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

export const POND = { x: 7.6, z: 2.6, rx: 2.7, rz: 2.0 };
function pondR(x, z) {
  const dx = (x - POND.x) / POND.rx, dz = (z - POND.z) / POND.rz, a = Math.atan2(dz, dx);
  return Math.hypot(dx, dz) / (1 + 0.12 * Math.sin(a * 3 + 1) + 0.06 * Math.sin(a * 5 + 2.2));
}
export const pondMask = (x, z) => 1 - smooth(0.8, 1.02, pondR(x, z));
let pondLevel = null;

export function terrainHeight(x, z) {
  if (pondLevel === null) { pondLevel = 0; pondLevel = baseHeight(POND.x, POND.z) - 0.22; }
  const h = baseHeight(x, z), r = pondR(x, z);
  if (r > 1.9) return h;
  return h + (pondLevel - h) * (1 - smooth(0.85, 1.9, r)) - 0.05 * (1 - smooth(0.7, 1.0, r));
}

function baseHeight(x, z) {
  const r = Math.hypot(x, z);
  let h = (fbm2(x * 0.035, z * 0.035) - 0.5) * 2.4 + (fbm2(x * 0.13 + 40, z * 0.13) - 0.5) * 0.45;
  const dc = Math.hypot(x - CABIN.x, z - CABIN.z);
  const flat = Math.max(1 - smooth(5, 12, dc), 1 - smooth(1.2, 5, pathDist(x, z)), 1 - smooth(2, 7, Math.hypot(x - LAMP.x, z - LAMP.z)));
  h *= 1 - flat * 0.93;
  h += smooth(48, 100, r) * (2 + 9 * fbm2(x * 0.012 + 7, z * 0.012 + 3));
  return h;
}

function cabinDist(x, z) {
  const c = Math.cos(CABIN.rot), s = Math.sin(CABIN.rot);
  const dx = x - CABIN.x, dz = z - CABIN.z;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  const qx = Math.abs(lx) - CABIN.w / 2, qz = Math.abs(lz) - CABIN.d / 2;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
}

// How much of the nominal snow depth settles at a spot (drifts, trodden path, sheltered walls, wind-swept ice).
export function snowGain(x, z) {
  const pd = pathDist(x, z);
  let g = 1 + 0.5 * (fbm2(x * 0.22 + 90, z * 0.22 - 30, 3) - 0.5) + 0.12 * (fbm2(x * 1.1, z * 1.1, 2) - 0.5);
  g *= 0.42 + 0.58 * smooth(0.3, 1.0, pd);
  g += 0.22 * Math.exp(-(((pd - 1.25) / 0.4) ** 2));
  g *= 0.35 + 0.65 * smooth(-0.1, 0.9, cabinDist(x, z));
  const pm = pondMask(x, z);
  return g * (1 - 0.55 * pm) + 0.18 * Math.exp(-(((pondR(x, z) - 1.25) / 0.2) ** 2));
}

export function createTerrainTexture(trees) {
  const data = new Float32Array(TEX * TEX * 4);
  for (let j = 0; j < TEX; j++) {
    const z = ((j + 0.5) / TEX - 0.5) * WORLD;
    for (let i = 0; i < TEX; i++) {
      const x = ((i + 0.5) / TEX - 0.5) * WORLD;
      const o = (j * TEX + i) * 4;
      data[o] = terrainHeight(x, z);
      data[o + 1] = snowGain(x, z);
      data[o + 2] = 1 - smooth(0.35, 1.0, pathDist(x, z));
      data[o + 3] = pondMask(x, z);
    }
  }
  for (const t of trees) {
    const rad = 0.22 * t.s + 1.0;
    const ci = (t.x / WORLD + 0.5) * TEX, cj = (t.z / WORLD + 0.5) * TEX, rr = Math.ceil((rad / WORLD) * TEX) + 1;
    for (let j = Math.max(0, Math.floor(cj - rr)); j <= Math.min(TEX - 1, cj + rr); j++) {
      for (let i = Math.max(0, Math.floor(ci - rr)); i <= Math.min(TEX - 1, ci + rr); i++) {
        const x = ((i + 0.5) / TEX - 0.5) * WORLD, z = ((j + 0.5) / TEX - 0.5) * WORLD;
        data[(j * TEX + i) * 4 + 1] *= 0.5 + 0.5 * smooth(0.25, rad, Math.hypot(x - t.x, z - t.z));
      }
    }
  }
  const half = new Uint16Array(data.length);
  for (let i = 0; i < data.length; i++) half[i] = THREE.DataUtils.toHalfFloat(data[i]);
  const tex = new THREE.DataTexture(half, TEX, TEX, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

// How much open sky the ground sees: darker under crowns and beside the cabin walls.
export function createOcclusionTexture(trees) {
  const N = 1024, data = new Uint8Array(N * N).fill(255);
  const stamp = (cx, cz, rad, fn) => {
    const ci = (cx / WORLD + 0.5) * N, cj = (cz / WORLD + 0.5) * N, rr = Math.ceil((rad / WORLD) * N) + 1;
    for (let j = Math.max(0, Math.floor(cj - rr)); j <= Math.min(N - 1, cj + rr); j++) {
      for (let i = Math.max(0, Math.floor(ci - rr)); i <= Math.min(N - 1, ci + rr); i++) {
        const x = ((i + 0.5) / N - 0.5) * WORLD, z = ((j + 0.5) / N - 0.5) * WORLD;
        data[j * N + i] *= fn(x, z);
      }
    }
  };
  for (const t of trees) {
    const rad = 0.42 * t.s;
    stamp(t.x, t.z, rad, (x, z) => 0.3 + 0.7 * smooth(0.12 * rad, rad, Math.hypot(x - t.x, z - t.z)));
  }
  stamp(CABIN.x, CABIN.z, 7, (x, z) => 0.38 + 0.62 * smooth(-0.1, 1.7, cabinDist(x, z)));
  stamp(LAMP.x, LAMP.z, 0.6, (x, z) => 0.55 + 0.45 * smooth(0.08, 0.5, Math.hypot(x - LAMP.x, z - LAMP.z)));
  const tex = new THREE.DataTexture(data, N, N, THREE.RedFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export function createGround(U) {
  const N = 260;
  const pos = new Float32Array((N + 1) * (N + 1) * 3);
  const nor = new Float32Array((N + 1) * (N + 1) * 3);
  const warp = (u) => Math.sign(u) * (0.22 * Math.abs(u) + 0.78 * Math.abs(u) ** 3) * (WORLD / 2);
  let k = 0;
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    pos[k] = warp((i / N) * 2 - 1); pos[k + 1] = 0; pos[k + 2] = warp((j / N) * 2 - 1);
    nor[k + 1] = 1; k += 3;
  }
  const idx = new Uint32Array(N * N * 6);
  k = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
    idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), WORLD);

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      uTerrain: U.uTerrain, uSnowDepth: U.uSnowDepth, uLampPos: U.uLampPos, uLampCol: U.uLampCol,
      uWinPos: U.uWinPos, uWinCol: U.uWinCol, uDirCol: U.uDirCol, uSkyRef: U.uSkyRef, uOcc: U.uOcc,
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uTerrain; uniform float uSnowDepth; varying vec3 vWPos;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 tt = texture2D(uTerrain, position.xz / ${WORLD.toFixed(1)} + 0.5);
        transformed.y = tt.r + uSnowDepth * tt.g;
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uTerrain; uniform float uSnowDepth; varying vec3 vWPos;
        ${NOISE}
        ${SPARKLE}
        float gCover; float gIce; float gOcc; vec2 gStep; float gPit; uniform vec3 uSkyRef; uniform sampler2D uOcc;
        float terrH(vec2 uv){ vec4 t = texture2D(uTerrain, uv); return t.r + uSnowDepth * t.g; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 tuv = vWPos.xz / ${WORLD.toFixed(1)} + 0.5;
        vec4 tt = texture2D(uTerrain, tuv);
        float sd = uSnowDepth * tt.g;
        float n1 = vnoise(vWPos * 1.3), n2 = vnoise(vWPos * 7.0), n3 = vnoise(vWPos * 31.0);
        float iceM = smoothstep(0.42, 0.58, tt.a + (n2 - 0.5) * 0.12);
        float scour = vnoise(vWPos * vec3(0.55, 0.55, 1.1) + 7.0) * 0.7 + n1 * 0.3;
        gCover = smoothstep(0.0, 0.03, sd - (n1 * 0.5 + n2 * 0.35 + n3 * 0.15) * 0.035 - iceM * (0.02 + scour * 0.26));
        gIce = iceM * (1.0 - gCover);
        vec3 bare = mix(vec3(0.030, 0.028, 0.022), vec3(0.070, 0.075, 0.040), n1 * 0.6 + n3 * 0.4);
        bare = mix(bare, vec3(0.050, 0.043, 0.036) * (0.6 + 0.8 * n3), tt.b);
        gOcc = texture2D(uOcc, tuv).r;
        {
          // trodden path: overlapping boot prints pressed into the snow
          vec2 fp = vWPos.xz * 3.1; vec2 fc = floor(fp); vec2 bd = vec2(9.0); float bl = 9.0;
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 cc = fc + vec2(float(i), float(j));
            vec2 d = cc + 0.2 + 0.6 * vec2(hash13(vec3(cc, 5.0)), hash13(vec3(cc, 11.0))) - fp;
            d.x *= 1.0 + 0.9 * hash13(vec3(cc, 2.0));
            float l = length(d); if (l < bl) { bl = l; bd = d; }
          }
          float on = smoothstep(0.35, 0.75, tt.b) * smoothstep(0.03, 0.12, sd);
          gPit = (1.0 - smoothstep(0.2, 0.32, bl)) * on;
          gStep = normalize(bd + 1e-5) * smoothstep(0.16, 0.26, bl) * (1.0 - smoothstep(0.26, 0.4, bl)) * on;
        }
        vec3 snowCol = vec3(0.86, 0.90, 0.96) * (0.94 + 0.06 * n2) * (1.0 - 0.14 * gPit);
        {
          // frozen pond: dark ice, trapped bubbles and hairline cracks
          vec2 ip = vWPos.xz * 1.7; vec2 ic = floor(ip); float best = 9.0, second = 9.0;
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 cc = ic + vec2(float(i), float(j));
            vec2 pt = cc + vec2(hash13(vec3(cc, 3.0)), hash13(vec3(cc, 9.0)));
            float dd = length(ip - pt);
            if (dd < best) { second = best; best = dd; } else if (dd < second) second = dd;
          }
          float crack = 1.0 - smoothstep(0.0, 0.035, second - best);
          vec3 ice = mix(vec3(0.012, 0.035, 0.05), vec3(0.05, 0.11, 0.14), n1 * 0.6 + 0.4 * vnoise(vWPos * 3.0));
          ice += vec3(0.25, 0.3, 0.33) * (crack * 0.55 + smoothstep(0.72, 0.8, n3) * 0.25 + smoothstep(0.5, 0.9, n2) * 0.12);
          bare = mix(bare, ice, iceM);
        }
        diffuseColor.rgb = mix(bare, snowCol, gCover);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(mix(0.97, 0.16 + 0.2 * n2, iceM), 0.82, gCover);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float e = 1.0 / ${TEX.toFixed(1)}; float we = ${(WORLD / TEX).toFixed(6)};
          float hL = terrH(tuv - vec2(e, 0.0)), hR = terrH(tuv + vec2(e, 0.0));
          float hD = terrH(tuv - vec2(0.0, e)), hU = terrH(tuv + vec2(0.0, e));
          vec3 nW = normalize(vec3(hL - hR, 2.0 * we, hD - hU));
          vec3 p = vWPos * vec3(5.0, 5.0, 5.0);
          float c0 = vnoise(p);
          vec2 g = vec2(vnoise(p + vec3(0.35, 0.0, 0.0)) - c0, vnoise(p + vec3(0.0, 0.0, 0.35)) - c0);
          vec3 p2 = vWPos * 23.0; float c1 = vnoise(p2);
          g += 0.5 * vec2(vnoise(p2 + vec3(0.35, 0.0, 0.0)) - c1, vnoise(p2 + vec3(0.0, 0.0, 0.35)) - c1);
          // soft wind-packed lumps a hand's width to a stride across
          vec3 p3 = vWPos * 1.1; float c3 = vnoise(p3);
          vec2 g3 = vec2(vnoise(p3 + vec3(0.3, 0.0, 0.0)) - c3, vnoise(p3 + vec3(0.0, 0.0, 0.3)) - c3);
          nW = normalize(nW - vec3(g.x, 0.0, g.y) * mix(mix(0.9, 0.05, gIce), 0.42, gCover) - vec3(g3.x, 0.0, g3.y) * 0.55 * gCover
            + vec3(gStep.x, 0.0, gStep.y) * 0.7 * gCover);
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        }`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= gOcc;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += snowSparkle(vWPos, gCover);
        {
          // powder scatters skylight back at grazing angles
          float rim = pow(1.0 - max(dot(normalize(vViewPosition), normal), 0.0), 4.0);
          totalEmissiveRadiance += uSkyRef * gCover * rim * 0.16 * gOcc;
        }
        {
          // the ice mirrors the sky: brighter at grazing angles
          float fr = pow(1.0 - max(dot(normalize(vViewPosition), normal), 0.0), 3.0);
          totalEmissiveRadiance += uSkyRef * gIce * (0.06 + 0.94 * fr);
        }`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}
