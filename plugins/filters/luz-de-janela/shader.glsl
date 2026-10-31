// ---- A pessoa (recorte da IA), com a borda alargada e suavizada para não aparecer recorte.
/** Recorte suavizado num raio de `radiusPx` px de 1080p (9 leituras); sem o recorte da IA devolve −1. */
float personSoft(vec2 uv, float radiusPx) {
  if (uHasPerson < 0.5) return -1.0;
  vec2 r = lmPxUv(radiusPx);
  float m = getPerson(uv) * 2.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398 + 0.39;
    m += getPerson(uv + vec2(cos(a), sin(a)) * r);
  }
  return m / 10.0;
}
/** Onde está a pessoa (bordas suaves); sem o recorte da IA, vale a imagem toda. */
float personOrAll(vec2 uv) { float p = personSoft(uv, 4.0); return p < 0.0 ? 1.0 : p; }

// Luz de janela: luz quente vindo de um lado, sombra do outro. Reiluminação em luz linear (ganho de exposição, não
// soma de cor): uma janela grande do lado esquerdo, um pouco acima, com queda suave pelo quadro; o lado da luz
// ganha ~+0,5 stop e calor, o lado oposto cai ~−1,35 stop e esfria de leve. Com o recorte da IA, o fundo cai um
// pouco mais que a pessoa (a luz está nela). As altas luzes são comprimidas.
vec4 applyFilter(vec4 c, vec2 uv) {
  vec2 p = lmCentered(uv);
  vec2 dir = normalize(vec2(1.0, -0.35));
  float edge = -0.5 * ratio;
  float t = dot(p - vec2(edge, 0.25), dir) / (ratio * 1.05);
  float key = 1.0 - smoothstep(-0.15, 1.0, t);
  key = key * key * (3.0 - 2.0 * key);
  float person = personSoft(uv, 10.0);
  float stops = mix(-1.35, 0.5, key);
  if (person >= 0.0) stops -= 0.35 * (1.0 - person);
  vec3 lin = lmToLinear(c.rgb) * exp2(stops);
  lin = lmToLinear(lmWhiteBalance(lmToSrgb(lin), mix(-0.12, 0.42, key), 0.0));
  return vec4(lmSoftClip(lmToSrgb(lin), 0.88), c.a);
}
