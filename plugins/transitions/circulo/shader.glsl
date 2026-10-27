vec4 transition(vec2 uv) {
  vec2 p = (uv - center) * vec2(ratio, 1.0);
  // Distância até o canto mais longe, para cobrir a tela toda no fim.
  vec2 far = max(center, 1.0 - center) * vec2(ratio, 1.0);
  float r = progress * (length(far) + smoothness);
  float m = 1.0 - smoothstep(r - smoothness, r, length(p));
  return mix(getFromColor(uv), getToColor(uv), m);
}
