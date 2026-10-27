vec4 effect(vec2 uv) {
  vec2 p = uv;
  p.x += sin(uv.y * frequency * 2.0 * PI + time * speed) * amplitude;
  p.y += cos(uv.x * frequency * 2.0 * PI + time * speed * 0.8) * amplitude * 0.5;
  return getColor(p);
}
