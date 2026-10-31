// Cópia em platina e paládio (contato sobre papel de algodão):
// - Escala tonal muito longa: curva de papel macia, sem ombro duro, e preto fosco (o metal fica dentro das
//   fibras, o preto máximo é baixo). Exposição pancromática em luz linear.
// - "Tom quente": de platina pura (cinza-neutro frio) a paládio (castanho quente), por faixa de tom: as sombras
//   recebem mais cor, as luzes vão para o creme do papel. Feito em Oklab (claridade igual à do P&B).
// - "Textura do papel": fibras de algodão e o dente do papel (fbm anisotrópico, fixo como no papel), mais
//   visíveis nos meios-tons; e a borda da emulsão passada a pincel: pinceladas horizontais deixam o lado
//   esquerdo e o direito com cerdas irregulares, e o papel nu aparece em volta.

float paperCurve(float x, float hard, float pivot) {
  x = pow(clamp(x, 0.0, 1.0), log(0.5) / log(pivot));
  hard = max(hard, 0.05);
  float a = 1.0 / (1.0 + exp(0.5 * hard));
  return (1.0 / (1.0 + exp(-hard * (x - 0.5))) - a) / (1.0 - 2.0 * a);
}

bool inGamut(vec3 lin) { return all(greaterThanEqual(lin, vec3(-1e-4))) && all(lessThanEqual(lin, vec3(1.0001))); }
vec3 okToSrgb(vec3 lab) {
  lab.x = clamp(lab.x, 0.0, 1.0);
  if (inGamut(lmFromOklab(lab))) return clamp(lmToSrgb(lmFromOklab(lab)), 0.0, 1.0);
  float lo = 0.0, hi = 1.0;
  for (int i = 0; i < 8; i++) {
    float m = 0.5 * (lo + hi);
    if (inGamut(lmFromOklab(vec3(lab.x, lab.yz * m)))) lo = m; else hi = m;
  }
  return clamp(lmToSrgb(lmFromOklab(vec3(lab.x, lab.yz * lo))), 0.0, 1.0);
}
vec3 toneGray(float v, vec2 ab) { return okToSrgb(vec3(pow(lmToLinear(vec3(v)).x, 1.0 / 3.0), ab)); }

vec4 applyFilter(vec4 c, vec2 uv) {
  vec2 p = lmCentered(uv);
  vec2 px = p * 1080.0;
  float v = lmToSrgb(vec3(dot(lmToLinear(c.rgb), vec3(0.25, 0.62, 0.13)))).x;
  float l = mix(0.1, 0.95, paperCurve(v, 2.7, 0.48));
  // Fibras e dente do papel de algodão.
  float fibers = lmFbm(px * vec2(0.018, 0.07) + 3.1, 3) * 0.6 + lmFbm(px * 0.22 + 9.4, 2) * 0.4;
  float tex = fibers * paper;
  l *= 1.0 - tex * 0.07 * (0.4 + 2.4 * l * (1.0 - l));
  // Cor por faixa: platina (frio-neutro) ↔ paládio (castanho quente).
  vec2 shadowAb = mix(vec2(0.002, 0.004), vec2(0.02, 0.038), warm);
  vec2 midAb = mix(vec2(0.002, 0.008), vec2(0.016, 0.044), warm);
  vec2 paperAb = mix(vec2(0.0, 0.01), vec2(0.004, 0.026), warm);
  vec2 ab = l < 0.5 ? mix(shadowAb, midAb, smoothstep(0.1, 0.5, l)) : mix(midAb, paperAb, smoothstep(0.5, 0.95, l));
  vec3 col = toneGray(l, ab);
  // Borda da emulsão passada a pincel.
  float edgeOn = smoothstep(0.0, 0.35, paper);
  vec2 halfSize = vec2(0.5 * ratio, 0.5) - lmPx(mix(26.0, 46.0, paper));
  // A borda só é calculada perto das margens (o resto do quadro não paga o custo do ruído).
  bool nearEdge = abs(p.x) > halfSize.x - lmPx(110.0) || abs(p.y) > halfSize.y - lmPx(40.0);
  if (edgeOn > 0.0 && nearEdge) {
    // Lados esquerdo/direito: a borda ondula devagar e o pincel quase seco deixa riscos horizontais finos que
    // avançam sobre o papel e vão rareando (o fim das cerdas).
    float wobble = lmFbm(vec2(px.y * 0.012, 1.3), 3) * lmPx(14.0);
    // Topo e base: borda mais lisa, ondulando devagar.
    float wave = lmFbm(vec2(px.x * 0.006, 4.2), 3) * lmPx(8.0) + lmFbm(vec2(px.x * 0.05, 2.9), 2) * lmPx(1.5);
    float dx = abs(p.x) - (halfSize.x + wobble);
    float dy = abs(p.y) - (halfSize.y + wave);
    float aa = lmPx(1.2);
    float inside = 1.0 - smoothstep(-aa, aa, max(dx, dy));
    float streak = lmFbm(vec2(px.x * 0.011, px.y * 0.32) + 6.0, 4) * 0.5 + 0.5;
    float reachOut = clamp(dx / lmPx(55.0), 0.0, 1.0);
    float thr = mix(0.4, 0.9, reachOut);
    float dryBrush = smoothstep(thr - 0.05, thr + 0.05, streak) * (1.0 - smoothstep(-aa, aa, dy)) * (1.0 - reachOut);
    float coated = max(inside, dryBrush * 0.9);
    // Perto da borda o pincel deixa a camada mais fina, nas mesmas faixas horizontais.
    float thin = smoothstep(-lmPx(70.0), 0.0, dx) * (1.0 - streak);
    coated *= 1.0 - thin * 0.3;
    vec3 bare = toneGray(clamp(0.955 - tex * 0.02, 0.0, 1.0), paperAb);
    col = mix(col, mix(bare, col, coated), edgeOn);
  }
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
