// Ruído da troca de cabeça: o videocassete alterna entre as duas cabeças de vídeo uns poucos linhas antes do fim
// de cada campo. Ali o sincronismo horizontal se perde: a partir da linha da troca a imagem salta de lado e entorta
// cada vez mais até a borda de baixo, perde a cor, ganha chiado em riscos deitados e uma linha clara de ruído marca
// o ponto da troca. A altura respira um pouco e tudo muda a cada campo (59,94 por segundo), em 480 linhas.

const float LINES = 480.0;

float streak(float x, float line, float seed) {
  float i = floor(x);
  float f = x - i;
  f = f * f * (3.0 - 2.0 * f);
  return mix(lmHash(vec3(i, line, seed)), lmHash(vec3(i + 1.0, line, seed)), f) * 2.0 - 1.0;
}

vec4 effect(vec2 uv) {
  float field = floor(time * 59.94);
  float yb = uv.y * LINES;                 // linhas a partir de baixo
  float line = floor(yb);
  // A linha da troca respira um pouco de campo para campo.
  float h = altura * LINES * (1.0 + (lmHash(vec2(field, 9.1)) - 0.5) * 0.35 * tremor);
  if (yb > h + 2.0) return getColor(uv);

  float k = clamp(1.0 - yb / max(h, 1e-3), 0.0, 1.0); // 0 na troca, 1 na borda de baixo
  float below = step(yb, h);
  // Salto na troca + curva até a borda (px de 1080p), com o tremor de cada linha.
  float shift = deslocamento * (14.0 + 90.0 * k * k) * below;
  shift += (lmHash(vec3(line, field, 1.0)) - 0.5) * 16.0 * tremor * below;
  shift += lmNoise(vec2(line * 0.2, field * 0.3)) * 8.0 * tremor * below;
  vec2 p = vec2(uv.x - lmPxUv(shift).x, uv.y);

  vec3 col = getColor(p).rgb;
  // O que entrou pela esquerda é o apagamento do sinal: preto com um resto de chiado.
  float inside = smoothstep(0.0, lmPxUv(2.0).x, p.x);
  col = mix(vec3(0.02 + 0.06 * abs(streak(uv.x * 300.0, line, field + 0.6))), col, inside);
  // Sem cor e um pouco mais escuro perto da borda.
  float l = lmLuma(col);
  col = mix(col, vec3(l), 0.7 * k * below) * (1.0 - 0.25 * k * below);

  // Chiado em riscos ao longo das linhas.
  float n = streak(uv.x * 380.0, line, field) * 0.7 + streak(uv.x * 120.0, line, field + 0.5) * 0.3;
  col += n * ruido * (0.08 + 0.22 * k) * below;
  float white = smoothstep(0.75, 0.95, streak(uv.x * 90.0, line, field + 0.25) * 0.5 + 0.5) * ruido * below;
  col = mix(col, vec3(0.9), white * 0.6 * (0.3 + 0.7 * k));

  // A linha da troca: uma ou duas linhas claras e chiadas.
  float sw = (yb - h) / 1.2;
  float atSwitch = exp(-sw * sw) * deslocamento;
  col = mix(col, vec3(0.75 + 0.25 * streak(uv.x * 200.0, line, field + 0.75)), atSwitch * 0.6);
  return vec4(clamp(col, 0.0, 1.0), 1.0);
}
