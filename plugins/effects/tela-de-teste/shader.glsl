float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
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
  float frame = floor(time * 30.0);
  // Linhas balançando de lado e uma faixa escura que sobe devagar: o sinal chegando mal.
  float line = floor(uv.y * resolution.y / 2.0);
  float wob = (hash(vec2(line, frame)) - 0.5) * 0.012 * interferencia;
  wob += sin(uv.y * 40.0 + time * 9.0) * 0.003 * interferencia;
  vec2 p = vec2(fract(uv.x + wob), 1.0 - uv.y);

  // Agenda das trocas: imagem → barras → chiado → imagem… (sempre na tela: só as barras, ou chiado puro).
  float card;
  float snow;
  if (automatico > 0.5) {
    float ph = fract(time * velocidade);
    card = smoothstep(0.2, 0.24, ph) * (1.0 - smoothstep(0.9, 0.94, ph));
    float snowFrom = mix(0.9, 0.45, chiado);
    snow = smoothstep(snowFrom, snowFrom + 0.03, ph);
  } else {
    card = 1.0;
    snow = step(0.999, chiado);
  }
  vec3 test = bars(p);
  // "Sem sinal": chiado com grão grosso e um pouco de cor.
  float n = hash(floor(uv * resolution / 2.0) + frame * 13.1);
  vec3 noise = vec3(n) * vec3(0.95, 0.97, 1.0);
  vec3 screen = mix(test, noise, snow);
  // Interferência por cima de tudo: grão, faixa rolando e algumas linhas estouradas.
  float roll = smoothstep(0.0, 0.1, fract(uv.y * 0.6 + time * 0.25)) * 0.3 + 0.7;
  screen = mix(screen, vec3(n), 0.12 * interferencia) * mix(1.0, roll, interferencia);
  screen += step(0.992, hash(vec2(line, frame * 3.0))) * interferencia * 0.6;
  vec3 col = mix(c.rgb, screen, card * mistura);
  return vec4(col, c.a);
}
