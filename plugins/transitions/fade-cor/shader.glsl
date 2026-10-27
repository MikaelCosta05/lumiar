vec4 transition(vec2 uv) {
  vec4 c = vec4(tint, 1.0);
  if (progress < 0.5) return mix(getFromColor(uv), c, progress * 2.0);
  return mix(c, getToColor(uv), (progress - 0.5) * 2.0);
}
