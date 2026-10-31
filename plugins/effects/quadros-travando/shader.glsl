// Quadros travando: segura cada quadro por "passo" segundos e pula para o atual. Trechos que andam normal são
// sorteados por trecho (acaso PCG, igual em toda exportação). O tranco do pulo é um solavanco amortecido (mola curta,
// ~80 ms) com desfoque de movimento vertical proporcional à velocidade, e o que sairia da borda é espelhado em vez
// de virar uma faixa esticada.

vec2 mirrorUv(vec2 u) { return 1.0 - abs(1.0 - mod(u, 2.0)); }

/** Deslocamento vertical do tranco "age" segundos depois do pulo. */
float kickAt(float age, float dir) {
  if (age < 0.0) return 0.0;
  return dir * 0.02 * tranco * exp(-age * 38.0) * cos(age * 55.0);
}

vec4 effect(vec2 uv) {
  float step_ = max(passo, 0.02);
  float seg = floor(time / step_);
  float age = time - seg * step_;
  // Alguns trechos andam normal (o engasgo fica imprevisível).
  bool live = lmHash(vec2(seg, 3.7)) < irregular * 0.6;
  float dir = lmHash(vec2(seg, 8.1)) * 2.0 - 1.0;
  float y0 = kickAt(age - 1.0 / 120.0, dir);
  float y1 = kickAt(age + 1.0 / 120.0, dir);
  float y = kickAt(age, dir);
  float blurPx = abs(y1 - y0) * resolution.y;
  int n = int(clamp(ceil(blurPx / 1.5), 1.0, 12.0));
  bool now = live || age < 0.017;
  float jitter = lmIGN(gl_FragCoord.xy);
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    if (i >= n) break;
    float yy = n == 1 ? y : mix(y0, y1, (float(i) + jitter) / float(n));
    vec2 u = mirrorUv(vec2(uv.x, uv.y + yy));
    vec3 s = now ? getColor(u).rgb : getPast(u, age).rgb;
    sum += lmToLinear(s);
  }
  return vec4(lmToSrgb(sum / float(n)), 1.0);
}
