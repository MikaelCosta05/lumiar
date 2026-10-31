// VHS (NTSC, velocidade SP): a imagem passa pelo caminho de sinal de um videocassete de verdade.
// - Luma (Y) com ~3 MHz de banda (~320 pontos por linha) e o realce de nitidez do aparelho (halo claro e escuro);
// - croma (I/Q) com ~0,5 MHz: borrada na horizontal, atrasada para a direita e misturada com a linha de cima;
// - erro de base de tempo: cada linha desliza um pouco de lado, mudando a cada campo (59,94 por segundo);
// - chiado de luma em riscos curtos ao longo da linha, mais forte no escuro; chiado de croma em manchas compridas;
// - dropouts (riscos brancos de uma linha), faixa de tracking discreta e o ruído da troca de cabeça no pé do quadro;
// - 480 linhas de vídeo, com as linhas de varredura de 240 por campo.

const float LINES = 480.0;

vec3 toYiq(vec3 c) { return mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312) * c; }
vec3 toRgb(vec3 y) { return mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703) * y; }

/** Ruído suave ao longo da linha (x em células), independente de uma linha para a outra: -1 a 1. */
float streak(float x, float line, float seed) {
  float i = floor(x);
  float f = x - i;
  f = f * f * (3.0 - 2.0 * f);
  return mix(lmHash(vec3(i, line, seed)), lmHash(vec3(i + 1.0, line, seed)), f) * 2.0 - 1.0;
}

/** Deslocamento horizontal da linha (em px de 1080p). */
float lineShift(float line, float ypos, float frame, float field, float headLines) {
  // Erro de base de tempo: ondulação lenta entre linhas + tremor fino de cada linha.
  float tbc = lmNoise(vec2(line * 0.031, field * 0.37)) * 2.4 + (lmHash(vec3(line, frame, 3.0)) - 0.5) * 1.1;
  // O topo do quadro "dobra" um pouco (o controle horizontal da TV se ajustando depois do sincronismo).
  float flag = exp(-ypos / 9.0) * (5.0 + 3.0 * lmNoise(vec2(field * 0.21, 7.0)));
  float s = (tbc + flag) * wobble;
  // Troca de cabeça: as últimas linhas puxam para o lado, cada vez mais perto da borda.
  float k = clamp((ypos - (LINES - headLines)) / headLines, 0.0, 1.0);
  float head = clamp((wobble + noise) * 0.9, 0.0, 1.0);
  s += head * k * k * (34.0 + 18.0 * lmHash(vec3(line, frame, 5.0)));
  return s;
}

/** Luma suave e luma larga (para o realce), lidas ao longo da linha. */
vec2 lumaAt(vec2 uv, vec2 px) {
  float soft = 0.0, wide = 0.0, ws = 0.0, ww = 0.0;
  for (int i = -4; i <= 4; i++) {
    float o = float(i) * 1.5;
    float y = lmLuma(getColor(uv + vec2(o * px.x, 0.0)).rgb);
    float a = exp(-o * o / (2.0 * 1.3 * 1.3));
    float b = exp(-o * o / (2.0 * 3.6 * 3.6));
    soft += y * a; ws += a;
    wide += y * b; ww += b;
  }
  return vec2(soft / ws, wide / ww);
}

