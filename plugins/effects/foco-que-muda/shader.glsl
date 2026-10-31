// Foco que muda (rack focus) com profundidade de campo de lente. O círculo de confusão de cada ponto cresce com a
// distância dele ao plano de foco (fora da "Faixa nítida"), e o desfoque é montado como numa lente: cada vizinho só
// entra se o desfoque dele chega até aqui; o que está atrás só se espalha até onde este ponto também está desfocado
// (o fundo borrado não invade a pessoa nítida, e a pessoa nítida não deixa halo no fundo); o que está na frente se
// espalha por cima de tudo. Soma em luz linear com as altas luzes expandidas antes (viram discos de bokeh claros) e
// comprimidas depois. A mudança de foco tem aceleração e freio (ease in-out), como a mão de um foquista.

const float MAX_PX = 34.0; // raio máximo do desfoque, em px de 1080p, com "Desfoque" = 1

float focusNow() {
  return mix(de, para, lmEaseInOutCubic(clamp((time - inicio) / max(duracaoFoco, 1e-3), 0.0, 1.0)));
}

/** Raio do desfoque (px desta resolução) de um ponto com essa profundidade. */
float cocPx(float depth, float focus) {
  float x = max(abs(depth - focus) - nitido, 0.0) / max(1.0 - nitido, 0.01) * 1.6;
  return clamp(x, 0.0, 1.0) * forca * MAX_PX * resolution.y / 1080.0;
}

// Altas luzes "acima do branco" para o bokeh (e a volta exata depois).
vec3 expandHi(vec3 c) { return c / max(1.0 - c * 0.8, 0.2); }
vec3 compressHi(vec3 e) { return e / (1.0 + e * 0.8); }

vec4 effect(vec2 uv) {
  vec4 base = getColor(uv);
  float searchR = forca * MAX_PX * resolution.y / 1080.0;
  if (searchR < 0.5) return base;
  float focus = focusNow();
  float cd = getDepth(uv);
  float cc = cocPx(cd, focus);

  const int N = 30;
  // Área que cada amostra representa: o peso de um vizinho é a fração da luz dele que cai neste pixel.
  float areaPer = searchR * searchR / float(N);
  float ownW = 1.0 / max(cc * cc, 0.6);
  vec3 sum = expandHi(lmToLinear(base.rgb)) * ownW;
  float total = ownW;
  float spin = lmIGN(gl_FragCoord.xy) * 6.28318530718;
  for (int i = 0; i < N; i++) {
    float rn = sqrt((float(i) + 0.5) / float(N));
    float a = float(i) * 2.39996323 + spin;
    float r = rn * searchR;
    vec2 p = uv + vec2(cos(a), sin(a)) * r / resolution;
    float sd = getDepth(p);
    float sc = cocPx(sd, focus);
    // Atrás deste ponto (mais longe): só se espalha até onde este ponto também está desfocado.
    float behind = smoothstep(-0.015, 0.015, cd - sd);
    float eff = mix(sc, min(sc, cc), behind);
    float cover = clamp(eff - r + 1.0, 0.0, 1.0);
    if (cover <= 0.0) continue;
    float w = cover * areaPer / max(eff * eff, 0.6);
    // Amostras muito desfocadas podem vir de um nível já filtrado (menos chuvisco no disco).
    vec3 s = lmToLinear(getColorLod(p, clamp(log2(max(eff * 0.25, 1.0)), 0.0, 2.0)).rgb);
    sum += expandHi(s) * w;
    total += w;
  }
  vec3 col = compressHi(sum / total);
  return vec4(lmToSrgb(col), base.a);
}
