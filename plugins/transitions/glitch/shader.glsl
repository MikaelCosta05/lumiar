// Glitch de dado corrompido: a imagem quebra como um vídeo digital com erro de transmissão. Fatias de linhas
// de macrobloco (16 px de 1080p) escorregam de lado aos saltos, com as cores separadas; em algumas linhas o erro
// começa num bloco e se arrasta até o fim da linha (como no arquivo de verdade), com blocos que só guardam a cor
// média, puxados do lugar errado e com croma trocado (verde/magenta). Cada fatia troca para o próximo clipe num
// quadro diferente. O defeito vem quadro a quadro (cerca de 30 por segundo), é mais forte no meio e some nas pontas.

vec3 toYcc(vec3 c) { return vec3(lmLuma(c), (c.b - lmLuma(c)) * 0.5389, (c.r - lmLuma(c)) * 0.6350); }
vec3 fromYcc(vec3 y) { float r = y.x + y.z / 0.6350; float b = y.x + y.y / 0.5389; return vec3(r, (y.x - 0.2126 * r - 0.0722 * b) / 0.7152, b); }

vec4 readClip(bool next, vec2 uv) { return next ? getToColor(uv) : getFromColor(uv); }
vec4 readClipLod(bool next, vec2 uv, float level) { return next ? getToColorLod(uv, level) : getFromColorLod(uv, level); }

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  float env = pow(lmBell(progress), 0.7) * intensity;
  float frame = floor(progress * 36.0);
  float blockPx = 16.0 * resolution.y / 1080.0;
  vec2 pix = vec2(gl_FragCoord.x, resolution.y - gl_FragCoord.y);
  vec2 cell = floor(pix / blockPx);
  vec2 grid = ceil(resolution / blockPx);
  float slice = floor(cell.y / 3.0);

  // Cada fatia troca de clipe num quadro próprio (entre 20% e 80% do caminho).
  float thr = mix(0.5, lmHash(vec2(slice, 7.0)), 0.6);
  bool next = progress > thr;

  // Fatias que escorregam de lado (em passos de macrobloco), com a imagem dando a volta como numa linha de dado.
  vec2 suv = uv;
  float hs = lmHash(vec3(slice, frame, 1.0));
  float split = 0.0;
  if (hs < 0.45 * env) {
    float shiftBlocks = floor((lmHash(vec3(slice, frame, 2.0)) - 0.5) * 24.0 * env);
    suv.x = fract(uv.x + shiftBlocks * blockPx / resolution.x);
    split = (0.3 + 0.7 * lmHash(vec3(slice, frame, 3.0))) * lmPx(10.0) * env / ratio;
    // Fatia que escorregou às vezes vem do outro clipe (dado do quadro errado).
    if (lmHash(vec3(slice, frame, 4.0)) < 0.3) next = !next;
  }
  vec4 col = readClip(next, suv);
  if (split > 0.0) {
    col.r = readClip(next, vec2(fract(suv.x + split), suv.y)).r;
    col.b = readClip(next, vec2(fract(suv.x - split), suv.y)).b;
  }

  // Erro que começa num bloco e vai até o fim da linha (às vezes pega a linha de baixo também).
  float rowHit = lmHash(vec3(cell.y, frame, 5.0));
  float rowAbove = lmHash(vec3(cell.y - 1.0, frame, 5.0));
  float startCol = floor(lmHash(vec3(cell.y, frame, 6.0)) * grid.x);
  float startAbove = floor(lmHash(vec3(cell.y - 1.0, frame, 6.0)) * grid.x * 0.5);
  bool corrupt = (rowHit < 0.12 * env && cell.x >= startCol) || (rowAbove < 0.05 * env && cell.x >= startAbove);
  // E blocos soltos.
  corrupt = corrupt || lmHash(vec3(cell, frame + 0.5)) < 0.01 * env;
  if (corrupt) {
    // Vetor de movimento errado (igual para uma fileira de blocos) e só a cor média do bloco.
    float run = floor(cell.x / 5.0);
    vec2 wrong = (lmHash2(vec2(run * 3.1 + cell.y, frame)) - 0.5) * 8.0 * blockPx / resolution;
    vec2 center = (cell + 0.5) * blockPx / resolution;
    center.y = 1.0 - center.y;
    float level = log2(blockPx);
    vec3 dc = readClipLod(next, center + wrong, level).rgb;
    vec3 low = readClipLod(next, uv + wrong, level - 1.5).rgb;
    vec3 blockCol = mix(dc, low, 0.4);
    // Croma do bloco trocado ou exagerado (o verde e o magenta típicos de dado quebrado).
    vec3 ycc = toYcc(blockCol);
    float kind = lmHash(vec3(run, cell.y, frame + 9.0));
    if (kind < 0.35) ycc.yz = vec2(-0.12, -0.14);
    else if (kind < 0.6) ycc.yz = vec2(0.1, 0.13);
    else ycc.yz *= 2.2;
    col.rgb = clamp(fromYcc(ycc), 0.0, 1.0);
  }
  return vec4(col.rgb, 1.0);
}
