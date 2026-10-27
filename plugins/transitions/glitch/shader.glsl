float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

vec4 rgbFrom(vec2 u, float split) {
  return vec4(getFromColor(u + vec2(split, 0.0)).r, getFromColor(u).g, getFromColor(u - vec2(split, 0.0)).b, 1.0);
}

vec4 rgbTo(vec2 u, float split) {
  return vec4(getToColor(u + vec2(split, 0.0)).r, getToColor(u).g, getToColor(u - vec2(split, 0.0)).b, 1.0);
}

vec4 transition(vec2 uv) {
  float s = sin(progress * PI); // mais forte no meio
  float t = floor(progress * 30.0);
  float row = floor(uv.y * 20.0);
  float shift = (hash(vec2(row, t)) - 0.5) * 0.3 * s * intensity * step(0.5, hash(vec2(t, row)));
  vec2 u = vec2(fract(uv.x + shift), uv.y);
  float split = 0.03 * s * intensity;
  // Cada faixa troca de clipe num momento um pouco diferente.
  float m = step(0.5, progress + (hash(vec2(row, t + 3.0)) - 0.5) * s);
  return mix(rgbFrom(u, split), rgbTo(u, split), m);
}
