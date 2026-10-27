vec4 effect(vec2 uv) {
  vec2 cells = resolution / max(size, 1.0);
  return getColor((floor(uv * cells) + 0.5) / cells);
}
