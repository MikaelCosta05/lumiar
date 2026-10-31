// Filme queimado: a película parou no projetor e o calor da lâmpada começa a derretê-la. A queimadura parte das
// bordas com um contorno orgânico (fbm com o domínio torcido) que avança e borbulha devagar; atrás da frente fica o
// buraco preto carbonizado, na frente uma brasa laranja que brilha como luz (somada em luz linear e comprimida, sem
// estourar) e um vazamento quente que tinge a imagem. A exposição oscila quadro a quadro de filme (24 por segundo)
// e varia pelo quadro, como luz de projetor irregular.

vec4 applyFilter(vec4 c, vec2 uv) {
  vec2 p = lmCentered(uv);
  float t = time;
  // Distância até a borda do quadro (com a proporção certa).
  float edge = min(0.5 * ratio - abs(p.x), 0.5 - abs(p.y));
  // Exposição desigual do projetor: quadro a quadro e pelo quadro.
  float frame = floor(t * 24.0);
  float expo = (lmHash(vec2(frame, 0.5)) - 0.5) * 0.5 * flick + lmNoise(vec3(p * 1.5, frame * 0.3)) * 0.35 * flick;
  vec3 lin = lmToLinear(c.rgb) * exp2(expo) * vec3(1.06, 0.99, 0.88);
  // Longe das bordas não há queimadura: pula o cálculo da frente (o alcance máximo é 1,7 × 0,22 × burn).
  float on = min(burn * 3.0, 1.0);
  if (edge > burn * 0.22 * 1.7 * 3.6 + 0.08 || on <= 0.0) return vec4(clamp(lmSoftClip(lmToSrgb(lin), 0.85), 0.0, 1.0), c.a);
  // Frente da queimadura: fbm torcido, que avança e borbulha devagar (o tempo desliza o ruído).
  vec2 drift = vec2(t * 0.05, -t * 0.03);
  vec2 warp = vec2(lmFbm(p * 2.2 + drift, 2), lmFbm(p * 2.2 + 7.3 - drift, 2));
  float n = lmFbm(p * 3.0 + warp * 0.8 + drift * 1.5, 4);
  // Alguns trechos da borda comem bem mais que outros.
  float reach = 0.3 + 1.4 * smoothstep(-0.2, 0.5, lmFbm(p * 1.2 + 4.0 + drift * 0.5, 2));
  float front = burn * 0.22 * reach;
  float s = (edge + n * 0.07) / max(front, 1e-3);
  float hole = (1.0 - smoothstep(0.85, 1.0, s)) * on;
  float ember = exp(-pow(max(s - 1.0, 0.0) / 0.18, 2.0)) * smoothstep(0.75, 1.0, s) * on;
  float leak = (1.0 - smoothstep(1.0, 3.5, s)) * on;
  // Vazamento quente e brasa, somados como luz.
  lin += vec3(1.0, 0.36, 0.06) * leak * leak * burn * 0.35;
  // A brasa não é um anel uniforme: trechos acesos, outros quase apagados, e um crepitar fino.
  float crackle = smoothstep(-0.35, 0.45, lmFbm(p * 9.0 + drift * 8.0, 2)) * (0.75 + 0.5 * lmNoise(vec3(p * 45.0, t * 3.0)));
  lin += vec3(1.0, 0.45, 0.08) * ember * 2.2 * crackle;
  // A luz da brasa é comprimida nas altas luzes (a mesma curva do resto do quadro, sem emenda).
  vec3 col = lmSoftClip(lmToSrgb(lin), 0.85);
  // O buraco: preto carbonizado, com um resto marrom na borda.
  vec3 char_ = mix(vec3(0.03, 0.015, 0.005), vec3(0.12, 0.05, 0.015), smoothstep(0.6, 0.95, s));
  col = mix(col, char_, hole);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
