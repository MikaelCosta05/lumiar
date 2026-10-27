float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec4 transition(vec2 uv) {
  float s = sin(progress * PI);
  float t = floor(progress * 30.0);
  vec2 shake = (vec2(hash(vec2(t, 1.0)), hash(vec2(t, 2.0))) - 0.5) * 0.01 * s;
  vec2 q = (uv - 0.5) / (1.0 + 0.25 * s) + 0.5 + shake;
  vec3 col = (progress < 0.5 ? getFromColor(q) : getToColor(q)).rgb;
  col *= 1.0 - 0.15 * s * (0.5 + 0.5 * sin(uv.y * resolution.y * 1.5));
  vec2 a = abs(uv - 0.5);
  float hx = step(0.34, a.x) * step(a.x, 0.42) * step(0.4, a.y) * step(a.y, 0.408);
  float vy = step(0.32, a.y) * step(a.y, 0.408) * step(0.414, a.x) * step(a.x, 0.42);
  float rec = (1.0 - smoothstep(0.015, 0.02, length((uv - vec2(0.12, 0.85)) * vec2(ratio, 1.0)))) * step(0.5, fract(progress * 4.0));
  col = mix(col, vec3(1.0), max(hx, vy) * s);
  col = mix(col, vec3(1.0, 0.1, 0.1), rec * s);
  return vec4(col, 1.0);
}
