// Raios de luz volumétricos (god rays): cada ponto junta, no caminho até a origem, a luz das partes claras da imagem
// (em luz linear); o que é escuro no caminho faz sombra no feixe. As amostras são espalhadas por pixel (ruído
// intercalado) e lidas de um nível de detalhe que acompanha o passo entre elas: feixes lisos, sem degraus nem cópias.

/**
 * Soma luz (linear) e só comprime o que passa do joelho: F(base + luz) − F(base) + base, com F = identidade até
 * 0,55 e um ombro exponencial depois. Sem luz, a imagem fica igual; com muita luz, a textura de baixo continua
 * aparecendo (a inclinação nunca cai a zero), em vez de tudo encostar no mesmo branco e a pele "sumir".
 */
vec3 shoulder(vec3 x) {
  const float k = 0.55;
  return mix(x, k + (1.0 - k) * (1.0 - exp(-(x - k) / (1.0 - k))), step(k, x));
}
vec3 addLightSoft(vec3 base, vec3 light) {
  base = max(base, 0.0);
  return base + shoulder(base + max(light, 0.0)) - shoulder(base);
}

vec4 effect(vec2 uv) {
  vec4 base = getColor(uv);
  vec3 lin = lmToLinear(base.rgb);
  float thr = lmToLinear(vec3(threshold)).x;
  float knee = max(thr * 0.5, 0.02);

  const int N = 56;
  vec2 toSrc = source - uv;
  // "Comprimento": que parte do caminho até a origem entra no feixe.
  float reach = mix(0.25, 0.97, (spread - 0.2) / 0.8);
  float pathPx = length(toSrc * vec2(ratio, 1.0)) * reach * resolution.y;
  // Nunca mais nítido que ~8 px de 1080p: perto da origem o caminho é curto e os detalhes do rosto (lábio, dentes,
  // sobrancelha) virariam riscos de luz e sombra que parecem dedos; o feixe de verdade é macio.
  float minLevel = max(3.0 + log2(resolution.y / 1080.0), 0.0);
  float level = clamp(log2(max(pathPx / float(N) * 0.75, 1.0)), minLevel, 6.0);
  float jitter = lmIGN(gl_FragCoord.xy);

  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int i = 0; i < N; i++) {
    float t = (float(i) + jitter) / float(N);
    vec2 q = uv + toSrc * t * reach;
    vec3 s = lmToLinear(getColorLod(q, level).rgb);
    float l = lmLuma(s);
    float soft = clamp(l - thr + knee, 0.0, 2.0 * knee);
    float part = max(soft * soft / (4.0 * knee), l - thr) / max(l, 1e-4);
    // Só as luzes de verdade viram feixe: o peso cresce com o quanto passa do limiar. Um tom médio logo acima dele
    // (a pele, quase sempre) emite pouco, e o rosto não espalha a própria cor por cima do cabelo e do pescoço.
    float over = clamp((l - thr) / max(1.0 - thr, 1e-3), 0.0, 1.0);
    part *= over * over * 1.8;
    // Decaimento ao longo do caminho (espalhamento no ar), como nos raios de luz de tela dos jogos e do cinema.
    float w = exp(-1.6 * t);
    acc += s * part * w;
    wsum += w;
  }
  vec3 rays = acc / max(wsum, 1e-4);
  // Queda suave com a distância até a origem: o feixe some longe dela em vez de cortar.
  float dist = length(toSrc * vec2(ratio, 1.0));
  rays *= exp(-dist * mix(2.2, 0.8, (spread - 0.2) / 0.8)) * 7.0;
  // O feixe é luz espalhada no ar ao longo do caminho: perto da origem o caminho é curto e junta pouca luz. Sem isso,
  // o que está na origem (em geral o rosto) recebia várias vezes a própria luz e virava um borrão branco.
  rays *= 1.0 - exp(-dist / 0.3);
  // O feixe aparece atravessando o escuro (cabelo, sombra); sobre os tons médios e claros ele soma menos, para a pele
  // continuar com volume e textura em vez de ficar lavada (translúcida) por baixo da névoa de luz.
  rays *= mix(1.25, 0.3, smoothstep(0.04, 0.6, lmLuma(lin)));
  vec3 col = addLightSoft(lin, rays * amount);
  return vec4(lmToSrgb(col), 1.0);
}
