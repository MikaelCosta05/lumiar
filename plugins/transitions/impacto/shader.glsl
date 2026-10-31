// Impacto: soco de zoom. O clipe atual é puxado num zoom que acelera de forma exponencial até o corte (no pico de
// velocidade); o próximo chega com o tranco, quica (zoom em mola amortecida) e treme com ruído suave que vai se
// acalmando. O desfoque radial vem da velocidade do zoom e a separação de cores (espectral, contínua, da lente)
// vem da energia do golpe, as duas num mesmo laço de amostras em luz linear.

vec2 mirrorUv(vec2 p) { return 1.0 - abs(1.0 - mod(p, 2.0)); }

float tent(float u) { float x = 2.0 * u - 1.0; return 0.5 + 0.5 * sign(x) * (1.0 - sqrt(1.0 - abs(x))); }

float expIn(float x, float k) { return (exp(k * x) - 1.0) / (exp(k) - 1.0); }

/** Escala (log) do clipe atual (entra acelerando) e do próximo (chega com o tranco e quica até assentar). */
float scaleFrom(float t) { return log(1.0 + 0.4 * strength) * expIn(2.0 * t, 4.0); }
float scaleTo(float t) {
  float x = clamp(2.0 * t - 1.0, 0.0, 1.0);
  return log(1.0 + 0.3 * strength) * (1.0 - x) * (1.0 - x) * exp(-3.0 * x) * (0.5 + 0.5 * cos(3.0 * PI * x));
}

/** Energia do golpe: cresce até o corte e decai depois. */
float energy(float t) {
  return t < 0.5 ? expIn(2.0 * t, 4.0) : exp(-5.0 * (2.0 * t - 1.0)) * (2.0 - 2.0 * t);
}

/** Zoom borrado com separação espectral: cada amostra cai num instante do obturador e numa faixa do espectro. */
vec3 punchFrom(vec2 uv, vec2 c, float ls, float span, float ca, float jitter) {
  vec2 d = uv - c;
  // Amostras conforme o rastro e a separação de cor deste pixel (no mínimo 8, para o espectro ficar contínuo).
  float px = length(d * resolution) * (abs(span) + ca);
  int n = int(clamp(ceil(px / 3.0), 8.0, 32.0));
  float lod = clamp(log2(max(px / float(n) * exp(-ls), 1.0)) - 1.0, 0.0, 4.0);
  vec3 sum = vec3(0.0), wsum = vec3(0.0);
  for (int i = 0; i < 32; i++) {
    if (i >= n) break;
    float u = (float(i) + jitter) / float(n);
    float s = fract(float(i) * 0.6180339 + jitter * 7.31);
    vec3 w = clamp(vec3(1.5 - abs(s * 4.0 - 0.5), 1.5 - abs(s * 4.0 - 2.0), 1.5 - abs(s * 4.0 - 3.5)), 0.0, 1.0);
    float k = ls + span * (tent(u) - 0.5);
    vec2 q = c + d * exp(-k) * (1.0 + (s - 0.5) * ca);
    sum += lmToLinear(getFromColorLod(mirrorUv(q), lod).rgb) * w;
    wsum += w;
  }
  return sum / wsum;
}

vec3 punchTo(vec2 uv, vec2 c, float ls, float span, float ca, float jitter) {
  vec2 d = uv - c;
  // Amostras conforme o rastro e a separação de cor deste pixel (no mínimo 8, para o espectro ficar contínuo).
  float px = length(d * resolution) * (abs(span) + ca);
  int n = int(clamp(ceil(px / 3.0), 8.0, 32.0));
  float lod = clamp(log2(max(px / float(n) * exp(-ls), 1.0)) - 1.0, 0.0, 4.0);
  vec3 sum = vec3(0.0), wsum = vec3(0.0);
  for (int i = 0; i < 32; i++) {
    if (i >= n) break;
    float u = (float(i) + jitter) / float(n);
    float s = fract(float(i) * 0.6180339 + jitter * 7.31);
    vec3 w = clamp(vec3(1.5 - abs(s * 4.0 - 0.5), 1.5 - abs(s * 4.0 - 2.0), 1.5 - abs(s * 4.0 - 3.5)), 0.0, 1.0);
    float k = ls + span * (tent(u) - 0.5);
    vec2 q = c + d * exp(-k) * (1.0 + (s - 0.5) * ca);
    sum += lmToLinear(getToColorLod(mirrorUv(q), lod).rgb) * w;
    wsum += w;
  }
  return sum / wsum;
}

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  const float shutter = 0.05;
  float t0 = max(progress - shutter * 0.5, 0.0);
  float t1 = min(progress + shutter * 0.5, 1.0);
  float jitter = lmIGN(gl_FragCoord.xy);
  float en = energy(progress);
  // Tremor: ruído suave, pequeno antes do golpe e forte logo depois, amortecido.
  float shakeAmp = strength * (progress < 0.5 ? lmPx(6.0) * en : lmPx(26.0) * en);
  vec2 shake = vec2(lmNoise(vec2(progress * 34.0, 2.3)), lmNoise(vec2(progress * 34.0, 7.9))) * shakeAmp;
  vec2 c = vec2(0.5) + shake / vec2(ratio, 1.0);
  float ca = 0.07 * strength * en;
  vec3 col;
  // Folga de zoom para o tremor nunca mostrar a borda.
  float overscan = 2.5 * shakeAmp;
  if (progress < 0.5) col = punchFrom(uv, c, scaleFrom(progress) + overscan, scaleFrom(t1) - scaleFrom(t0), ca, jitter);
  else col = punchTo(uv, c, scaleTo(progress) + overscan, scaleTo(t1) - scaleTo(t0), ca, jitter);
  return vec4(lmToSrgb(col), 1.0);
}
