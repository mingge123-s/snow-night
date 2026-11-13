export const NOISE = /* glsl */ `
float hash13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y),
    f.z);
}
`;

// Twinkling ice-crystal glints, driven by the local light level.
export const SPARKLE = /* glsl */ `
uniform vec3 uLampPos; uniform vec3 uLampCol; uniform vec3 uWinPos; uniform vec3 uWinCol; uniform vec3 uDirCol;
vec3 snowSparkle(vec3 wp, float cover){
  vec3 q = wp * 70.0;
  float fw = max(fwidth(q.x), fwidth(q.z));
  float fade = 1.0 - smoothstep(0.5, 1.6, fw);
  if (fade <= 0.0 || cover <= 0.0) return vec3(0.0);
  vec3 cell = floor(q);
  float h = hash13(cell);
  vec3 v = normalize(cameraPosition - wp);
  float tw = hash13(cell + floor(dot(v, vec3(37.0, 17.0, 29.0)) * 9.0));
  float s = step(0.988, h) * smoothstep(0.55, 1.0, tw);
  vec3 dl = uLampPos - wp; vec3 dw = uWinPos - wp;
  vec3 light = uLampCol / (dot(dl, dl) + 2.0) + uWinCol / (dot(dw, dw) + 2.0) + uDirCol * 0.6;
  return light * s * fade * cover * 1.6;
}
`;
