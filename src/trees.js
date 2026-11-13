import * as THREE from 'three';
import { NOISE } from './glsl.js';
import { terrainHeight } from './terrain.js';

// One spruce bough seen from above: a twig with side shoots, all covered in needles.
// RGB = colour, A = needle coverage. Row 0 is the base of the bough, the last row its tip.
function boughTexture(rng) {
  const W = 256, H = 512;
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const colC = mk(), mskC = mk(), g = colC.getContext('2d'), m = mskC.getContext('2d');
  g.fillStyle = '#16261a'; g.fillRect(0, 0, W, H);
  m.fillStyle = '#000'; m.fillRect(0, 0, W, H);
  g.lineCap = m.lineCap = 'round';
  const line = (x0, y0, x1, y1, w, color) => {
    for (const [c, style] of [[g, color], [m, '#fff']]) {
      c.strokeStyle = style; c.lineWidth = w; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    }
  };
  const green = () => {
    const k = rng(), b = rng();
    const r = 18 + 34 * k, gg = 36 + 50 * k + 10 * b, bb = 24 + 26 * k + 22 * b;
    return `rgb(${r | 0},${gg | 0},${bb | 0})`;
  };
  // needles along a shoot from (x0,y0) heading (dx,dy) for len px
  const shoot = (x0, y0, dx, dy, len, nl, depth) => {
    const steps = Math.max(2, Math.round(len / 2.1));
    for (let s = 0; s <= steps; s++) {
      const u = s / steps, x = x0 + dx * len * u, y = y0 + dy * len * u;
      const l = nl * (1 - 0.45 * u) * (0.75 + 0.5 * rng());
      for (const side of [-1, 1]) {
        const a = side * (0.62 + 0.3 * rng()), ca = Math.cos(a), sa = Math.sin(a);
        line(x, y, x + (dx * ca - dy * sa) * l, y + (dx * sa + dy * ca) * l, 1.5, green());
      }
      if (depth > 0 && s > 1 && s % 5 === 0 && u < 0.85) {
        for (const side of [-1, 1]) {
          const a = side * (0.75 + 0.25 * rng()), ca = Math.cos(a), sa = Math.sin(a);
          shoot(x, y, dx * ca - dy * sa, dx * sa + dy * ca, len * (1 - u) * 0.42, nl * 0.85, depth - 1);
        }
      }
    }
    line(x0, y0, x0 + dx * len, y0 + dy * len, depth > 0 ? 2.2 : 1.2, '#2a1c12');
  };
  const cx = W / 2, top = 0.965 * H;
  for (let y = 6; y < top - 14; y += 10 + rng() * 5) {
    const t = y / H;
    const prof = t < 0.28 ? 0.5 + 0.5 * (t / 0.28) : Math.pow(1 - (t - 0.28) / 0.72, 0.8);
    const len = 0.46 * W * prof * (0.82 + 0.3 * rng());
    for (const side of [-1, 1]) {
      const a = (0.86 + 0.2 * rng()) * side;
      shoot(cx, y + rng() * 5, Math.sin(a), Math.cos(a), len, 8.5, 1);
    }
  }
  shoot(cx, 0, 0, 1, top, 9, 0);
  line(cx, 0, cx, top * 0.9, 5, '#2a1c12');

  const col = g.getImageData(0, 0, W, H).data, msk = m.getImageData(0, 0, W, H).data;
  const data = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    data[i * 4] = col[i * 4]; data[i * 4 + 1] = col[i * 4 + 1]; data[i * 4 + 2] = col[i * 4 + 2]; data[i * 4 + 3] = msk[i * 4];
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8; tex.needsUpdate = true;
  return tex;
}

