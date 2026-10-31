// Pixels ao vento: o clipe se desfaz em blocos quadrados que o vento leva, da esquerda para a direita numa
// frente irregular. Cada bloco se solta com o seu atraso, acelera (ease in) na direção do vento com um
// redemoinho suave (ruído), gira e encolhe até sumir, com um brilho leve quando se solta; o próximo clipe
// aparece por trás. Cada pixel acha o bloco que o cobre (mesmo depois de voar), com bordas antisserrilhadas.
// "Blocos" = quantos blocos cabem na altura.

vec3 addGlow(vec3 base, vec3 lightLinear) {
  vec3 total = lmToSrgb(lmToLinear(base) + lightLinear);
  return clamp(base + lmSoftClip(total, 0.75) - lmSoftClip(base, 0.75), 0.0, 1.0);
}

const vec2 WIND = vec2(1.0, 0.32);
const float REACH = 0.65;  // quanto o vento leva o bloco até ele sumir (em alturas de tela, ao longo do vento)

/** Movimento do bloco: deslocamento (altura de tela), giro, escala e o tempo próprio dele. */
void blockMotion(vec2 cell, out vec2 D, out float angle, out float scale, out float tau) {
  vec2 c = (cell + 0.5) / size;
  float sweep = clamp(c.x / ratio + 0.5, 0.0, 1.0);
  float delay = 0.5 * sweep + 0.07 * lmHash(cell + 0.3);
  tau = clamp((progress - delay) / 0.4, 0.0, 1.0);
  float e = tau * tau;
  // Redemoinho pequeno por cima do vento (cada bloco sobe ou desce um pouco e gira para um lado).
  vec3 h = lmHash3(cell + 1.7);
  D = WIND * REACH * e + (h.xy - 0.5) * 0.06 * e;
  angle = e * (h.z - 0.5) * 5.0;
  scale = 1.0 - smoothstep(0.15, 1.0, tau);
}

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  vec2 p = lmCentered(uv);
  vec2 D;
  float angle, scale, tau;
  float halfB = 0.5 / size;
  float px = 1.0 / resolution.y;
  // Dois planos: o bloco que ainda está (ou quase) no lugar, atrás, e o que está voando, na frente. O bloco que
  // cobre este pixel veio de algum ponto "contra o vento": a busca anda nessa linha em passos de meio bloco, pulando de cara os pontos de onde
  // nenhum bloco poderia ter vindo.
  float backCover = 0.0, frontCover = 0.0, frontTau = 0.0;
  vec2 backQ = p, frontQ = p;
  float stepLen = halfB;
  int steps = int(min(ceil((REACH * length(WIND) + 2.0 * halfB) / stepLen), 64.0));
  vec2 dirW = normalize(WIND);
  for (int s = 0; s < 64; s++) {
    if (s > steps) break;
    float d = float(s) * stepLen;
    vec2 src = p - dirW * d;
    // Filtro barato: um bloco que saiu daqui só chega a este pixel se o deslocamento dele (pelo atraso
    // possível nesse ponto da tela) for perto da distância d.
    float sweep = src.x / ratio + 0.5;
    float tLo = clamp((progress - 0.5 * sweep - 0.07 - 0.5 * halfB / ratio) / 0.4, 0.0, 1.0);
    float tHi = clamp((progress - 0.5 * sweep + 0.5 * halfB / ratio) / 0.4, 0.0, 1.0);
    float reach = REACH * length(WIND);
    if (d < reach * tLo * tLo - 3.0 * halfB - 0.05 || d > reach * tHi * tHi + 3.0 * halfB + 0.05) continue;
    vec2 cell = floor(src * size);
    // A célula do ponto e a vizinha de cima ou de baixo (a mais perto): o giro e o redemoinho tiram o bloco
    // um pouco da linha do vento.
    float other = fract(src.y * size) < 0.5 ? -1.0 : 1.0;
    for (int j = 0; j < 2; j++) {
      vec2 cj = cell + vec2(0.0, j == 0 ? 0.0 : other);
      blockMotion(cj, D, angle, scale, tau);
      if (scale <= 0.0) continue;
      vec2 c = (cj + 0.5) / size;
      vec2 local = lmRotate(p - c - D, -angle) / scale;
      float sd = lmSdBox(local, vec2(halfB)) * scale;
      // Parado, o bloco cobre por inteiro (sem fresta entre vizinhos); solto, borda de 1 px.
      float cover = tau <= 0.0 ? step(sd, 0.0) : clamp(0.5 - sd / (1.2 * px), 0.0, 1.0);
      if (cover <= 0.0) continue;
      if (tau < 0.05) {
        if (cover > backCover) { backCover = cover; backQ = c + local; }
      } else if (tau > frontTau) {
        frontCover = cover; frontQ = c + local; frontTau = tau;
      }
    }
  }
  vec4 col = getToColor(uv);
  if (backCover > 0.0) col = mix(col, getFromColor(lmUncentered(backQ)), backCover);
  if (frontCover > 0.0) {
    vec4 from = getFromColor(lmUncentered(frontQ));
    // O bloco acende um pouco (luz quente proporcional à cor dele) quando se solta.
    float lift = smoothstep(0.0, 0.25, frontTau) * (1.0 - smoothstep(0.4, 1.0, frontTau));
    from.rgb = addGlow(from.rgb, lmToLinear(from.rgb) * vec3(1.0, 0.9, 0.75) * 0.5 * lift);
    col = mix(col, from, frontCover);
  }
  return col;
}
