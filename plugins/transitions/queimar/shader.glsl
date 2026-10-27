float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

vec4 transition(vec2 uv) {
  float n = fbm(uv * vec2(ratio, 1.0) * scale);
  float p = progress * (1.0 + 2.0 * edge) - edge;
  float m = 1.0 - smoothstep(p - 0.01, p + 0.01, n);
  float band = (1.0 - smoothstep(p, p + edge, n)) * (1.0 - m);
  vec4 col = mix(getFromColor(uv), getToColor(uv), m);
  col.rgb += tint * band * 1.5;
  return col;
}
