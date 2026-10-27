float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec2 hash2(vec2 p) {
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}

vec4 transition(vec2 uv) {
  vec2 cell = floor(uv * vec2(size * ratio, size));
  float thr = 0.3 + 0.55 * hash(cell);
  float lift = smoothstep(thr - 0.25, thr, progress);
  if (progress >= thr) return getToColor(uv);
  vec2 q = uv + (hash2(cell) - 0.5) * 0.03 * lift;
  return vec4(getFromColor(q).rgb + lift * 0.3, 1.0);
}
