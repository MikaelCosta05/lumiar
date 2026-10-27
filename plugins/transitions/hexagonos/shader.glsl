vec2 hexCenter(vec2 p) {
  vec2 r = vec2(1.0, 1.7320508);
  vec2 h = r * 0.5;
  vec2 a = mod(p, r) - h;
  vec2 b = mod(p - h, r) - h;
  return dot(a, a) < dot(b, b) ? p - a : p - b;
}

vec4 transition(vec2 uv) {
  float s = min(progress, 1.0 - progress) * 2.0;
  vec2 q = uv;
  if (s > 0.001) {
    float n = cells / s;
    vec2 aspect = vec2(ratio, 1.0);
    q = hexCenter(uv * aspect * n) / n / aspect;
  }
  return mix(getFromColor(q), getToColor(q), progress);
}
