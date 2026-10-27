vec4 transition(vec2 uv) {
  float coord = vertical > 0.5 ? uv.y : uv.x;
  float f = fract(coord * count);
  float p = progress * (1.0 + smoothness);
  float m = 1.0 - smoothstep(p - smoothness, p, f);
  return mix(getFromColor(uv), getToColor(uv), m);
}
