// Rolagem vertical: a TV perde o sincronismo vertical e a imagem rola. Entre um quadro e o seguinte aparece o
// intervalo de apagamento vertical: preto, com o pulso de sincronismo (um pouco diferente do preto) e, perto do fim,
// as linhas de dados (a linha 21 da legenda oculta, tracinhos claros que mudam a cada quadro). As primeiras linhas
// depois da faixa entortam para o lado, porque o horizontal ainda está se acertando. O que a linha empurra para
// dentro pela borda é o apagamento horizontal (preto), não a borda esticada.

const float LINES = 480.0;

vec4 effect(vec2 uv) {
  float frame = floor(time * 29.97);
  // Um "quadro" da TV = a imagem + o intervalo de apagamento (a faixa preta).
  float gap = barra * 0.14;
  float period = 1.0 + gap;
  float roll = fract(deslocamento + time * velocidade);
  // Parada no lugar (sem velocidade e sem deslocamento), a imagem fica limpa: nada de faixa nem linhas tortas.
  float rolling = max(step(0.001, abs(velocidade)), smoothstep(0.0, 0.03, min(roll, 1.0 - roll)));
  if (rolling <= 0.0) return getColor(uv);
  float shake = (lmHash(vec2(frame, 1.3)) - 0.5) * 0.012 * tremor * rolling;
  float p = mod(uv.y - roll * period + shake, period);

  if (p > 1.0) {
    // Dentro do intervalo: preto, o pulso de sincronismo e as linhas de dados no fim.
    float m = (p - 1.0) / max(gap, 1e-4); // 0 junto do topo da imagem, 1 no outro lado
    float line = 21.0 - floor(m * 22.0);  // as ~22 linhas do intervalo, na ordem da varredura
    float sync = (1.0 - smoothstep(0.0, 0.08, abs(m - 0.75))) * 0.06;
    float data = 0.0;
    if (line > 19.5) {
      // Tracinhos da legenda oculta: bits claros que mudam a cada quadro.
      float fx = uv.x * 34.0;
      float b0 = step(0.5, lmHash(vec3(floor(fx), line, frame)));
      float b1 = step(0.5, lmHash(vec3(floor(fx) + 1.0, line, frame)));
      float w = 34.0 / resolution.x; // um pixel, em bits
      data = mix(b0, b1, smoothstep(1.0 - w, 1.0, fract(fx))) * smoothstep(0.05, 0.12, uv.x) * 0.7;
    }
    float n = lmHash(vec3(floor(uv.x * 420.0), floor(m * 22.0 * 4.0), frame)) * 0.035;
    return vec4(vec3(0.015 + sync + data + n), 1.0);
  }

  // As primeiras linhas depois da faixa entortam para o lado.
  float row = floor(p * LINES);
  float skew = exp(-p * 28.0) * 0.05 * (0.5 + tremor) * step(0.001, gap) * rolling;
  float jitter = (lmHash(vec2(row, frame)) - 0.5) * 0.004 * tremor * rolling;
  float x = uv.x - skew - jitter;
  vec3 col = getColor(vec2(x, p)).rgb;
  float inside = smoothstep(0.0, lmPxUv(2.0).x, x) * smoothstep(0.0, lmPxUv(2.0).x, 1.0 - x);
  col *= inside;
  // A parte de cima da imagem fica mais escura perto da faixa.
  col *= 1.0 - 0.35 * exp(-(1.0 - p) * 30.0) * step(0.001, gap) * rolling;
  return vec4(col, 1.0);
}
