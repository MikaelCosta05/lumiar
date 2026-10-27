vec4 transition(vec2 uv) {
  float d = length(fract(uv * vec2(ratio, 1.0) * dots) - 0.5);
  float r = clamp(progress * 1.6 - length(uv - 0.5) * 0.8, 0.0, 1.0) * 0.75;
  float m = 1.0 - smoothstep(r - 0.02, r, d);
  return mix(getFromColor(uv), getToColor(uv), m);
}
