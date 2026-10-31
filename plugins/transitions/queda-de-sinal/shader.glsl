// Queda de sinal (TV digital com sinal fraco): a imagem trava no quadro do começo, se desmancha em macroblocos
// que só guardam a cor média e um degradê (as frequências altas somem, como no MPEG quebrado), puxados do lugar
// errado por fileiras de vetores de movimento ruins e alguns com o croma errado (verde/magenta); o defeito vem
// em manchas que se arrastam pela linha. Quando o sinal volta, cada bloco já volta no próximo clipe.
// "Tamanho dos blocos" em pixels de 720p, como antes (o mesmo valor dá o mesmo bloco).

/** Guarda o quadro do começo da transição: a imagem "trava" ali enquanto o sinal cai. */
vec4 state(vec2 uv) {
  if (firstFrame() || progress < 0.04 || travar < 0.5) return getFromColor(uv);
  return getPrevious(uv);
}

vec3 toYcc(vec3 c) { float y = lmLuma(c); return vec3(y, (c.b - y) * 0.5389, (c.r - y) * 0.6350); }
vec3 fromYcc(vec3 y) { float r = y.x + y.z / 0.6350; float b = y.x + y.y / 0.5389; return vec3(r, (y.x - 0.2126 * r - 0.0722 * b) / 0.7152, b); }

float smoothNoise(vec2 p) { return 0.5 + 0.5 * lmNoise(p); }

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  float blockPx = max(tamanho * resolution.y / 720.0, 2.0);
  vec2 grid = resolution / blockPx;
  vec2 cell = floor(uv * grid);
  vec2 local = fract(uv * grid);
  // O defeito muda em saltos (como pacotes perdidos), não a cada pixel de tempo.
  float stage = floor(progress * 12.0);
  // Manchas: blocos vizinhos quebram juntos e o erro se arrasta pela linha.
  float blot = smoothNoise(vec2(cell.x * 0.12 - cell.y * 0.05, cell.y * 0.35));
  float breakAt = 0.06 + blot * 0.4 + lmHash(cell + 0.5) * 0.06;
  float healAt = 0.5 + smoothNoise(cell * 0.2 + 7.0) * 0.36 + lmHash(cell * 1.7 + 3.0) * 0.06;
  vec2 run = floor(cell / vec2(4.0, 1.0));
  float broken = step(breakAt, progress) * (1.0 - step(healAt, progress));
  broken *= step(lmHash(run + stage * 3.1), 0.35 + defeitos * 0.65);

  bool after = progress >= healAt;
  vec4 frozen = getPrevious(uv);
  vec3 col = after ? getToColor(uv).rgb : frozen.rgb;
  if (broken > 0.5) {
    // Vetor de movimento errado, igual numa fileira de blocos: o pedaço puxa a imagem de outro lugar.
    vec2 wrong = (lmHash2(run + stage) - 0.5) * 4.0 / grid;
    vec2 center = (cell + 0.5) / grid + wrong;
    bool next = lmHash(run + stage + 9.0) < progress;
    // Só a média (DC) e um degradê de baixa frequência sobrevivem: lidos no mapa de níveis.
    float level = log2(blockPx);
    vec3 avg = next ? getToColorLod(center, level).rgb : getPrevious(center).rgb;
    vec3 low = next ? getToColorLod(uv + wrong, level - 1.5).rgb : getPrevious(uv + wrong).rgb;
    vec3 blocky = mix(avg, low, 0.35) * (0.94 + 0.12 * local.y);
    // Fileiras de croma errado: verde ou magenta, mantendo o brilho (em YCbCr).
    float tint = step(1.0 - cores * 0.35, lmHash(run * 2.3 + stage));
    vec3 ycc = toYcc(blocky);
    vec2 wrongChroma = lmHash(run + 7.0) > 0.5 ? vec2(-0.1, -0.12) : vec2(0.09, 0.12);
    ycc.yz = mix(ycc.yz, wrongChroma, tint * 0.85);
    col = clamp(fromYcc(ycc), 0.0, 1.0);
  }
  return vec4(col, 1.0);
}
