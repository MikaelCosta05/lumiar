// Aquarela: lavadas de tinta transparente sobre papel de algodão.
// Modelo de densidade de pigmento (Bousseau et al., 2006): C' = C - (C - C²)(d - 1). Onde a densidade d passa de 1
// a cor escurece como uma camada a mais de tinta; abaixo de 1, clareia como tinta diluída.
// - escorrer: a tinta molhada se espalha seguindo um fluxo orgânico (fbm), com borda irregular;
// - acúmulo nas bordas: ao secar, o pigmento migra para a beira da poça (borda mais escura);
// - granulação: o pigmento assenta nos vales do papel;
// - turbulência: a tinta fica mais carregada em umas manchas do que em outras.

vec2 mirrorUv(vec2 p) { return 1.0 - abs(1.0 - mod(p, 2.0)); }

/** A tinta aplicada sobre a cor C com densidade d (modelo de Bousseau). */
vec3 pigment(vec3 c, float d) { return clamp(c - (c - c * c) * (d - 1.0), 0.0, 1.0); }

float level0;

/** Cor lavada: a imagem sem detalhe fino (nível de detalhe ~3 px de 1080p), em camadas de tom suaves. */
vec3 wash(vec2 uv) {
  vec3 c = getColorLod(mirrorUv(uv), level0).rgb;
  vec3 lab = lmToOklab(lmToLinear(c));
  // Camadas de tinta: o tom se acomoda em poucos patamares, com transição macia (molhado sobre seco).
  float x = lab.x * 6.0;
  float f = fract(x);
  float q = (floor(x) + smoothstep(0.25, 0.75, f)) / 6.0;
  float L = mix(lab.x, q, 0.55);
  lab.yz *= 1.08 * (L / max(lab.x, 1e-3) * 0.5 + 0.5);
  lab.x = L;
  return clamp(lmToSrgb(lmFromOklab(lab)), 0.0, 1.0);
}

/** Só o tom em camadas da lavada (para achar a beira das poças sem converter a cor inteira). */
float washL(vec2 uv) {
  float L = lmToOklab(lmToLinear(getColorLod(mirrorUv(uv), level0).rgb)).x;
  float x = L * 6.0;
  return mix(L, (floor(x) + smoothstep(0.25, 0.75, fract(x))) / 6.0, 0.55);
}

vec4 effect(vec2 uv) {
  vec2 a = lmCentered(uv);
  float b = bleed;
  level0 = max(log2(3.0 * resolution.y / 1080.0), 0.0);

  // Fluxo da tinta molhada: deslocamento largo e lento + franja fina na borda das poças.
  vec2 flow = vec2(lmFbm(a * 2.6 + 1.3, 2), lmFbm(a * 2.6 + 7.9, 2)) * lmPx(9.0) * b;
  vec2 fringe = vec2(lmNoise(a * 22.0 + 3.1), lmNoise(a * 22.0 + 9.4)) * 0.6 * lmPx(3.0) * (0.35 + b);
  vec2 wu = uv + (flow + fringe) / vec2(ratio, 1.0);

  vec3 c = wash(wu);

  // Pigmento acumulado nas bordas: contraste da lavada em volta (a beira da poça seca mais escura).
  vec2 o = lmPxUv(4.5);
  float ex = washL(wu + vec2(o.x, 0.0)) - washL(wu - vec2(o.x, 0.0));
  float ey = washL(wu + vec2(0.0, o.y)) - washL(wu - vec2(0.0, o.y));
  float edge = length(vec2(ex, ey));
  float rim = smoothstep(0.03, 0.25, edge);

  // Papel: dente fino (fibras) e ondulação larga do algodão prensado.
  vec2 pp = a * 1080.0;
  float tooth = lmNoise(pp / 5.0) * 0.65 + lmNoise(pp / 2.3 + 4.0) * 0.35;
  float cotton = lmNoise(pp / 60.0 + 11.0);
  float height = tooth * 0.7 + cotton * 0.3;

  // Densidade do pigmento.
  float d = 1.0;
  d += rim * (0.32 + 0.2 * b);                       // borda escura
  d += lmFbm(a * 3.2 + 21.0, 3) * 0.4;               // turbulência
  d += -height * 0.32;                               // granulação: mais pigmento nos vales
  // A tinta é transparente: a lavada é um pouco mais clara que a foto (o papel aparece por trás).
  vec3 paper = vec3(0.975, 0.962, 0.928);
  c = mix(c, vec3(1.0), 0.1) * 0.93 + 0.07;
  vec3 col = pigment(c, d) * paper;

  // Relevo do papel pego por uma luz rasante da esquerda (bem de leve).
  vec2 slope = vec2(dFdx(tooth), dFdy(tooth)) * (resolution.y / 1080.0) * 1.5;
  col *= 1.0 + (slope.x * 0.6 + slope.y * 0.4) * 0.22;
  return vec4(clamp(col, 0.0, 1.0), 1.0);
}
