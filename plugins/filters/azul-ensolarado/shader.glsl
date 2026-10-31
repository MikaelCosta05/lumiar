// Azul ensolarado: dia de sol em filme de cor viva. Os azuis do céu ganham saturação e ficam um pouco mais
// profundos (como com polarizador), as altas luzes e a pele esquentam (sol da tarde), contraste em S de cópia.
// Tudo em Oklab: o céu fica mais azul sem escurecer o resto nem esverdear a pele.

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

vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 lab = toLab(c.rgb);
  float skin = skinWeight(lab);
  float h = atan(lab.z, lab.y);
  float sky = hueBand(h, 4.4, 0.45) * smoothstep(0.01, 0.05, length(lab.yz));
  lab.yz *= 1.0 + 0.55 * sky;
  lab.x -= 0.05 * sky * smoothstep(0.3, 0.8, lab.x);
  lab.yz = hueShift(lab.yz, 3.6, 0.35, 0.18, 1.15);   // ciano -> azul
  lab.yz *= 1.08;
  lab.x = filmCurve(lab.x, 0.3, 0.01, 0.985);
  // Sol quente: altas luzes e pele um pouco mais douradas.
  lab.yz += splitTone(lab.x, vec2(0.0, -0.008), vec2(0.008, 0.022)) * (1.0 - sky);
  lab.yz += vec2(0.004, 0.01) * skin;
  return vec4(labToSrgb(lab), c.a);
}
