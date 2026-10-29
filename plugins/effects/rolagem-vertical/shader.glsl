float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec4 effect(vec2 uv) {
  float frame = floor(time * 30.0);
  // Um "quadro" da TV = a imagem + o intervalo de apagamento (a faixa preta).
  float gap = barra * 0.14;
  float period = 1.0 + gap;
  float roll = fract(deslocamento + time * velocidade);
  // Parada no lugar (sem velocidade e sem deslocamento), a imagem fica limpa: nada de faixa nem linhas tortas.
  float rolling = max(step(0.001, abs(velocidade)), smoothstep(0.0, 0.03, min(roll, 1.0 - roll)));
  if (rolling <= 0.0) return getColor(uv);
  float shake = (hash(vec2(frame, 1.3)) - 0.5) * 0.012 * tremor * rolling;
  float p = mod(uv.y - roll * period + shake, period);

  if (p > 1.0) {
    // Dentro da faixa: preto, com a linha de sincronismo mais clara no meio.
    float m = (p - 1.0) / max(gap, 1e-4);
    float sync = (1.0 - smoothstep(0.0, 0.12, abs(m - 0.55))) * 0.22;
    float n = hash(vec2(floor(uv.x * resolution.x / 3.0), floor(uv.y * 240.0) + frame)) * 0.08;
    return vec4(vec3(sync + n), 1.0);
  }

  // As primeiras linhas depois da faixa entortam para o lado (o horizontal ainda está se acertando).
  float skew = exp(-p * 28.0) * 0.05 * (0.5 + tremor) * step(0.001, gap) * rolling;
  float row = floor(p * 240.0);
  float jitter = (hash(vec2(row, frame)) - 0.5) * 0.004 * tremor * rolling;
  vec3 col = getColor(vec2(uv.x + skew + jitter, p)).rgb;
  // A parte de cima da imagem fica mais escura perto da faixa.
  col *= 1.0 - 0.35 * exp(-(1.0 - p) * 30.0) * step(0.001, gap) * rolling;
  return vec4(col, 1.0);
}
