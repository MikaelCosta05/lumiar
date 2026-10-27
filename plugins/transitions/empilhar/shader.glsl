vec4 transition(vec2 uv) {
  float e = 1.0 - pow(1.0 - progress, 3.0);
  if (uv.y <= e) return getToColor(vec2(uv.x, uv.y + (1.0 - e)));
  vec2 qa = (uv - 0.5) / (1.0 - 0.12 * e) + 0.5;
  vec3 a = getFromColor(qa).rgb * (1.0 - 0.5 * e);
  if (qa.x < 0.0 || qa.x > 1.0 || qa.y < 0.0 || qa.y > 1.0) a = vec3(0.0);
  float shade = 1.0 - 0.5 * (1.0 - smoothstep(0.0, 0.06, uv.y - e)) * step(0.001, e);
  return vec4(a * shade, 1.0);
}
