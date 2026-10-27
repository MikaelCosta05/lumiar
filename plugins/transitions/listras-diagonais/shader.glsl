vec4 transition(vec2 uv) {
  float c = (uv.x + uv.y) * count;
  float p = clamp((progress - (floor(c) / (count * 2.0)) * 0.5) / 0.5, 0.0, 1.0);
  return fract(c) < p ? getToColor(uv) : getFromColor(uv);
}
