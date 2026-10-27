float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec4 effect(vec2 uv) {
  float k = resolution.y / 720.0;
  vec2 grid = floor(resolution / (size * k));
  vec2 id = floor(uv * grid);
  float colRand = hash(vec2(id.x, 3.1));
  float head = fract(-time * speed * (0.15 + 0.25 * colRand) + colRand * 5.0);
  float d = fract(uv.y - head);
  float trail = exp(-d * 7.0);
  vec2 f = fract(uv * grid);
  vec2 sub = floor(f * vec2(3.0, 4.0));
  float glyph = step(0.45, hash(sub + id * 7.0 + floor(time * (2.0 + 6.0 * hash(id)))));
  glyph *= step(0.12, f.x) * step(f.x, 0.88) * step(0.08, f.y) * step(f.y, 0.92);
  vec3 rain = vec3(0.3, 1.0, 0.45) * glyph * trail + vec3(0.8, 1.0, 0.85) * glyph * (1.0 - smoothstep(0.0, 0.03, d));
  float l = luma(getColor(uv).rgb);
  return vec4(vec3(0.0, l * 0.6, l * 0.2) * backdrop + rain, 1.0);
}
