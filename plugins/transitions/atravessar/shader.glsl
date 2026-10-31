// Atravessar: a câmera voa para dentro do clipe atual (zoom que acelera de forma exponencial até ~8x) e sai,
// sem mudar de sentido, dentro do próximo, que vem de um pouco mais longe e freia até o tamanho normal. As duas
// curvas estão no pico de velocidade no corte, então o movimento parece contínuo; o desfoque radial é a
// escala integrada no tempo do obturador. O que aparece além da borda do próximo clipe é espelhado (nunca uma
// faixa esticada) e só existe nos poucos quadros do borrão máximo. Um clarão leve marca a passagem.

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

// Escala em log: o atual vai de 1x a 8x; o próximo de 0,55x a 1x. O próximo freia um pouco mais devagar que a
// igualdade exata de velocidades (La·ka = Lb·kb) daria, para assentar sem pressa; o borrão do corte esconde a diferença.
const float LA = 2.08;
const float KA = 4.0;
const float LB = 0.6;
const float KB = 10.0;
float scaleFrom(float t) { return LA * expIn(2.0 * t, KA); }
float scaleTo(float t) { return -LB * expIn(2.0 - 2.0 * t, KB); }

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  const float shutter = 0.05;  // ~ 180° com o obturador em tenda
  float t0 = max(progress - shutter * 0.5, 0.0);
  float t1 = min(progress + shutter * 0.5, 1.0);
  float jitter = lmIGN(gl_FragCoord.xy);
  vec2 c = vec2(0.5);
  float m = smoothstep(0.47, 0.53, progress);
  vec3 col = vec3(0.0);
  if (m < 1.0) col += zoomFrom(uv, c, scaleFrom(progress), scaleFrom(t1) - scaleFrom(t0), jitter) * (1.0 - m);
  if (m > 0.0) col += zoomTo(uv, c, scaleTo(progress), scaleTo(t1) - scaleTo(t0), jitter) * m;
  float pass = (progress - 0.5) / 0.045;
  col *= 1.0 + 0.6 * exp(-pass * pass);
  return vec4(lmToSrgb(col), 1.0);
}
