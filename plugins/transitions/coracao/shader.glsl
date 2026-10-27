vec4 transition(vec2 uv) {
  vec2 p = (uv - 0.5) * vec2(ratio, 1.0);
  vec2 q = p / max(progress * 2.6, 0.0001);
  q.y += 0.15;
  q *= vec2(1.0, 1.1);
  float a = q.x * q.x + q.y * q.y - 1.0;
  float shape = a * a * a - q.x * q.x * q.y * q.y * q.y;
  float m = (1.0 - smoothstep(-0.01, 0.01, shape)) * step(0.001, progress);
  return mix(getFromColor(uv), getToColor(uv), m);
}
