float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec4 transition(vec2 uv) {
  float s = sin(progress * PI);
  float t = floor(progress * 50.0);
  vec2 shake = (vec2(hash(vec2(t, 1.0)), hash(vec2(t, 2.0))) - 0.5) * 0.08 * s * strength;
  vec4 col = vec4(0.0);
  for (int i = 0; i < 3; i++) {
    vec2 q = uv + shake * (1.0 - float(i) * 0.45);
    col += (progress < 0.5 ? getFromColor(q) : getToColor(q)) / 3.0;
  }
  return col;
}
