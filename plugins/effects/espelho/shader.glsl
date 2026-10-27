vec4 effect(vec2 uv) {
  vec2 p = uv;
  if (mode < 0.5 || mode > 1.5) p.x = p.x < 0.5 ? p.x : 1.0 - p.x;
  if (mode > 0.5) p.y = p.y > 0.5 ? p.y : 1.0 - p.y;
  return getColor(p);
}
