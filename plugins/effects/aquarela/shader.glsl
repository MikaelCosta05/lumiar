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
  vec2 a = uv * vec2(ratio, 1.0);
  vec2 w = vec2(fbm(a * 6.0), fbm(a * 6.0 + 5.2)) - 0.5;
  vec3 c = getColor(uv + w * 0.02 * bleed).rgb;
  c = floor(c * 6.0 + 0.5) / 6.0;
  c = mix(c, vec3(1.0), 0.15);
  float paper = fbm(a * 80.0);
  float stain = fbm(a * 3.0 + 9.0);
  c *= 0.88 + 0.12 * paper;
  c = mix(c, c * c, 0.25 * stain);
  return vec4(c, 1.0);
}
