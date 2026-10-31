// P&B infravermelho (Kodak HIE / filtro R72 na lente):
// - A clorofila reflete muito infravermelho ("efeito Wood"): folhas e grama saem brancas como neve; o céu azul
//   (que quase não tem infravermelho) fica preto, e as nuvens continuam brancas; a pele fica clara e lisa.
// - A estimativa é feita em luz linear: o vermelho domina, o azul subtrai; a vegetação é reconhecida pelo matiz
//   (amarelo-esverdeado a verde, em Oklab, numa cor alisada 4 px para os blocos da compressão não virarem
//   contornos) e ganha o reflexo do infravermelho, que cresce com o próprio verde.
// - A HIE não tinha camada anti-halo: o que é muito claro no infravermelho (as folhas) ganha um halo leitoso,
//   calculado sobre a própria imagem infravermelha em níveis de detalhe (sem cópias nem quadriculado).
// - Grão grosso da HIE.

float paperCurve(float x, float hard, float pivot) {
  x = pow(clamp(x, 0.0, 1.0), log(0.5) / log(pivot));
  hard = max(hard, 0.05);
  float a = 1.0 / (1.0 + exp(0.5 * hard));
  return (1.0 / (1.0 + exp(-hard * (x - 0.5))) - a) / (1.0 - 2.0 * a);
}

/**
 * Quanto um ponto é folha (0 a 1), pela cor em Oklab: matiz do amarelo-esverdeado ao verde, com algum croma.
 * Medido numa cor já alisada (a croma do vídeo é de baixa resolução e cheia de blocos de compressão).
 */
float leafMask(vec3 srgb) {
  vec3 lab = lmToOklab(lmToLinear(srgb));
  float hue = atan(lab.z, lab.y);
  float chroma = length(lab.yz);
  return (1.0 - smoothstep(0.4, 0.85, abs(hue - 2.2))) * smoothstep(0.012, 0.055, chroma);
}

/** Reflexo infravermelho estimado (linear): o vermelho domina, o azul subtrai, e a folha reflete muito. */
float infrared(vec3 srgb, float leaf) {
  vec3 lin = lmToLinear(srgb);
  float base = dot(lin, vec3(0.78, 0.4, -0.22));
  // A folha reflete muito infravermelho mesmo quando o verde visível é escuro (coníferas): a resposta cresce
  // mais devagar que o verde (raiz), mas a folha à sombra continua mais escura que a folha ao sol.
  return max(base + leaf * (lin.g * 3.2 + sqrt(max(lin.g, 0.0)) * 0.22), 0.0);
}

vec4 applyFilter(vec4 c, vec2 uv) {
  // Máscara da folha numa versão alisada (~4 px de 1080p) lida direto dos níveis de detalhe.
  float ir = infrared(c.rgb, leafMask(getColorLod(uv, 1.5 + log2(resolution.y / 1080.0)).rgb));
  // Halo da HIE: a imagem infravermelha borrada em alguns níveis, só o que passa do limiar.
  float halo = 0.0;
  float total = 0.0;
  for (int i = 2; i <= 5; i++) {
    float level = float(i) + log2(resolution.y / 1080.0);
    vec2 texel = exp2(level) / resolution;
    vec3 c0 = getColorLod(uv, level).rgb;
    vec3 c1 = getColorLod(uv + texel * vec2(1.0, 0.5), level).rgb;
    vec3 c2 = getColorLod(uv - texel * vec2(1.0, 0.5), level).rgb;
    vec3 c3 = getColorLod(uv + texel * vec2(-0.5, 1.0), level).rgb;
    vec3 c4 = getColorLod(uv + texel * vec2(0.5, -1.0), level).rgb;
    vec3 avg = (c0 * 2.0 + c1 + c2 + c3 + c4) / 6.0;
    float s = infrared(avg, leafMask(avg));
    float w = 1.0 / (1.0 + float(i - 2));
    halo += max(s - 0.32, 0.0) * w;
    total += w;
  }
  ir += halo / total * 0.75;
  float v = lmToSrgb(vec3(ir)).x;
  float l = mix(0.02, 0.97, paperCurve(v, 4.6, 0.46));
  l = lmSoftClip(vec3(l), 0.9).x;
  l = lmLuma(lmFilmGrain(vec3(l), uv, 0.55, 1.9, time));
  return vec4(vec3(clamp(l, 0.0, 1.0)), c.a);
}
