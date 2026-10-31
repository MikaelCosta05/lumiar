// Sépia doente: uma cópia em sépia que estragou. Os tons vão de um preto esverdeado a um creme amarelado (a
// viragem mal fixada), com manchas de química orgânicas (fbm) que têm a marca de maré na borda, como água que secou
// no papel; a borda do quadro foi comida pelo tempo, irregular. Cintilação de projetor por quadro de filme
// (24 por segundo) e grão de película.

vec4 applyFilter(vec4 c, vec2 uv) {
  float l = lmLuma(c.rgb);
  l = mix(l, l * l * (3.0 - 2.0 * l), 0.4);
  vec3 dark = vec3(0.08, 0.075, 0.035);
  vec3 mid = vec3(0.44, 0.40, 0.24);
  vec3 light = vec3(0.87, 0.84, 0.64);
  vec3 col = l < 0.5 ? mix(dark, mid, l * 2.0) : mix(mid, light, l * 2.0 - 1.0);
  vec2 p = lmCentered(uv);
  // Manchas de química: miolo mais escuro e esverdeado, borda (maré) marrom e marcada.
  vec2 warp = vec2(lmNoise(p * 2.5 + 3.0), lmNoise(p * 2.5 + 8.0));
  float n = lmFbm(p * 2.2 + warp * 0.7 + 11.0, 4) * 0.5 + 0.5;
  float th = 0.68 - stains * 0.12;
  float inside = smoothstep(th, th + 0.05, n);
  float tw = (n - th) / 0.012;
  float tide = exp(-tw * tw);
  col = mix(col, col * vec3(0.78, 0.84, 0.55), inside * stains * 0.6);
  col *= 1.0 - tide * stains * 0.35;
  // Respingos menores: o mesmo campo visto mais de perto (um ruído a mais, sem outro fbm).
  float blot = smoothstep(0.62, 0.9, lmNoise(p * 9.0 + warp * 2.0) * 0.5 + 0.5);
  col *= 1.0 - blot * stains * 0.25;
  // Borda comida: vinheta irregular.
  float r = length(p / vec2(ratio * 0.5, 0.5)) / 1.414;
  float edge = r + (r > 0.3 ? lmFbm(p * 3.0 + 5.0, 2) * 0.12 : 0.0);
  col *= mix(1.0, 1.0 - smoothstep(0.45, 0.95, edge) * 0.85, vig);
  float frame = floor(time * 24.0);
  col *= 1.0 + (lmHash(vec2(frame, 1.0)) - 0.5) * 0.06;
  col = lmFilmGrain(col, uv, 0.35, 1.3, time);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
