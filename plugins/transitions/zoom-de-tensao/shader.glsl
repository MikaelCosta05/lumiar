// Zoom de tensão: aproxima devagar e cada vez mais rápido (curva exponencial), com a lente fechando nas bordas,
// até o corte seco em 60% (no pico de velocidade, com o desfoque radial que a velocidade dá). O próximo clipe
// entra levemente ampliado e assenta freando, soltando a tensão.

vec2 mirrorUv(vec2 p) { return 1.0 - abs(1.0 - mod(p, 2.0)); }

/** Obturador em tenda: amostras mais densas no meio do tempo de exposição, rastro que some suave nas pontas. */
float tent(float u) { float x = 2.0 * u - 1.0; return 0.5 + 0.5 * sign(x) * (1.0 - sqrt(1.0 - abs(x))); }

float expIn(float x, float k) { return (exp(k * x) - 1.0) / (exp(k) - 1.0); }

vec3 zoomFrom(vec2 uv, float ls, float span, float jitter) {
  vec2 d = uv - 0.5;
  float px = length(d * resolution) * abs(span);
  int n = int(clamp(ceil(px / 3.0), 1.0, 32.0));
  float lod = clamp(log2(max(px / float(n) * exp(-ls), 1.0)) - 1.0, 0.0, 5.0);
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 32; i++) {
    if (i >= n) break;
    float k = ls + span * (tent((float(i) + jitter) / float(n)) - 0.5);
    sum += lmToLinear(getFromColorLod(mirrorUv(0.5 + d * exp(-k)), lod).rgb);
  }
  return sum / float(n);
}

vec3 zoomTo(vec2 uv, float ls, float span, float jitter) {
  vec2 d = uv - 0.5;
  float px = length(d * resolution) * abs(span);
  int n = int(clamp(ceil(px / 3.0), 1.0, 32.0));
  float lod = clamp(log2(max(px / float(n) * exp(-ls), 1.0)) - 1.0, 0.0, 5.0);
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 32; i++) {
    if (i >= n) break;
    float k = ls + span * (tent((float(i) + jitter) / float(n)) - 0.5);
    sum += lmToLinear(getToColorLod(mirrorUv(0.5 + d * exp(-k)), lod).rgb);
  }
  return sum / float(n);
}

const float CUT = 0.6;
float scaleFrom(float t) { return log(1.0 + 0.45 * strength) * expIn(t / CUT, 5.0); }
float scaleTo(float t) { return log(1.0 + 0.3 * strength) * expIn((1.0 - t) / (1.0 - CUT), 6.0); }

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  const float shutter = 0.05;  // ~ 180° com o obturador em tenda
  float t0 = max(progress - shutter * 0.5, 0.0);
  float t1 = min(progress + shutter * 0.5, 1.0);
  float jitter = lmIGN(gl_FragCoord.xy);
  vec3 col;
  float tension;
  if (progress < CUT) {
    col = zoomFrom(uv, scaleFrom(progress), scaleFrom(t1) - scaleFrom(t0), jitter);
    tension = expIn(progress / CUT, 3.0);
  } else {
    col = zoomTo(uv, scaleTo(progress), scaleTo(t1) - scaleTo(t0), jitter);
    tension = expIn((1.0 - progress) / (1.0 - CUT), 6.0) * 0.6;
  }
  col *= lmVignette(uv, 0.55 * tension * min(strength, 1.0), 0.5);
  return vec4(lmToSrgb(col), 1.0);
}
