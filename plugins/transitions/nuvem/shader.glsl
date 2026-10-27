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
    p = p * 2.03 + 1.7;
    a *= 0.5;
  }
  return v;
}

vec4 transition(vec2 uv) {
  float n = fbm(uv * vec2(ratio, 1.0) * 3.0 + vec2(progress * 2.0, 0.0));
  float d = uv.x * 0.7 + n * 0.6;
  float e = progress * 1.7 - 0.25;
  float m = 1.0 - smoothstep(e - 0.12, e, d);
  float edge = (1.0 - smoothstep(e, e + 0.15, d)) * (1.0 - m);
  vec4 col = mix(getFromColor(uv), getToColor(uv), m);
  return vec4(col.rgb + vec3(edge * 0.6), 1.0);
}
