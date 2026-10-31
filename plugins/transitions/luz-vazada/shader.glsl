// Luz vazada: duas manchas de luz de película atravessam a troca em sentidos opostos (a principal na cor escolhida,
// a segunda num rosa avermelhado), com forma orgânica (faixa diagonal deformada por ruído fbm que anda, não
// círculos) e mais fortes perto das bordas, de onde a luz vaza no filme. A luz soma em luz linear e lava um pouco a
// imagem, com as altas luzes comprimidas; a troca acontece por baixo, no momento mais claro.

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  float env = sin(progress * PI);
  env *= env;
  vec2 p = lmCentered(uv);
  float t = progress * 1.6;
  float e = lmEaseInOutSine(progress);
  // Deformação orgânica das manchas.
  vec2 warp = vec2(lmFbm(p * 1.2 + vec2(t, 0.3 * t), 3), lmFbm(p * 1.2 + vec2(5.2 - 0.2 * t, t), 3)) * 0.35;
  vec2 w = p + warp;
  // Mancha principal: entra pela esquerda e sai pela direita, inclinada.
  float x1 = mix(-1.6, 1.6, e);
  float band1 = exp(-pow((w.x - x1 + 0.45 * w.y) / 0.5, 2.0));
  float body1 = band1 * (0.55 + 0.45 * lmFbm(w * 2.3 + vec2(7.0 + t * 0.9, -t * 0.6), 3));
  // Segunda mancha: de baixo à direita para a esquerda, menor.
  float x2 = mix(1.5, -1.5, e);
  float band2 = exp(-pow((w.x - x2 - 0.3 * w.y) / 0.32, 2.0)) * exp(-pow((w.y + 0.25) / 0.45, 2.0));
  float body2 = band2 * (0.5 + 0.5 * lmFbm(w * 3.1 + vec2(13.0 - t * 0.8, t * 0.5), 3));
  // Mais forte perto das bordas do quadro.
  float edge = 0.55 + 0.6 * smoothstep(0.2, 1.0, length(p * vec2(0.8, 1.2)));
  vec3 warm = lmToLinear(tint);
  vec3 rose = lmToLinear(mix(vec3(1.0, 0.25, 0.4), tint, 0.25));
  vec3 light = (warm * max(body1, 0.0) * 2.4 + rose * max(body2, 0.0) * 1.6) * edge * env;

  float m = smoothstep(0.3, 0.7, progress);
  vec3 img = mix(lmToLinear(getFromColor(uv).rgb), lmToLinear(getToColor(uv).rgb), m);
  // A luz também lava a imagem (o filme velado perde contraste onde a luz bate).
  vec3 lin = img * (1.0 + lmLuma(light) * 0.8) + light;
  vec3 col = lmToSrgb(lin);
  col = mix(col, lmSoftClip(col, 0.72), clamp(lmLuma(light) * 5.0, 0.0, 1.0));
  return vec4(col, 1.0);
}
