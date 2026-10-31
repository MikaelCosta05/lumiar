// Flash de câmera descartável: um flash pequeno colado na lente. A luz cai com o quadrado da distância, então o que
// está perto (a pessoa, achada pela IA de recorte) estoura de claro e o fundo afunda no escuro, mais o facho do
// flash, mais forte no centro. Tudo em luz linear, com as altas luzes comprimidas como na película
// (sem branco chapado). Depois, a cópia de filme barato: um pouco mais de cor e contraste, sombras levemente
// esverdeadas e altas luzes quentes, e o grão de película de ISO alto.

// ---- Ferramentas de cor em Oklab (L = claridade percebida 0 a 1; a/b = verde-vermelho e azul-amarelo).
// Mexer na cor aqui não muda o brilho percebido, e a pele é protegida pelo matiz dela.
vec3 toLab(vec3 srgb) { return lmToOklab(lmToLinear(srgb)); }
vec3 labToSrgb(vec3 lab) { return clamp(lmToSrgb(max(lmFromOklab(lab), 0.0)), 0.0, 1.0); }
/** Peso de um matiz (radianos) com largura w; dá a volta no círculo. */
float hueBand(float h, float center, float w) {
  float d = abs(mod(h - center + PI, 2.0 * PI) - PI);
  return exp(-0.5 * d * d / (w * w));
}
/** Quanto a cor parece pele (matiz laranja-rosado, com alguma cor). */
float skinWeight(vec3 lab) {
  float c = length(lab.yz);
  return hueBand(atan(lab.z, lab.y), 0.95, 0.32) * smoothstep(0.015, 0.045, c) * (1.0 - smoothstep(0.16, 0.22, c));
}
/** Curva de filme sobre L: contraste em S no meio, preto levantado (fosco) e branco contido. */
float filmCurve(float L, float contrast, float black, float white) {
  float x = clamp(L, 0.0, 1.0);
  float s = mix(x, x * x * (3.0 - 2.0 * x), contrast);
  // Ombro suave: as altas luzes chegam no branco sem bater no teto.
  s = s - 0.12 * contrast * s * s * (1.0 - s);
  return black + (white - black) * s;
}
/** Tom dividido: puxa a cor das sombras e das altas luzes (a/b de Oklab), mais forte nos extremos. */
vec2 splitTone(float L, vec2 shadows, vec2 highlights) {
  float sh = (1.0 - smoothstep(0.0, 0.6, L));
  float hi = smoothstep(0.4, 1.0, L);
  return shadows * sh * sh + highlights * hi * hi;
}
/** Gira o matiz de uma faixa de cores e muda a saturação dela. */
vec2 hueShift(vec2 ab, float center, float width, float angle, float sat) {
  float w = hueBand(atan(ab.y, ab.x), center, width);
  float a = angle * w;
  float s = sin(a), c = cos(a);
  return mat2(c, s, -s, c) * ab * mix(1.0, sat, w);
}
// Matizes em Oklab (radianos): vermelho ~0,5 · laranja/pele ~0,95 · amarelo ~1,9 · verde ~2,5 · ciano ~3,4 ·
// azul ~4,5 (−1,8) · roxo/magenta ~5,6 (−0,7).

/**
 * A pessoa como distância, sem recorte: média do recorte da IA em dois anéis (18 e 36 px de 1080p) e depois um
 * corte macio que encolhe a borda para dentro. Assim a luz do flash não vaza para o fundo em volta do cabelo (o
 * recorte da IA é um pouco maior que o cabelo de verdade), e a passagem da pessoa para o fundo vira um degradê largo,
 * não um contorno. Sem o recorte da IA devolve 0.
 */
float personNear(vec2 uv) {
  if (uHasPerson < 0.5) return 0.0;
  float m = getPerson(uv) * 2.0;
  float total = 2.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398 + 0.2;
    m += getPerson(uv + vec2(cos(a), sin(a)) * lmPxUv(18.0))
      + getPerson(uv + vec2(cos(a + 0.3927), sin(a + 0.3927)) * lmPxUv(36.0)) * 0.75;
    total += 1.75;
  }
  m /= total;
  return smoothstep(0.5, 0.97, m);
}

vec4 applyFilter(vec4 c, vec2 uv) {
  // Distância relativa: a pessoa perto (1), o fundo umas duas vezes mais longe; sem pessoa, o meio do quadro é o
  // assunto e as bordas ficam mais longe.
  float person = personNear(uv);
  vec2 p = lmCentered(uv) - vec2(0.0, 0.05);
  float nearness = max(person, exp(-dot(p, p) * 3.5) * 0.55);
  float dist = mix(2.3, 1.0, nearness);
  float beam = exp(-dot(p, p) * 2.2);
  float flashLight = beam / (dist * dist) * 3.6;
  vec3 lin = lmToLinear(c.rgb);
  // O flash soma luz branco-fria; a luz ambiente cai (o obturador é rápido).
  vec3 lit = lin * mix(vec3(1.0), 0.18 + flashLight * vec3(1.0, 1.0, 1.04), flash);
  vec3 col = lmToSrgb(lmTonemap(lit * 1.25));
  col = mix(lmToSrgb(lit), col, flash);
  // Cópia de filme barato.
  vec3 lab = toLab(col);
  float skin = skinWeight(lab);
  lab.yz *= mix(1.15, 1.05, skin);
  lab.x = filmCurve(lab.x, 0.22, 0.015, 0.98);
  lab.yz += splitTone(lab.x, vec2(-0.012, 0.006), vec2(0.004, 0.018));
  col = labToSrgb(lab);
  col = lmFilmGrain(col, uv, grain * 1.4, 1.6, time);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
