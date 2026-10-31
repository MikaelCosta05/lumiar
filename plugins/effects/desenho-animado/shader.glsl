// Desenho animado: cores chapadas em poucos tons + traço de nanquim.
// - Um único laço 7×7 (passo de 1,4 px de 1080p) dá três coisas: um filtro bilateral (alisa a pele e os tecidos sem
//   borrar as bordas) e dois desfoques gaussianos da luminância (σ 1,4 e 2,2 px) para a Diferença de Gaussianas.
// - O traço vem da DoG (XDoG, Winnemöller 2012): linhas limpas, com espessura que acompanha o contraste,
//   sem o chuvisco do Sobel puro.
// - Os tons são patamares de luminância em Oklab (o matiz e a pele continuam no lugar), com a passagem entre um
//   patamar e outro suavizada no tamanho de um pixel (sem serrilhado).

vec4 effect(vec2 uv) {
  vec2 px = lmPxUv(1.4);
  vec3 center = getColor(uv).rgb;
  vec3 bil = vec3(0.0);
  float bw = 0.0;
  float g1 = 0.0, w1 = 0.0, g2 = 0.0, w2 = 0.0;
  for (int j = -3; j <= 3; j++) {
    for (int i = -3; i <= 3; i++) {
      vec2 o = vec2(float(i), float(j));
      vec3 c = getColor(uv + o * px).rgb;
      float r2 = dot(o, o);
      float l = lmLuma(c);
      float k1 = exp(-r2 / 2.0);
      float k2 = exp(-r2 / 5.12);
      g1 += l * k1; w1 += k1;
      g2 += l * k2; w2 += k2;
      vec3 dc = c - center;
      float wb = exp(-r2 / 8.0) * exp(-dot(dc, dc) / 0.018);
      bil += c * wb;
      bw += wb;
    }
  }
  g1 /= w1;
  g2 /= w2;
  bil /= bw;

  // Traço: o lado escuro de cada borda, medido em contraste relativo (funciona no escuro e no claro).
  float dog = (g2 - g1) / (g2 + 0.12);
  float t = threshold * 0.03;
  float line = smoothstep(t, t + 0.02 + threshold * 0.02, dog);

  // Cor chapada em Oklab.
  vec3 lab = lmToOklab(lmToLinear(bil));
  float x = clamp(lab.x, 0.0, 1.0) * levels;
  float w = clamp(fwidth(x), 0.04, 0.5);
  float q = (floor(x) + smoothstep(0.5 - w, 0.5 + w, fract(x)) + 0.15) / levels;
  // O patamar mais alto fica abaixo do branco puro: a pele no brilho continua pele (clarinha, com cor), em vez de
  // virar uma mancha branca chapada.
  q = clamp(q, 0.0, 0.9);
  // A croma acompanha o patamar (sem cores sujas nos tons escuros) e ganha vida.
  float ratioL = q / max(lab.x, 1e-3);
  lab.yz *= 1.3 * clamp(mix(1.0, ratioL, 0.5), 0.5, 1.6);
  lab.x = q;
  vec3 flatColor = clamp(lmToSrgb(lmFromOklab(lab)), 0.0, 1.0);

  vec3 ink = vec3(0.035, 0.03, 0.04);
  return vec4(mix(flatColor, ink, line), 1.0);
}
