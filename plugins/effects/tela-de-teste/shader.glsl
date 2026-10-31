// Tela de teste: as barras coloridas de 75% (padrão SMPTE: sete barras, a faixa de "castelos" e o pé com -I,
// branco, +Q e o PLUGE) e o "sem sinal" com chiado entram e saem por cima da imagem. Tudo chega como sinal
// analógico: as barras passam pela banda do vídeo (borda macia, sem serrilhado), o chiado tem a forma do ruído de
// vídeo (grãos deitados ao longo das 480 linhas, gaussianos, a cada campo) e as linhas tremem de lado.

const float LINES = 480.0;

float snow(float x, float line, float seed) {
  float i = floor(x);
  float f = x - i;
  f = f * f * (3.0 - 2.0 * f);
  float a = lmGaussianNoise(vec3(i, line, seed));
  float b = lmGaussianNoise(vec3(i + 1.0, line, seed));
  return mix(a, b, f) / sqrt(f * f + (1.0 - f) * (1.0 - f));
}

/** Barras coloridas genéricas: sete barras em cima, a faixa invertida no meio e o pé com preto e branco. */
vec3 bars(vec2 p) {
  // p em coordenadas de tela (y para baixo).
  float i = floor(p.x * 7.0);
  vec3 top[7];
  top[0] = vec3(0.75); top[1] = vec3(0.75, 0.75, 0.0); top[2] = vec3(0.0, 0.75, 0.75); top[3] = vec3(0.0, 0.75, 0.0);
  top[4] = vec3(0.75, 0.0, 0.75); top[5] = vec3(0.75, 0.0, 0.0); top[6] = vec3(0.0, 0.0, 0.75);
  int k = int(clamp(i, 0.0, 6.0));
  if (p.y < 0.67) return top[k];
  if (p.y < 0.75) {
    // Faixa do meio: as cores na ordem inversa, alternando com preto.
    int m = 6 - k;
    return (k % 2 == 0) ? top[m] : vec3(0.04);
  }
  // Pé: azul-escuro, branco, roxo, preto e três cinzas bem escuros.
  float x = p.x * 6.0;
  if (x < 1.0) return vec3(0.0, 0.13, 0.3);
  if (x < 2.0) return vec3(1.0);
  if (x < 3.0) return vec3(0.2, 0.0, 0.42);
  if (x < 4.5) return vec3(0.04);
  float g = floor((x - 4.5) / 0.5);
  return vec3(0.0, 0.04, 0.08)[int(clamp(g, 0.0, 2.0))] * vec3(1.0) + vec3(0.02);
}

vec4 effect(vec2 uv) {
  vec4 c = getColor(uv);
  float field = floor(time * 59.94);
  float ypos = (1.0 - uv.y) * LINES;
  float line = floor(ypos);
  // Linhas tremendo de lado e balançando: o sinal chegando mal.
  float wob = (lmHash(vec3(line, field, 1.0)) - 0.5) * 0.008 * interferencia;
  wob += lmNoise(vec2(ypos * 0.03, time * 2.0)) * 0.004 * interferencia;
  vec2 p = vec2(fract(uv.x + wob), 1.0 - uv.y);

  // Agenda das trocas: imagem → barras → chiado → imagem… (sempre na tela: só as barras, ou chiado puro).
  float card;
  float snowMix;
  if (automatico > 0.5) {
    float ph = fract(time * velocidade);
    card = smoothstep(0.2, 0.24, ph) * (1.0 - smoothstep(0.9, 0.94, ph));
    float snowFrom = mix(0.9, 0.45, chiado);
    snowMix = smoothstep(snowFrom, snowFrom + 0.03, ph);
  } else {
    card = 1.0;
    snowMix = step(0.999, chiado);
  }
  // As barras passam pela banda do vídeo: média de três pontos ao longo da linha (borda de ~2 px, sem serrilhado).
  float o = lmPxUv(1.2).x;
  vec3 test = (bars(p) * 2.0 + bars(vec2(fract(p.x - o), p.y)) + bars(vec2(fract(p.x + o), p.y))) * 0.25;
  // "Sem sinal": chiado de vídeo sem cor.
  float n = snow(uv.x * 450.0, line, field) * 0.8 + snow(uv.x * 140.0, line, field + 0.5) * 0.35;
  vec3 noise = vec3(clamp(0.46 + n * 0.2, 0.0, 1.0));
  vec3 screen = mix(test, noise, snowMix);
  // Interferência por cima de tudo: grão, uma barra de zumbido larga subindo e algumas linhas estouradas.
  float hum = 0.5 + 0.5 * cos((uv.y - time * 0.25) * 2.0 * PI);
  screen = mix(screen, noise, 0.1 * interferencia) * (1.0 - 0.25 * interferencia * hum * hum);
  float burst = step(0.994, lmHash(vec3(line, field, 3.0)));
  float x0 = lmHash(vec3(line, field, 4.0));
  screen += burst * smoothstep(x0 - 0.03, x0, uv.x) * (1.0 - smoothstep(x0 + 0.1, x0 + 0.4, uv.x)) * interferencia * 0.6;
  vec3 col = mix(c.rgb, screen, card * mistura);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