// Unit-height spruce built from textured bough cards. aux = (snow catch, baked occlusion, trunk flag).
function pineGeometry(rng, whorls, segs, curtains) {
  const pos = [], nor = [], uv = [], aux = [], idx = [];
  const V = (x, y, z, nx, ny, nz, u, v, sw, ao, trunk = 0) => {
    const l = Math.hypot(nx, ny, nz) || 1;
    pos.push(x, y, z); nor.push(nx / l, ny / l, nz / l); uv.push(u, v); aux.push(sw, ao, trunk);
    return pos.length / 3 - 1;
  };
  const quad = (a, b, c, d) => idx.push(a, b, c, b, d, c);
  for (let i = 0; i < whorls; i++) {
    const t = i / (whorls - 1);
    const y = 0.1 + 0.87 * Math.pow(t, 0.95);
    const reach = 0.29 * Math.pow(1 - t, 0.85) + 0.014;
    const n = Math.round(8 - 3 * t), a0 = rng() * 6.283;
    for (let j = 0; j < n; j++) {
      const a = a0 + ((j + (rng() - 0.5) * 0.6) / n) * 6.283, ca = Math.cos(a), sa = Math.sin(a);
      const L = reach * (0.8 + 0.42 * rng());
      const droop = (0.62 - 0.55 * t) * (0.75 + 0.5 * rng()), rise = 0.1 + 0.4 * t;
      const w = Math.min(L * 0.52, 0.1) * (0.85 + 0.3 * rng());
      const yb = y + (rng() - 0.5) * 0.025, low = 0.72 + 0.28 * t;
      const spine = (u) => [ca * L * u, yb + L * (rise * u - droop * u * u), sa * L * u];
      let prev = null;
      for (let k = 0; k <= segs; k++) {
        const u = k / segs, [sx, sy, sz] = spine(u), ao = (0.42 + 0.58 * u) * low;
        const cur = [
          V(sx - sa * w, sy - 0.16 * w, sz + ca * w, 0.5 * ca - 0.5 * sa, 0.8, 0.5 * sa + 0.5 * ca, 0, u, 0.6 - 0.35 * u, ao),
          V(sx, sy + 0.1 * w, sz, 0.5 * ca, 0.85, 0.5 * sa, 0.5, u, 1.0 - 0.4 * u, ao),
          V(sx + sa * w, sy - 0.16 * w, sz - ca * w, 0.5 * ca + 0.5 * sa, 0.8, 0.5 * sa - 0.5 * ca, 1, u, 0.6 - 0.35 * u, ao),
        ];
        if (prev) { quad(prev[0], prev[1], cur[0], cur[1]); quad(prev[1], prev[2], cur[1], cur[2]); }
        prev = cur;
      }
      if (!curtains) continue;
      // hanging shoots under the bough
      const cs = Math.max(2, segs >> 1), hang = Math.min(0.4 * L, 0.075) * (0.8 + 0.4 * rng());
      const rep = Math.max(2, Math.min(7, Math.round(L / (hang * 0.55)))), tilt = rng() < 0.5 ? -0.3 : 0.3, u0 = rng();
      prev = null;
      for (let k = 0; k <= cs; k++) {
        const u = 0.12 + 0.88 * (k / cs), [sx, sy, sz] = spine(u);
        const h = hang * (0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, u * 1.05))), ao = (0.36 + 0.5 * u) * low;
        const nx = 0.8 * ca - tilt * sa, nz = 0.8 * sa + tilt * ca;
        const cur = [
          V(sx, sy + 0.02 * w, sz, nx, 0.45, nz, u0 + u * rep, 0, 0.5, ao),
          V(sx + ca * h * 0.18 - sa * tilt * h, sy - h, sz + sa * h * 0.18 + ca * tilt * h, nx, 0.1, nz, u0 + u * rep, 1, 0.0, ao * 0.85),
        ];
        if (prev) quad(prev[0], prev[1], cur[0], cur[1]);
        prev = cur;
      }
    }
  }
  const tr = new THREE.CylinderGeometry(0.004, 0.026, 1.0, 7, 1, true);
  tr.translate(0, 0.5, 0);
  const tp = tr.attributes.position, tn = tr.attributes.normal, base = pos.length / 3;
  for (let i = 0; i < tp.count; i++) V(tp.getX(i), tp.getY(i), tp.getZ(i), tn.getX(i), tn.getY(i), tn.getZ(i), 0.5, 0.02, 0, 0.6, 1);
  for (let i = 0; i < tr.index.count; i++) idx.push(base + tr.index.getX(i));

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aux', new THREE.Float32BufferAttribute(aux, 3));
  geo.setIndex(idx);
  return geo;
}

