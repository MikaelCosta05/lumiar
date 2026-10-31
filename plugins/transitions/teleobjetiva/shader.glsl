// Teleobjetiva: "crash zoom" de lente longa. O clipe atual mergulha num zoom que acelera de forma exponencial
// até o corte (no pico de velocidade), o próximo chega ampliado e freia. Como numa tele de verdade, a câmera na
// mão treme mais quanto maior o zoom (ruído suave, não saltos) e a lente escurece nas bordas no meio do golpe.
// O desfoque radial é a escala integrada no tempo do obturador: proporcional à velocidade do zoom.

vec2 mirrorUv(vec2 p) { return 1.0 - abs(1.0 - mod(p, 2.0)); }

/** Obturador em tenda: amostras mais densas no meio do tempo de exposição, rastro que some suave nas pontas. */
float tent(float u) { float x = 2.0 * u - 1.0; return 0.5 + 0.5 * sign(x) * (1.0 - sqrt(1.0 - abs(x))); }

float expIn(float x, float k) { return (exp(k * x) - 1.0) / (exp(k) - 1.0); }

vec3 zoomFrom(vec2 uv, vec2 c, float ls, float span, float jitter) {
  vec2 d = uv - c;
  float px = length(d * resolution) * abs(span);
  int n = int(clamp(ceil(px / 3.0), 1.0, 24.0));
  float lod = clamp(log2(max(px / float(n) * exp(-ls), 1.0)) - 1.0, 0.0, 5.0);
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 24; i++) {
    if (i >= n) break;
    float k = ls + span * (tent((float(i) + jitter) / float(n)) - 0.5);
    sum += lmToLinear(getFromColorLod(mirrorUv(c + d * exp(-k)), lod).rgb);
  }
  return sum / float(n);
}

vec3 zoomTo(vec2 uv, vec2 c, float ls, float span, float jitter) {
  vec2 d = uv - c;
  float px = length(d * resolution) * abs(span);
  int n = int(clamp(ceil(px / 3.0), 1.0, 24.0));
  float lod = clamp(log2(max(px / float(n) * exp(-ls), 1.0)) - 1.0, 0.0, 5.0);
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 24; i++) {
    if (i >= n) break;
    float k = ls + span * (tent((float(i) + jitter) / float(n)) - 0.5);
    sum += lmToLinear(getToColorLod(mirrorUv(c + d * exp(-k)), lod).rgb);
  }
  return sum / float(n);
}

float scaleFrom(float t, float L) { return L * expIn(2.0 * t, 5.0); }
float scaleTo(float t, float L) { return L * expIn(2.0 - 2.0 * t, 5.0); }

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  float L = log(1.0 + 2.0 * strength);
  const float shutter = 0.05;  // ~ 180° com o obturador em tenda
  float t0 = max(progress - shutter * 0.5, 0.0);
  float t1 = min(progress + shutter * 0.5, 1.0);
  float jitter = lmIGN(gl_FragCoord.xy);
  float m = smoothstep(0.47, 0.53, progress);
  float ls = mix(scaleFrom(progress, L), scaleTo(progress, L), m);
  // Tremor de mão amplificado pela tele: ruído suave, proporcional ao zoom.
  float shakeAmp = lmPx(5.0) * (exp(ls) - 1.0);
  vec2 shake = vec2(lmNoise(vec2(progress * 16.0, 1.7)), lmNoise(vec2(progress * 16.0, 9.2))) * shakeAmp;
  vec2 c = vec2(0.5) + shake / vec2(ratio, 1.0);
  vec3 col = vec3(0.0);
  if (m < 1.0) col += zoomFrom(uv, c, scaleFrom(progress, L), scaleFrom(t1, L) - scaleFrom(t0, L), jitter) * (1.0 - m);
  if (m > 0.0) col += zoomTo(uv, c, scaleTo(progress, L), scaleTo(t1, L) - scaleTo(t0, L), jitter) * m;
  float bell = ls / max(L, 1e-4);
  col *= lmVignette(uv, 0.45 * bell, 0.6);
  return vec4(lmToSrgb(col), 1.0);
}
