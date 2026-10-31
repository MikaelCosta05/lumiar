// Apagar o objeto escolhido. O buraco é preenchido por interpolação das cores do fundo em volta: até 108 amostras em
// anéis com raios em escala logarítmica (de perto até longe), só as que caem em fundo livre (longe do objeto e da
// sombra da borda dele), com peso maior para as mais perto. As cores vêm de um nível de detalhe proporcional à
// distância, então o preenchimento é um degradê liso, sem as estrias em leque nem o contorno escuro do método antigo.
// O granulado (para disfarçar) muda a 30 quadros por segundo e é mais forte nos meios-tons, como o ruído de câmera.

// Onde está o objeto, um pouco maior (margem cheia até a metade, borda macia depois).
float area(vec2 uv, float r) {
  float m = getPerson(uv);
  float outer = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7853982 + 0.39;
    vec2 dir = vec2(cos(a) / ratio, sin(a));
    m = max(m, getPerson(uv + dir * r * 0.5));
    outer += getPerson(uv + dir * r);
  }
  return max(m, smoothstep(0.0, 0.5, outer / 8.0));
}

/** 1 = fundo livre: nem o objeto nem a borda dele num raio "r" em volta (ponto + 3 vizinhos girados por "a"). */
float clearAt(vec2 p, float r, float a) {
  float m = getPerson(p);
  for (int i = 0; i < 3; i++) {
    float b = a + float(i) * 2.0943951;
    m = max(m, getPerson(p + vec2(cos(b) / ratio, sin(b)) * r));
  }
  return 1.0 - smoothstep(0.08, 0.4, m);
}

vec4 effect(vec2 uv) {
  vec4 original = getColor(uv);
  float margin = 0.004 + grow * 0.025;
  float inside = area(uv, margin);
  if (inside <= 0.0) return original;

  vec3 sum = vec3(0.0);
  float total = 0.0;
  // 9 anéis (raios em escala logarítmica) × 12 direções, cada anel girado, as mesmas para todos os pixels (leituras
  // vizinhas na memória: rápido). Achado o fundo num anel, mais três bastam: o peso cai com o cubo da distância e os
  // anéis seguintes já não mudam nada.
  int found = -1;
  for (int ring = 0; ring < 9; ring++) {
    if (found >= 0 && ring > found + 3) break;
    float r = 0.006 * pow(110.0, (float(ring) + 0.5) / 9.0);
    float level = clamp(log2(max(r * resolution.y * 0.07, 1.0)), 0.0, 4.5);
    float blurR = exp2(level) / resolution.y;
    for (int k = 0; k < 12; k++) {
      float a = float(k) * 0.5235988 + float(ring) * 1.3;
      vec2 p = uv + vec2(cos(a) / ratio, sin(a)) * r;
      if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) continue;
      // Um dos vizinhos sempre do lado do objeto (para dentro), onde a borda dele estaria.
      float ok = clearAt(p, margin + blurR * 1.5, a + 3.1415927);
      if (ok <= 0.0) continue;
      float w = ok / (r * r * r);
      sum += lmToLinear(getColorLod(p, level).rgb) * w;
      total += w;
    }
    if (found < 0 && total > 0.0) found = ring;
  }
  if (total <= 0.0) return original;
  vec3 fill = lmToSrgb(sum / total);
  // Granulado de câmera: um quadro de ruído a cada 1/30 s, mais forte nos meios-tons.
  float frame = floor(time * 30.0);
  float l = lmLuma(fill);
  fill += lmGaussianNoise(vec3(floor(gl_FragCoord.xy), frame)) * grain * 0.018 * (0.4 + 2.4 * l * (1.0 - l));
  return vec4(mix(original.rgb, clamp(fill, 0.0, 1.0), inside), original.a);
}
