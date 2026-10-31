// Relógio: um ponteiro gira a partir do meio-dia revelando o próximo clipe, com aceleração (ease in-out),
// borda suave em ângulo ("Suavidade" = fração da volta), sombra leve à frente do ponteiro e antisserrilhado de
// verdade (a máscara é calculada em 4 pontos dentro de cada pixel, o que limpa também a linha do meio-dia).

float clockMask(vec2 p, float e) {
  float t = fract(atan(p.x, p.y) / (2.0 * PI) + 1.0);  // 0 no meio-dia, no sentido do relógio
  return 1.0 - smoothstep(e - smoothness, e, t);
}

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  vec2 p = lmCentered(uv);
  float e = lmEaseInOutCubic(progress) * (1.0 + smoothness);
  float px = 1.0 / resolution.y;
  float m = 0.0;
  m += clockMask(p + vec2(0.125, 0.375) * px, e);
  m += clockMask(p + vec2(-0.375, 0.125) * px, e);
  m += clockMask(p + vec2(0.375, -0.125) * px, e);
  m += clockMask(p + vec2(-0.125, -0.375) * px, e);
  m *= 0.25;
  // Sombra do ponteiro sobre o clipe atual, logo à frente da borda.
  float t = fract(atan(p.x, p.y) / (2.0 * PI) + 1.0);
  float ahead = t - e;
  float shadow = (ahead > 0.0 ? pow(1.0 - smoothstep(0.0, 0.05, ahead), 2.0) : 0.0) * 0.25 * lmBell(progress);
  vec4 from = getFromColor(uv);
  from.rgb *= 1.0 - shadow * smoothstep(0.0, 0.05, length(p));
  return mix(from, getToColor(uv), m);
}
