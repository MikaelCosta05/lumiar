// Erro de tracking: a cabeça de vídeo sai de cima da trilha gravada e lê metade sinal, metade ruído. Aparece uma
// faixa onde as linhas perdem o sincronismo (deslizam de lado, cada uma um pouco diferente), a imagem desbota e
// perde a cor, e o ruído vira riscos brancos deitados ao longo das linhas. Logo atrás da faixa as linhas ainda
// entortam. A faixa anda devagar e dá trancos; o defeito muda a cada quadro de vídeo (29,97 por segundo) e é
// medido em 480 linhas, então tem o mesmo tamanho em qualquer resolução.

const float LINES = 480.0;

float streak(float x, float line, float seed) {
  float i = floor(x);
  float f = x - i;
  f = f * f * (3.0 - 2.0 * f);
  return mix(lmHash(vec3(i, line, seed)), lmHash(vec3(i + 1.0, line, seed)), f) * 2.0 - 1.0;
}

vec4 effect(vec2 uv) {
  float t = time * velocidade;
  float frame = floor(time * 29.97);
  float yd = 1.0 - uv.y; // 0 no topo
  float line = floor(yd * LINES);

  // A faixa desce devagar e às vezes dá um tranco (o servo do tracking corrigindo).
  float center = fract(0.25 + t * 0.13 + lmNoise(vec2(t * 0.7, 1.3)) * 0.18 + step(0.8, lmHash(vec2(floor(t * 1.5), 2.0))) * 0.04);
  float d = yd - center;
  d -= floor(d + 0.5);
  // Borda irregular: a largura muda de linha para linha.
  float hw = largura * 0.5 * (0.8 + 0.35 * lmNoise(vec2(line * 0.15, frame * 0.4)));
  float core = 1.0 - smoothstep(hw * 0.35, hw, abs(d));
  // Atrás da faixa (em cima dela) as linhas ainda puxam para o lado e vão se acertando.
  float tail = d < 0.0 ? exp(d / max(largura * 0.6, 0.01)) * (1.0 - core) * 0.5 : 0.0;
  float k = clamp(core + tail, 0.0, 1.0) * intensidade;

  // Deslocamento de cada linha (px de 1080p): um tranco sorteado por linha e uma curva suave.
  float jerk = (lmHash(vec3(line, frame, 1.0)) - 0.35) * 70.0;
  float bend = lmNoise(vec2(line * 0.05, t * 2.0)) * 30.0 + 12.0;
  float shift = (jerk * core + bend) * k;
  vec2 p = vec2(uv.x - lmPxUv(shift).x, uv.y);

  vec3 col = getColor(p).rgb;
  // Apagamento: o que entra pela esquerda é preto do sinal, não a borda esticada.
  float inside = smoothstep(0.0, lmPxUv(2.0).x, p.x) * smoothstep(0.0, lmPxUv(2.0).x, 1.0 - p.x);
  col *= inside;

  // Dentro da faixa: sem cor, contraste lavado e o preto subindo.
  float l = lmLuma(col);
  float inBand = core * intensidade;
  col = mix(col, vec3(l * 0.75 + 0.14), inBand * 0.75);

  // Riscos brancos: o ruído da trilha vizinha, deitado ao longo das linhas, mais denso no miolo.
  // Cada linha lê mais ou menos da trilha vizinha: umas quase limpas, outras cheias de riscos.
  float lineLuck = lmHash(vec3(line, frame, 4.0));
  float density = ruido * core * core * intensidade * (0.35 + 0.9 * lineLuck * lineLuck);
  float s = streak(uv.x * 140.0, line, frame) * 0.6 + streak(uv.x * 520.0, line, frame + 0.5) * 0.4;
  float edge0 = 1.0 - density * 0.8;
  float white = smoothstep(edge0, edge0 + 0.18, s * 0.5 + 0.5);
  col = mix(col, vec3(0.93), white * 0.85);
  // Chuvisco fino por baixo dos riscos.
  col += streak(uv.x * 600.0, line, frame + 0.25) * density * 0.12;
  return vec4(clamp(col, 0.0, 1.0), 1.0);
}