vec4 effect(vec2 uv) {
  float frame = floor(time * 29.97);
  float field = floor(time * 59.94);
  float ypos = (1.0 - uv.y) * LINES; // 0 no topo
  float line = floor(ypos);
  vec2 px = lmPxUv(1.0); // 1 px de 1080p
  float headLines = 10.0;

  float shift = lineShift(line, ypos, frame, field, headLines);

  // Faixa de tracking: anda devagar e às vezes quase some.
  float bandY = fract(0.82 - time * 0.043 + lmNoise(vec2(time * 0.21, 3.0)) * 0.06) * LINES;
  float bd = abs(ypos - bandY);
  bd = min(bd, LINES - bd);
  float band = exp(-bd * bd / (2.0 * 9.0 * 9.0)) * noise * (0.55 + 0.45 * lmNoise(vec2(time * 0.5, 9.0)));
  shift += band * (lmHash(vec3(line, frame, 8.0)) - 0.3) * 14.0;

  vec2 p = vec2(uv.x - shift * px.x, uv.y);

  // Luma: banda curta e realce (peaking).
  vec2 ly = lumaAt(p, px);
  float Y = ly.x + 0.85 * (ly.x - ly.y);

  // Croma: borrada e atrasada; as amostras alternam com a linha de cima (o filtro de 1H do aparelho).
  vec2 iq;
  if (bleed <= 0.0) {
    iq = toYiq(getColor(p).rgb).yz;
  } else {
    float sigma = bleed * 1.5;      // em largura de quadro
    float delay = bleed * 0.8;
    vec2 sum = vec2(0.0);
    float tot = 0.0;
    float above = 1.0 / LINES;
    for (int i = 0; i < 16; i++) {
      float k = (float(i) - 7.5) / 7.5 * 2.4;
      float w = exp(-0.5 * k * k);
      vec2 q = vec2(p.x - delay + k * sigma, p.y + (i % 2 == 0 ? 0.0 : above));
      sum += toYiq(getColor(q).rgb).yz * w;
      tot += w;
    }
    iq = sum / tot;
  }

  // O sinal da fita: preto um pouco levantado, cor levemente mais carregada.
  Y = Y * 0.93 + 0.035;
  iq *= 1.1;

  // Chiado de luma: riscos curtos ao longo da linha, mais forte no escuro; muda a cada quadro de vídeo.
  float shadows = mix(1.25, 0.55, clamp(Y, 0.0, 1.0));
  float ln = streak(uv.x * 420.0, line, frame) * 0.7 + streak(uv.x * 160.0, line, frame + 0.5) * 0.3;
  Y += ln * noise * 0.085 * shadows;
  // Chiado de croma: manchas compridas de cor.
  iq += vec2(streak(uv.x * 55.0, line, frame + 0.25), streak(uv.x * 48.0, line, frame + 0.75)) * noise * 0.045;

  // Dentro da faixa de tracking: riscos brancos finos.
  float spark = smoothstep(0.55, 0.95, streak(uv.x * 260.0, line, frame + 0.125));
  Y = mix(Y, 0.95, spark * band * 0.9);

  // Dropouts: o óxido faltou num trecho da fita: um risco branco de uma linha, com rabo.
  float hasDrop = step(1.0 - noise * 0.006, lmHash(vec3(line, frame, 11.0)));
  if (hasDrop > 0.0) {
    float x0 = lmHash(vec3(line, frame, 12.0));
    float len = 0.012 + 0.07 * lmHash(vec3(line, frame, 13.0));
    float t = (uv.x - x0) / len;
    float d = smoothstep(-0.05, 0.0, t) * (1.0 - smoothstep(0.6, 1.0, t)) * (0.75 + 0.25 * streak(uv.x * 300.0, line, frame));
    Y = mix(Y, 1.0, d);
    iq *= 1.0 - d;
  }

  // Troca de cabeça: chiado nas últimas linhas.
  float hk = clamp((ypos - (LINES - headLines)) / headLines, 0.0, 1.0);
  float head = clamp((wobble + noise) * 0.9, 0.0, 1.0) * step(0.0001, hk);
  Y = mix(Y, Y * 0.6 + 0.25 + streak(uv.x * 300.0, line, frame + 0.375) * 0.3, head * (0.3 + 0.5 * hk));
  iq *= 1.0 - head * hk * 0.6;

  // O que a linha empurrou para dentro pela esquerda é o apagamento do sinal (preto), não a borda esticada.
  float inside = smoothstep(0.0, px.x * 2.0, p.x) * smoothstep(0.0, px.x * 2.0, 1.0 - p.x);
  Y = mix(0.03 + abs(streak(uv.x * 300.0, line, frame + 0.625)) * 0.08 * noise, Y, inside);
  iq *= inside;

  vec3 col = toRgb(vec3(Y, iq));

  // Linhas de varredura (240 por campo), mais marcadas no escuro (o feixe engorda na luz); somem quando a tela
  // é pequena demais para mostrá-las sem moiré.
  float pitch = resolution.y / 240.0;
  float scan = 0.5 - 0.5 * cos(ypos * PI);
  float lum = clamp(lmLuma(col), 0.0, 1.0);
  float depth = lines * mix(0.42, 0.18, lum) * smoothstep(1.6, 3.2, pitch);
  col *= 1.0 - depth * scan;
  col *= 1.0 + depth * 0.5;

  col = lmSoftClip(max(col, 0.0), 0.88);
  return vec4(clamp(col, 0.0, 1.0), 1.0);
}
