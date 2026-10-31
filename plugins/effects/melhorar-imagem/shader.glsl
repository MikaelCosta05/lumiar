// Melhorar imagem (vídeo escuro, granulado ou sem nitidez). Tira o granulado com um filtro bilateral que separa
// claridade e cor (o ruído de cor, o mais feio dos celulares, é tirado com mais força), devolve a nitidez só na
// claridade (sem franjas coloridas) e com o realce limitado (sem halo branco nas bordas), clareia as sombras por uma
// curva de gama na luminância, que mantém a cor e não mexe no branco, e aviva as cores pouco saturadas mais do que
// as já fortes (vibrance), protegendo a pele.

vec4 effect(vec2 uv) {
  vec4 original = getColor(uv);
  vec3 c = original.rgb;
  // Passo das amostras: 1 px de 1080p (no mínimo 1 px desta resolução).
  vec2 px = max(lmPxUv(1.0), 1.0 / resolution);

  // Tirar granulado: bilateral 5×5. A claridade só se mistura com vizinhos parecidos (bordas ficam); a cor, com
  // tolerância maior.
  float l0 = lmLuma(c);
  float tolL = 0.0015 + 0.02 * granulado;
  float tolC = tolL * 6.0;
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  vec2 chroma = vec2(0.0);
  float csum = 0.0;
  for (int y = -2; y <= 2; y++) {
    for (int x = -2; x <= 2; x++) {
      vec2 o = vec2(float(x), float(y));
      vec3 s = getColor(uv + o * px).rgb;
      float dl = lmLuma(s) - l0;
      float spatial = exp(-dot(o, o) / 4.5);
      float w = spatial * exp(-dl * dl / tolL);
      acc += s * w;
      wsum += w;
      vec2 sc = vec2(s.r - lmLuma(s), s.b - lmLuma(s));
      float wc = spatial * exp(-dl * dl / tolC);
      chroma += sc * wc;
      csum += wc;
    }
  }
  vec3 smooth_ = acc / wsum;
  vec2 cAvg = chroma / csum;
  // A cor vem da média larga, a claridade da média que respeita as bordas.
  float ls = lmLuma(smooth_);
  vec3 denoised = vec3(ls + cAvg.x, 0.0, ls + cAvg.y);
  denoised.g = (ls - 0.2126 * denoised.r - 0.0722 * denoised.b) / 0.7152;
  vec3 col = mix(c, clamp(denoised, 0.0, 1.0), granulado);

  // Nitidez: realce da claridade (diferença para um desfoque de 1,5 px), limitado para não criar halo.
  vec2 r = px * 1.5;
  float blurL = (lmLuma(getColor(uv + vec2(r.x, 0.0)).rgb) + lmLuma(getColor(uv - vec2(r.x, 0.0)).rgb)
               + lmLuma(getColor(uv + vec2(0.0, r.y)).rgb) + lmLuma(getColor(uv - vec2(0.0, r.y)).rgb)) * 0.25;
  blurL = mix(blurL, ls, granulado * 0.5);
  float detail = lmLuma(col) - blurL;
  detail = detail / (1.0 + abs(detail) * 10.0);
  col += detail * nitidez * 1.6;

  // Clarear o escuro: gama na luminância (o branco fica no lugar), aplicada como ganho em luz linear (cor mantida).
  vec3 lin = lmToLinear(clamp(col, 0.0, 1.0));
  float l = lmLuma(clamp(col, 0.0, 1.0));
  float lifted = pow(max(l, 1e-4), 1.0 / (1.0 + clarear * 0.9)) + clarear * 0.01;
  float gain = lmToLinear(vec3(lifted)).x / max(lmToLinear(vec3(l)).x, 1e-4);
  lin *= min(gain, 8.0);

  // Cor mais viva (vibrance) em Oklab: as cores apagadas ganham mais, a pele ganha metade.
  vec3 lab = lmToOklab(lin);
  float ch = length(lab.yz);
  float hue = degrees(atan(lab.z, lab.y));
  float skin = smoothstep(20.0, 35.0, hue) * (1.0 - smoothstep(75.0, 95.0, hue));
  lab.yz *= 1.0 + cor * 0.8 * (1.0 - smoothstep(0.04, 0.2, ch)) * (1.0 - 0.5 * skin);
  col = lmToSrgb(max(lmFromOklab(lab), 0.0));
  return vec4(clamp(col, 0.0, 1.0), original.a);
}
