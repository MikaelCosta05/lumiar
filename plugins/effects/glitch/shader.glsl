float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec4 effect(vec2 uv) {
  float t = floor(time * speed * 4.0);
  float row = floor(uv.y * bands);
  float glitched = step(1.0 - intensity * 0.6, hash(vec2(row, t)));
  float shift = (hash(vec2(t, row + 7.0)) - 0.5) * 0.2 * intensity * glitched;
  vec2 u = vec2(uv.x + shift, uv.y);

  float split = (0.02 * glitched + 0.003) * intensity;
  vec4 c = getColor(u);
  c.r = getColor(u + vec2(split, 0.0)).r;
  c.b = getColor(u - vec2(split, 0.0)).b;

  float invert = step(0.97, hash(vec2(row * 3.1, t + 1.3))) * step(0.5, intensity);
  c.rgb = mix(c.rgb, 1.0 - c.rgb, invert);
  return c;
}
