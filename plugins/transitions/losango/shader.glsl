vec4 transition(vec2 uv) {
  vec2 p = abs(uv - 0.5) * vec2(ratio, 1.0);
  float d = p.x + p.y;
  float r = progress * ((ratio + 1.0) * 0.5 + smoothness);
  float m = 1.0 - smoothstep(r - smoothness, r, d);
  return mix(getFromColor(uv), getToColor(uv), m);
}
