vec4 transition(vec2 uv) {
  float zf = 1.0 + progress * progress * 10.0;
  float zt = 1.0 + (1.0 - progress) * (1.0 - progress) * 10.0;
  vec4 a = getFromColor((uv - 0.5) / zf + 0.5);
  vec4 b = getToColor((uv - 0.5) / zt + 0.5);
  return mix(a, b, smoothstep(0.35, 0.65, progress));
}
