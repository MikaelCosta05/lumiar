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

vec4 effect(vec2 uv) {
  vec2 q = uv * vec2(ratio, 1.0) * 7.0 + vec2(0.0, -time * speed * 2.0);
  vec2 d = vec2(fbm(q), fbm(q + 3.7)) - 0.5;
  float mask = mix(1.0, 1.0 - uv.y, bottom);
  return getColor(uv + d * amount * 0.025 * mask);
}
