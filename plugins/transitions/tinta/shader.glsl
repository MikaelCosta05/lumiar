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
  vec2 a = (uv - 0.5) * vec2(ratio, 1.0);
  float d = length(a) / length(vec2(ratio, 1.0) * 0.5) + (fbm(a * scale + 3.0) - 0.5) * 0.6;
  float e = progress * 1.75 - 0.4;
  float m = 1.0 - smoothstep(e - 0.04, e, d);
  float rim = (1.0 - smoothstep(e, e + 0.06, d)) * (1.0 - m);
  vec4 col = mix(getFromColor(uv), getToColor(uv), m);
  return vec4(col.rgb * (1.0 - 0.6 * rim), 1.0);
}
