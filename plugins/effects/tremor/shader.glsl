float noise1(float x) {
  return fract(sin(x * 91.17) * 43758.5453) * 2.0 - 1.0;
}

float smoothNoise(float x) {
  float i = floor(x);
  float f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(noise1(i), noise1(i + 1.0), f);
}

vec4 effect(vec2 uv) {
  float t = time * speed;
  vec2 offset = vec2(smoothNoise(t), smoothNoise(t + 17.3)) * 0.03 * intensity;
  float angle = smoothNoise(t + 41.7) * 0.06 * intensity * rotation;
  float zoom = 1.0 + 0.08 * intensity; // aproxima para esconder as bordas

  vec2 p = (uv - 0.5) * vec2(ratio, 1.0);
  p = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * p;
  p = p / zoom / vec2(ratio, 1.0) + 0.5 + offset;
  return getColor(p);
}
