float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

float boltX(float y, float seed) {
  float x = 0.5;
  float amp = 0.12;
  for (int i = 1; i <= 5; i++) {
    float freq = pow(2.0, float(i));
    x += (noise(vec2(y * freq, seed + float(i) * 3.1)) - 0.5) * amp;
    amp *= 0.55;
  }
  return x;
}

vec4 transition(vec2 uv) {
  float s = sin(progress * PI);
  float flash = exp(-pow((progress - 0.5) * 9.0, 2.0));
  float dist = abs(uv.x - boltX(uv.y, floor(progress * 10.0))) * ratio;
  float bolt = (0.0015 / (dist + 0.0015)) * step(0.3, progress) * step(progress, 0.7);
  vec4 col = progress < 0.5 ? getFromColor(uv) : getToColor(uv);
  return vec4(col.rgb * (1.0 - 0.4 * s) + tint * (bolt * 1.5 + flash * 0.7), 1.0);
}
