// Viragem ao selênio, como no laboratório:
// - O selênio age primeiro onde há mais prata (as sombras): elas passam a um púrpura-berinjela e ficam mais
//   densas (o preto máximo do papel aumenta); os meios-tons recebem só um traço e as luzes ficam neutras.
// - Exposição pancromática em luz linear, curva de papel com preto profundo mas com pé (sem empastar).
// - Cor aplicada em Oklab: a claridade percebida é a do P&B. Grão fino da ampliação.

float filmExposure(vec3 c, vec3 w) {
  return lmToSrgb(vec3(max(dot(lmToLinear(c), w / dot(w, vec3(1.0))), 0.0))).x;
}

float paperCurve(float x, float hard, float pivot) {
  x = pow(clamp(x, 0.0, 1.0), log(0.5) / log(pivot));
  hard = max(hard, 0.05);
  float a = 1.0 / (1.0 + exp(0.5 * hard));
  return (1.0 / (1.0 + exp(-hard * (x - 0.5))) - a) / (1.0 - 2.0 * a);
}

bool inGamut(vec3 lin) { return all(greaterThanEqual(lin, vec3(-1e-4))) && all(lessThanEqual(lin, vec3(1.0001))); }
vec3 okToSrgb(vec3 lab) {
  lab.x = clamp(lab.x, 0.0, 1.0);
  if (inGamut(lmFromOklab(lab))) return clamp(lmToSrgb(lmFromOklab(lab)), 0.0, 1.0);
  float lo = 0.0, hi = 1.0;
  for (int i = 0; i < 8; i++) {
    float m = 0.5 * (lo + hi);
    if (inGamut(lmFromOklab(vec3(lab.x, lab.yz * m)))) lo = m; else hi = m;
  }
  return clamp(lmToSrgb(lmFromOklab(vec3(lab.x, lab.yz * lo))), 0.0, 1.0);
}
vec3 toneGray(float v, vec2 ab) { return okToSrgb(vec3(pow(lmToLinear(vec3(v)).x, 1.0 / 3.0), ab)); }

vec4 applyFilter(vec4 c, vec2 uv) {
  float v = filmExposure(c.rgb, vec3(0.25, 0.62, 0.13));
  // O selênio aprofunda o preto: a curva desce mais no pé.
  float l = mix(0.01, 0.965, paperCurve(v, 4.6, 0.47));
  l = lmLuma(lmFilmGrain(vec3(l), uv, 0.12, 1.1, time));
  // Quanto de selênio cada tom pega: máximo nas sombras, some nos meios-tons claros.
  float toner = smoothstep(0.0, 0.1, l) * (1.0 - smoothstep(0.18, 0.7, l));
  vec2 aubergine = vec2(0.034, -0.018);
  vec2 ab = aubergine * toner + vec2(0.002, -0.003) * (1.0 - toner) * smoothstep(0.0, 0.2, l);
  return vec4(toneGray(l, ab), c.a);
}
