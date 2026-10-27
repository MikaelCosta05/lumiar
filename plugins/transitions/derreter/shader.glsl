float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec4 transition(vec2 uv) {
  float col = floor(uv.x * columns);
  float delay = hash(vec2(col, 0.0)) * 0.3;
  float p = clamp((progress - delay) / 0.7, 0.0, 1.0);
  vec2 q = vec2(uv.x, uv.y + p * p * 1.2);
  if (q.y > 1.0) return getToColor(uv);
  return getFromColor(q);
}
