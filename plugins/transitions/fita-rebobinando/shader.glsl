float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

/** Dois triângulos para a esquerda no canto, como o aviso do videocassete. */
float rewindSign(vec2 uv) {
  vec2 p = (vec2(uv.x, 1.0 - uv.y) - vec2(0.07, 0.09)) * vec2(ratio, 1.0) / 0.035;
  float s = 0.0;
  for (int i = 0; i < 2; i++) {
    vec2 q = p - vec2(float(i) * 1.05, 0.0);
    // Triângulo com a ponta para a esquerda: largura cresce com x.
    float inside = step(0.0, q.x) * step(q.x, 1.0) * step(abs(q.y), q.x * 0.55);
    s = max(s, inside);
  }
  return s;
}

vec4 transition(vec2 uv) {
  // A fita acelera: o tempo da rebobinada anda mais rápido a cada instante.
  float speed = progress * progress * 14.0;
  float t = speed * progress;
  float amount = forca * (1.0 - smoothstep(corte, 1.0, progress) * 0.85) * smoothstep(0.0, 0.15, progress);
  bool after = progress >= corte;

  // A imagem rola para cima (perdendo o sincronismo) e treme de lado.
  float roll = after ? 0.0 : fract(t * 0.35) * smoothstep(0.25, 0.6, progress / corte) * forca;
  float frame = floor(progress * 60.0);
  vec2 p = vec2(uv.x, fract(uv.y - roll));
  float jitter = (hash(vec2(floor(uv.y * 160.0), frame)) - 0.5) * 0.02 * amount;
  p.x += jitter + sin(uv.y * 30.0 + t * 20.0) * 0.004 * amount;

  // Faixas de tracking: blocos de linhas tortas que correm pela tela, mais rápidas com a fita.
  float bars = 0.0;
  float n = floor(faixas + 0.5);
  for (int i = 0; i < 5; i++) {
    if (float(i) >= n) break;
    float center = fract(hash(vec2(float(i), 4.0)) + t * (0.15 + 0.1 * float(i)));
    float h = 0.03 + 0.04 * hash(vec2(float(i), 8.0));
    float b = 1.0 - smoothstep(0.0, h, abs(uv.y - center));
    bars = max(bars, b);
  }
  bars *= amount;
  p.x += bars * (hash(vec2(floor(uv.y * 300.0), frame + 1.0)) - 0.3) * 0.12;

  vec3 col = after ? getToColor(fract(p)).rgb : getFromColor(fract(p)).rgb;
  // Cor fugindo e brilho pulsando como na busca do videocassete.
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(l), amount * 0.5);
  col *= 1.0 - 0.25 * amount * (0.5 + 0.5 * sin(t * 6.0));
  // Chiado: grão fino na tela toda e riscos brancos dentro das faixas.
  float grain = hash(floor(uv * resolution / 2.0) + frame * 7.3);
  col = mix(col, vec3(grain), amount * 0.15 + bars * 0.7);
  col += step(0.97, hash(vec2(floor(uv.x * 80.0), floor(uv.y * 240.0) + frame))) * bars * 0.8;
  // Faixa preta do sincronismo passando junto com a rolagem.
  col *= 1.0 - (1.0 - smoothstep(0.0, 0.025, fract(uv.y - roll + 0.02)) ) * step(0.001, roll);
  // No corte: um clarão de chiado de dois quadros.
  col = mix(col, vec3(grain), (1.0 - smoothstep(0.0, 0.05, abs(progress - corte))) * forca);
  if (simbolo > 0.5 && !after) col = mix(col, vec3(1.0), rewindSign(uv) * 0.9 * smoothstep(0.02, 0.1, progress));
  return vec4(col, 1.0);
}
