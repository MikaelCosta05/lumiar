float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec4 transition(vec2 uv) {
  float s = sin(progress * PI);
  float f = floor(progress * 40.0);
  vec2 shake = vec2(hash(vec2(f, 1.0)), hash(vec2(f, 2.0))) - 0.5;
  vec2 q = (uv - 0.5) / (1.0 + s * 0.3) + 0.5 + shake * s * 0.05 * strength;
  vec2 split = vec2(s * 0.02 * strength, 0.0);
  vec4 a = vec4(getFromColor(q + split).r, getFromColor(q).g, getFromColor(q - split).b, 1.0);
  vec4 b = vec4(getToColor(q + split).r, getToColor(q).g, getToColor(q - split).b, 1.0);
  return mix(a, b, step(0.5, progress));
}
