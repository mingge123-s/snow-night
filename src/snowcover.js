import * as THREE from 'three';
import { NOISE, SPARKLE } from './glsl.js';

// Adds wind-blown snow to the up-facing parts of any standard material.
export function applySnow(material, U, { bias = 0, sway = 0 } = {}) {
  material.customProgramCacheKey = () => `snow:${bias}:${sway}`;
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uSnowCover = U.uSnowCover;
    sh.uniforms.uWind = U.uWind;
    sh.uniforms.uTime = U.uTime;
    Object.assign(sh.uniforms, { uTerrain: U.uTerrain, uOcc: U.uOcc, uSnowDepth: U.uSnowDepth });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vSnW; varying vec3 vSnN; uniform vec3 uWind; uniform float uTime;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        mat4 snM = modelMatrix;
        #ifdef USE_INSTANCING
          snM = modelMatrix * instanceMatrix;
        #endif
        vSnN = normalize(mat3(snM) * objectNormal);
        vSnW = (snM * vec4(transformed, 1.0)).xyz;
        ${sway > 0 ? `
        {
          float hh = max(transformed.y, 0.0);
          float ph = snM[3].x * 0.37 + snM[3].z * 0.53;
          float w = length(uWind);
          float bend = ${sway.toFixed(4)} * hh * hh * (w * 0.6 + w * 0.5 * sin(uTime * (1.1 + 0.05 * w) + ph) + 0.25 * w * sin(uTime * 2.7 + ph * 1.7 + hh));
          vec3 wl = normalize(vec3(uWind.x, 0.0, uWind.z) + 1e-5);
          transformed += (inverse(mat3(snM)) * wl) * bend * length(snM[0].xyz);
        }` : ''}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vSnW; varying vec3 vSnN; uniform float uSnowCover; float snC; float snOcc;
        uniform sampler2D uTerrain; uniform sampler2D uOcc; uniform float uSnowDepth;
        ${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 snN = normalize(vSnN); if (!gl_FrontFacing) snN = -snN;
          float snNoise = vnoise(vSnW * 3.5) * 0.5 + vnoise(vSnW * 13.0) * 0.5;
          float snT = max(mix(1.3, 0.12, uSnowCover) - ${bias.toFixed(3)} * uSnowCover, 0.14);
          snC = smoothstep(snT, snT + 0.28, snN.y + (snNoise - 0.5) * 0.32);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.90, 0.96), snC);
          // skylight is blocked where things meet the ground, under crowns and under the eaves
          vec2 tuv = vSnW.xz / 200.0 + 0.5; vec4 tt = texture2D(uTerrain, tuv);
          float above = vSnW.y - (tt.r + uSnowDepth * tt.g);
          snOcc = mix(0.35, 1.0, smoothstep(0.0, 0.5, above)) * mix(1.0, texture2D(uOcc, tuv).r, 0.6) * mix(0.62, 1.0, smoothstep(-0.5, 0.25, snN.y));
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.88, snC);`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= snOcc;`);
  };
  return material;
}

// Deep snow (roof slabs, caps): soft white with fine grain and crystal glints.
export function makeSnowMaterial(U) {
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.86, 0.9, 0.96), roughness: 0.85, metalness: 0 });
  mat.customProgramCacheKey = () => 'deep-snow';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uLampPos: U.uLampPos, uLampCol: U.uLampCol, uWinPos: U.uWinPos, uWinCol: U.uWinCol, uDirCol: U.uDirCol });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos;
        ${NOISE}
        ${SPARKLE}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 p = vWPos * 6.0; float c0 = vnoise(p);
          vec3 g = vec3(vnoise(p + vec3(0.35, 0.0, 0.0)) - c0, vnoise(p + vec3(0.0, 0.35, 0.0)) - c0, vnoise(p + vec3(0.0, 0.0, 0.35)) - c0);
          normal = normalize(normal - (viewMatrix * vec4(g, 0.0)).xyz * 0.4);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += snowSparkle(vWPos, 1.0);`);
  };
  return mat;
}
