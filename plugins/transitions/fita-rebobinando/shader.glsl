// Fita rebobinando (videocassete): a fita acelera e o sinal perde o sincronismo como num VHS de verdade. A
// imagem rola na vertical com a faixa preta do sincronismo, as linhas de vídeo (480) tremem de lado, faixas de
// tracking correm pela tela entortando as linhas e enchendo de riscos brancos, a croma fica borrada e atrasada
// em relação à luma, aparece o ruído da troca de cabeça na base e o chuvisco tem o tamanho de uma linha de
// vídeo (mais forte nas sombras), quadro a quadro a 30 por segundo. No corte, um clarão de chiado esconde a
// troca e o próximo clipe estabiliza aos poucos. O "◀◀" do aparelho aparece no canto enquanto a fita volta.

/** Ruído de 0 a 1 num ponto da grade (linha de vídeo, pedaço da linha, quadro). */
float n3(vec3 p) { return lmHash(p); }

/** "◀◀": dois triângulos apontando para a esquerda, por distância (sem serrilhado). */
float rewindSign(vec2 uv) {
  vec2 p = (vec2(uv.x, 1.0 - uv.y) - vec2(0.07, 0.09)) * vec2(ratio, 1.0) / 0.035;
  float px = 1.0 / (0.035 * resolution.y);
  float s = 0.0;
  for (int i = 0; i < 2; i++) {
    vec2 q = p - vec2(float(i) * 1.05, 0.0);
    // Triângulo: ponta em (0, 0), base em x = 1, meia altura 0,55.
    float d = max(max(-q.x, q.x - 1.0), (abs(q.y) - q.x * 0.55) * 0.876);
    s = max(s, clamp(0.5 - d / px, 0.0, 1.0));
  }
  return s;
}

vec3 sampleClip(bool next, vec2 uv) { return next ? getToColor(uv).rgb : getFromColor(uv).rgb; }

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  bool after = progress >= corte;
  // Velocidade da fita: acelera até o corte; depois o aparelho trava no próximo clipe e o defeito some.
  float speed = after ? 1.0 - lmEaseOutCubic((progress - corte) / max(1.0 - corte, 1e-3)) : lmEaseInCubic(progress / max(corte, 1e-3));
  float amount = forca * speed;
  float frame = floor(progress * 45.0);            // quadros de vídeo (30 por segundo numa transição de 1,5 s)
  float tapeTime = progress * progress * 9.0;      // a fita corre cada vez mais
  float line = floor((1.0 - uv.y) * 480.0);        // linha de vídeo (de cima para baixo)

  // Perda de sincronismo vertical: a imagem rola com a faixa preta do pulso de sincronismo.
  float roll = after ? 0.0 : fract(tapeTime * 0.4) * smoothstep(0.35, 0.8, progress / max(corte, 1e-3)) * forca;
  vec2 p = vec2(uv.x, fract(uv.y - roll));
  // Tremor por linha: suave entre linhas vizinhas (o sinal oscila), muda a cada quadro.
  p.x += lmNoise(vec2(line * 0.045, frame * 0.9)) * lmPx(7.0) / ratio * amount;
  // Faixas de tracking: correm pela tela; dentro delas as linhas entortam (mais no começo da linha).
  float bars = 0.0;
  float n = floor(faixas + 0.5);
  for (int i = 0; i < 5; i++) {
    if (float(i) >= n) break;
    float center = fract(lmHash(vec2(float(i), 4.0)) + tapeTime * (0.11 + 0.07 * float(i)));
    float h = 0.025 + 0.04 * lmHash(vec2(float(i), 8.0));
    float d = abs(p.y - center);
    bars = max(bars, 1.0 - smoothstep(h * 0.4, h, d));
  }
  bars *= amount;
  float skew = (lmNoise(vec2(line * 0.3, frame * 1.7)) * 0.5 + 0.5) * (1.0 - uv.x * 0.7);
  p.x += bars * skew * 0.08;
  // Troca de cabeça: as últimas ~8 linhas da imagem puxadas de lado, com ruído.
  float headZone = smoothstep(472.0, 476.0, line) * smoothstep(0.0, 0.1, amount);
  p.x += headZone * (0.03 + 0.02 * n3(vec3(line, frame, 3.0)));

  // Luma nítida e croma borrada e atrasada (a fita guarda a cor com muito menos banda).
  vec3 c0 = sampleClip(after, fract(p));
  float y = lmLuma(c0);
  vec2 cd = vec2(lmPx(4.0) / ratio, 0.0);
  vec3 cBlur = (sampleClip(after, fract(p + cd)) + sampleClip(after, fract(p + cd * 2.5)) + sampleClip(after, fract(p + cd * 4.0))) / 3.0;
  float chromaMix = clamp(amount * 1.2 + 0.25 * forca, 0.0, 1.0);
  vec3 col = mix(c0, vec3(y) + (cBlur - vec3(lmLuma(cBlur))), chromaMix);
  // A cor some e o brilho pulsa quando a busca acelera.
  col = mix(col, vec3(lmLuma(col)), amount * 0.45);
  col *= 1.0 - 0.18 * amount * (0.5 + 0.5 * sin(tapeTime * 14.0));

  // Chuvisco: grãos do comprimento de um pedaço de linha (≈ 3 px de largura, 1 linha de altura), mais forte
  // nas sombras; riscos brancos compridos dentro das faixas de tracking.
  float seg = floor(uv.x * resolution.x / (3.0 * resolution.y / 480.0));
  float snow = n3(vec3(seg, line, frame));
  float shadowW = 1.0 - smoothstep(0.1, 0.7, lmLuma(col));
  col = mix(col, vec3(snow), (amount * 0.12 + bars * 0.5) * (0.5 + 0.5 * shadowW));
  float streakSeg = floor(uv.x * 24.0 + n3(vec3(line, frame, 1.0)) * 24.0);
  float streak = step(0.93, n3(vec3(streakSeg, line, frame + 0.5)));
  col = mix(col, vec3(0.95), streak * bars * 0.85);
  col = mix(col, vec3(snow), headZone * 0.6);
  // Faixa preta do sincronismo passando junto com a rolagem.
  float syncD = fract(uv.y - roll + 0.02);
  col *= 1.0 - (1.0 - smoothstep(0.0, 0.025, syncD)) * step(0.001, roll);
  // No corte: um clarão de chiado de poucos quadros esconde a troca.
  float burst = 1.0 - smoothstep(0.015, 0.05, abs(progress - corte));
  col = mix(col, vec3(snow * 0.9 + 0.05), burst * forca);
  if (simbolo > 0.5 && !after) {
    float sgn = rewindSign(uv);
    float shadow = rewindSign(uv + vec2(-lmPx(3.0) / ratio, lmPx(3.0)));
    float show = smoothstep(0.02, 0.1, progress);
    col = mix(col, col * 0.3, shadow * 0.6 * show);
    col = mix(col, vec3(1.0), sgn * 0.92 * show);
  }
  return vec4(clamp(col, 0.0, 1.0), 1.0);
}
