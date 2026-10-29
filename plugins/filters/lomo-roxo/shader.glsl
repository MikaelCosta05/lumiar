float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 saturate(vec3 c, float s) {
  return mix(vec3(luma(c)), c, s);
}

vec3 sCurve(vec3 c, float k) {
  c = clamp(c, 0.0, 1.0);
  return mix(c, c * c * (3.0 - 2.0 * c), k);
}

float vignette(vec2 uv, float strength) {
  vec2 p = (uv - 0.5) * vec2(ratio, 1.0);
  return 1.0 - dot(p, p) * strength;
}

vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 s = c.rgb;
  // Camadas do filme trocadas: verde → roxo, azul → verde-água.
  vec3 col = vec3(dot(s, vec3(0.7, 0.45, 0.0)) / 1.15, dot(s, vec3(0.15, 0.0, 0.8)) / 0.95, dot(s, vec3(0.0, 0.75, 0.35)) / 1.1);
  col += (luma(s) - luma(col)) * 0.6;
  col = saturate(col, satAmt);
  col = sCurve(col, 0.35);
  col *= mix(1.0, vignette(uv, 1.0), vig);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