function pineMaterial(U, tex, quality) {
  const mat = new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.78, side: THREE.DoubleSide, shadowSide: THREE.DoubleSide,
    alphaTest: 0.38, alphaToCoverage: quality.msaa > 0,
  });
  mat.customProgramCacheKey = () => 'pine';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uSnowCover: U.uSnowCover, uWind: U.uWind, uTime: U.uTime, uSunDir: U.uSunDir, uDirCol: U.uDirCol });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 aux; varying vec3 vAux; varying vec3 vSnW; uniform vec3 uWind; uniform float uTime;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vAux = aux;
        mat4 snM = modelMatrix * instanceMatrix;
        {
          float hh = max(transformed.y, 0.0), ph = snM[3].x * 0.37 + snM[3].z * 0.53, w = length(uWind);
          float bend = 0.003 * hh * hh * (w * 0.6 + w * 0.5 * sin(uTime * (1.1 + 0.05 * w) + ph) + 0.25 * w * sin(uTime * 2.7 + ph * 1.7 + hh));
          // boughs also flutter on their own
          float r = length(transformed.xz);
          transformed.y += r * 0.012 * min(w, 14.0) * sin(uTime * 2.3 + ph * 3.0 + hh * 40.0 + r * 9.0) * (1.0 - aux.z);
          vec3 wl = normalize(vec3(uWind.x, 0.0, uWind.z) + 1e-5);
          transformed += (inverse(mat3(snM)) * wl) * bend * length(snM[0].xyz);
        }
        vSnW = (snM * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vAux; varying vec3 vSnW; uniform float uSnowCover; uniform vec3 uSunDir; uniform vec3 uDirCol; float snC; vec3 pineAlb;
        ${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float trunk = step(0.5, vAux.z);
          float soft = texture2D(map, vMapUv, 3.5).a;
          // nothing here: neither needles nor a snow pillow
          if (trunk < 0.5 && diffuseColor.a < 0.3 && soft < 0.1) discard;
          float wn = vnoise(vSnW * 0.3), fine = vnoise(vSnW * 6.0);
          vec3 needles = diffuseColor.rgb * mix(vec3(0.62, 0.8, 0.78), vec3(1.2, 1.12, 0.78), wn) * (0.8 + 0.4 * fine);
          vec3 bark = vec3(0.05, 0.036, 0.027) * (0.6 + 0.8 * fine);
          pineAlb = mix(needles, bark, trunk);
          vec3 base = pineAlb * vAux.y;
          // snow pillows follow the bough's outline, thickest along the twig
          float snN = vnoise(vSnW * 1.9) * 0.5 + fine * 0.3 + vnoise(vSnW * 23.0) * 0.2;
          float snT = mix(1.3, 0.2, uSnowCover);
          snC = smoothstep(snT, snT + 0.2, vAux.x + (snN - 0.5) * 0.55) * smoothstep(0.1, 0.34, soft) * (1.0 - trunk);
          diffuseColor.rgb = mix(base, vec3(0.86, 0.90, 0.96) * (0.9 + 0.1 * fine) * mix(1.0, vAux.y, 0.45), snC);
          diffuseColor.a = max(mix(diffuseColor.a, 1.0, trunk), snC * 1.4);
          // keep far crowns full: mip levels thin the needles out
          diffuseColor.a *= 1.0 + 0.8 * smoothstep(20.0, 90.0, vViewPosition.z);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.9, snC);`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        // bough cards share one soft "volume" normal on both faces
        normal = normalize(vNormal);
        if (snC > 0.02) {
          // lumpy snow load
          vec3 p = vSnW * 4.5; float c0 = vnoise(p);
          vec3 g = vec3(vnoise(p + vec3(0.3, 0.0, 0.0)) - c0, vnoise(p + vec3(0.0, 0.3, 0.0)) - c0, vnoise(p + vec3(0.0, 0.0, 0.3)) - c0);
          vec3 up = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
          normal = normalize(mix(normal, up, snC * 0.5) - (viewMatrix * vec4(g, 0.0)).xyz * 1.1 * snC);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          // low sun shining through the needles
          vec3 sv = (viewMatrix * vec4(uSunDir, 0.0)).xyz;
          float back = pow(max(dot(normalize(-vViewPosition), sv), 0.0), 6.0);
          totalEmissiveRadiance += pineAlb * uDirCol * back * 0.5 * vAux.y * (1.0 - snC);
        }`);
  };
  return mat;
}

export function addTrees({ root, trees, U, rng, quality }) {
  const tex = boughTexture(rng);
  const mat = pineMaterial(U, tex, quality);
  const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.38, side: THREE.DoubleSide });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3(), sc = new THREE.Vector3();
  const isNear = (t) => Math.hypot(t.x, t.z) < 42;
  const groups = [
    { list: trees.filter(isNear), geos: [0, 1, 2, 3].map(() => pineGeometry(rng, 27, 6, true)) },
    { list: trees.filter((t) => !isNear(t)), geos: [0, 1, 2].map(() => pineGeometry(rng, 13, 3, false)) },
  ];
  for (const g of groups) g.geos.forEach((geo, vi) => {
    const list = g.list.filter((_, i) => i % g.geos.length === vi);
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((t, i) => {
      e.set((rng() - 0.5) * 0.06, rng() * 6.28, (rng() - 0.5) * 0.06);
      q.setFromEuler(e);
      v3.set(t.x, terrainHeight(t.x, t.z) - 0.15, t.z);
      sc.set(t.s * (0.9 + rng() * 0.25), t.s, t.s * (0.9 + rng() * 0.25));
      im.setMatrixAt(i, m4.compose(v3, q, sc));
    });
    im.customDepthMaterial = depthMat;
    im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
    root.add(im);
  });
}
