float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

/** Guarda o quadro do começo da transição: a imagem "trava" ali enquanto o sinal cai. */
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

vec4 state(vec2 uv) {
  if (firstFrame() || progress < 0.04 || travar < 0.5) return getFromColor(uv);
  return getPrevious(uv);
}

vec4 transition(vec2 uv) {
  vec2 blockPx = vec2(tamanho) * resolution.y / 720.0;
  vec2 grid = resolution / blockPx;
  vec2 cell = floor(uv * grid);
  vec2 local = fract(uv * grid);
  // O defeito se espalha: cada bloco quebra num instante e volta (já no próximo clipe) mais tarde.
  float stage = floor(progress * 12.0);
  // Os defeitos vêm em manchas (blocos vizinhos quebram juntos) e se arrastam pela linha, como um
  // erro no arquivo que estraga o resto da fileira.
  float blot = vnoise(vec2(cell.x * 0.12 - cell.y * 0.05, cell.y * 0.35));
  float breakAt = 0.06 + blot * 0.4 + hash(cell + 0.5) * 0.06;
  float healAt = 0.5 + vnoise(cell * 0.2 + 7.0) * 0.36 + hash(cell * 1.7 + 3.0) * 0.06;
  float broken = step(breakAt, progress) * (1.0 - step(healAt, progress));
  broken *= step(hash(floor(cell / vec2(4.0, 1.0)) + stage * 3.1), 0.35 + defeitos * 0.65);

  bool after = progress >= healAt;
  vec4 frozen = getPrevious(uv);
  vec3 col = after ? getToColor(uv).rgb : frozen.rgb;
  if (broken > 0.5) {
    // Vetor de movimento errado, igual numa fileira de blocos: o pedaço puxa a imagem de outro lugar
    // e só a cor média de cada bloco sobrevive.
    vec2 run = floor(cell / vec2(4.0, 1.0));
    vec2 wrong = (vec2(hash(run + stage), hash(run - stage)) - 0.5) * 4.0 / grid;
    vec2 center = (cell + 0.5) / grid + wrong;
    bool next = hash(run + stage + 9.0) < progress;
    vec3 avg = next ? getToColor(center).rgb : getPrevious(center).rgb;
    vec3 detail = next ? getToColor(uv + wrong).rgb : getPrevious(uv + wrong).rgb;
    // Só um degradê dentro do bloco (as frequências altas sumiram).
    vec3 blocky = mix(avg, detail, 0.3) * (0.92 + 0.16 * local.y);
    // Fileiras de cor errada: verde e magenta, típicos da imagem digital quebrada.
    float tint = step(1.0 - cores * 0.35, hash(run * 2.3 + stage));
    blocky = mix(blocky, blocky * (hash(run + 7.0) > 0.5 ? vec3(0.55, 1.2, 0.6) : vec3(1.2, 0.55, 1.15)), tint);
    col = blocky;
  }
  return vec4(col, 1.0);
}
