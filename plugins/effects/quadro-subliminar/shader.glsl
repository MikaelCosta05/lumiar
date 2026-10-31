// Quadro subliminar: um ou dois quadros de vídeo (1/30 s cada) emendados na fita. O quadro intruso vem com o
// chiado de uma fita gravada por cima: riscos deitados ao longo das 480 linhas e uma ou outra linha estourada,
// não pontos soltos por pixel.

const float LINES = 480.0;

float hash(vec2 p) { return lmHash(p); }
float luma(vec3 c) { return lmLuma(c); }

float streak(float x, float line, float seed) {
  float i = floor(x);
  float f = x - i;
  f = f * f * (3.0 - 2.0 * f);
  return mix(lmHash(vec3(i, line, seed)), lmHash(vec3(i + 1.0, line, seed)), f) * 2.0 - 1.0;
}

vec4 effect(vec2 uv) {
  vec4 c = getColor(uv);
  // A partir da primeira piscada, uma a cada 1/frequência segundos, num instante sorteado do intervalo.
  float slot = floor((time - inicio) * frequencia);
  float start = inicio + (slot + acaso * hash(vec2(slot, 3.1)) * 0.7) / frequencia;
  float frames = floor(quadros + 0.5);
  float frame = floor((time - start) * 29.97);
  if (slot < 0.0 || time < start || frame >= frames) return c;

  float kind = floor(tipo + 0.5);
  if (kind < 0.5) kind = 1.0 + floor(hash(vec2(slot, 9.7)) * 4.0);
  vec3 col;
  if (kind < 1.5) {
    // Negativo duro, um pouco esverdeado como filme revelado errado.
    col = smoothstep(0.1, 0.9, 1.0 - c.rgb) * vec3(0.85, 1.0, 0.9);
  } else if (kind < 2.5) {
    // Contraste estourado: só preto e branco duros, com um toque de vermelho.
    float l = smoothstep(0.38, 0.48, luma(c.rgb));
    col = mix(vec3(0.02, 0.0, 0.0), vec3(1.0, 0.92, 0.9), l);
  } else if (kind < 3.5) {
    // De cabeça para baixo e escurecida.
    col = getColor(vec2(1.0 - uv.x, 1.0 - uv.y)).rgb * 0.8;
  } else {
    // O rosto de perto, com o contraste lá em cima.
    vec2 p = vec2(ponto.x, 1.0 - ponto.y);
    // Zoom com o ponto parado no lugar: a janela fica sempre dentro do quadro.
    vec2 q = p + (uv - p) / aproximar;
    vec3 z = getColor(q).rgb;
    col = smoothstep(0.1, 0.8, vec3(luma(z))) * vec3(1.0, 0.95, 0.92);
  }
  // Chiado e uma linha torta: o quadro parece emendado na fita.
  float line = floor((1.0 - uv.y) * LINES);
  float seed = slot * 7.0 + frame;
  float n = streak(uv.x * 380.0, line, seed) * 0.6 + streak(uv.x * 120.0, line, seed + 0.5) * 0.4;
  col = mix(col, vec3(0.5 + n * 0.5), ruido * 0.3);
  // Uma ou outra linha estourada, com começo e fim suaves.
  float tear = step(0.992, lmHash(vec3(line, seed, 3.0)));
  float x0 = lmHash(vec3(line, seed, 4.0));
  float run = smoothstep(x0 - 0.02, x0, uv.x) * (1.0 - smoothstep(x0 + 0.2, x0 + 0.45, uv.x));
  col = mix(col, vec3(0.95), tear * run * ruido);
  return vec4(col, c.a);
}
