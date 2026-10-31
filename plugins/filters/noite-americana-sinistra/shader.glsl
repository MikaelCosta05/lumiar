// Noite americana sinistra: a "noite americana" do cinema (dia filmado e virado em noite) puxada para o doentio.
// A exposição cai quase dois diafragmas em luz linear, a cor some e vira o luar da cor escolhida, as sombras afundam
// (pé da curva fechado) e as partes claras (os rostos) ficam pálidas, quase brancas, porque a curva segura as
// altas luzes. Vinheta de lente escura em volta e um grão fino de película.

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
  vec3 lin = lmToLinear(c.rgb);
  float Y = lmLuma(lin);
  // Menos exposição e sombras mais fundas.
  float stops = -1.2 - dark * 1.6;
  float Yn = Y * exp2(stops);
  Yn = Yn * Yn / (Yn + 0.02 * (1.0 + dark));      // pé fechado: o escuro afunda
  // Luar: a luminância com a cor escolhida (normalizada para não mudar o brilho) e um resto de cor.
  vec3 moon = moonLight / max(lmLuma(moonLight), 1e-3);
  vec3 col = mix(vec3(Yn) * moon, lin * exp2(stops) * moon, 0.12);
  // Os claros (rostos) ficam pálidos: perdem o tom do luar e ganham claridade.
  float pale = smoothstep(0.35, 0.9, lmToSrgb(vec3(Y)).x);
  col = mix(col, vec3(Yn) * 1.6 * mix(moon, vec3(1.0), 0.45), pale * 0.55);
  col *= lmVignette(uv, 0.6 + 0.3 * dark, 0.5);
  vec3 s = lmToSrgb(lmTonemap(col * 1.4));
  s = lmFilmGrain(s, uv, 0.25, 1.2, time);
  return vec4(clamp(s, 0.0, 1.0), c.a);
}
