// Névoa: ar enevoado com perspectiva aérea. A névoa se soma como luz (modelo de Koschmieder, em luz linear): quanto
// mais longe (pela profundidade), menos da cena passa e mais do cinza-azulado claro da névoa aparece; o fundo
// clareia e perde cor sozinho, enquanto o que está perto guarda o contraste e o preto. A densidade varia devagar
// (fbm, deriva com o tempo) e as luzes se espalham num brilho leve.
vec4 applyFilter(vec4 c, vec2 uv) {
  float far = 1.0 - clamp(getDepth(uv), 0.0, 1.0);
  vec2 p = lmCentered(uv);
  float n = lmFbm(vec3(p * vec2(1.6, 3.2) + vec2(time * 0.015, 0.0), time * 0.04), 4);
  float density = 1.0 + 0.25 * n;
  // Distância óptica: quase nada perto da câmera, crescendo rápido com a distância.
  float tau = density * (0.04 + 1.15 * far * far);
  float T = exp(-tau);
  vec3 lin = lmToLinear(c.rgb);
  // A névoa é iluminada pelo céu: um pouco mais clara no alto do quadro.
  vec3 fog = lmToLinear(vec3(0.79, 0.83, 0.87)) * mix(0.9, 1.05, uv.y);
  lin = lin * T + fog * (1.0 - T);
  // As luzes se espalham na névoa (mais onde há mais névoa).
  lin += lmBloom(uv, 0.65, 0.75) * vec3(0.95, 0.97, 1.0) * 0.25 * (1.0 - T);
  return vec4(lmSoftClip(lmToSrgb(lin), 0.88), c.a);
}
