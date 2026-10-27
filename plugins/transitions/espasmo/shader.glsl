float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec4 transition(vec2 uv) {
  float s = sin(progress * PI);
  float t = floor(progress * 24.0);
  float z = 1.0 + hash(vec2(t, 3.0)) * 0.5 * s;
  vec2 off = (vec2(hash(vec2(t, 5.0)), hash(vec2(t, 7.0))) - 0.5) * 0.1 * s;
  vec2 q = (uv - 0.5) / z + 0.5 + off;
  bool next = progress > 0.5;
  if (s > 0.25 && hash(vec2(t, 9.0)) > 0.7) next = !next;
  vec4 col = next ? getToColor(q) : getFromColor(q);
  float inv = step(0.9, hash(vec2(t, 11.0))) * step(0.2, s);
  col.rgb = mix(col.rgb, 1.0 - col.rgb, inv);
  return col;
}
