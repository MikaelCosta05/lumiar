// P&B em papel de fibra "warmtone" com revelador quente (papel antigo):
// - Exposição pancromática em luz linear; curva de papel com preto denso e branco de papel marfim.
// - A cor entra por faixa de tom, como no papel: sombras castanho-escuras, meios-tons sépia-mel e as luzes
//   no marfim da base do papel. Feito em Oklab: a claridade percebida é exatamente a do P&B.
// - Grão fino da ampliação.

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
/** Oklab → sRGB reduzindo só o croma até caber na tela (claridade e matiz ficam). */
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
/** Cinza de valor "v" (sRGB) com a cor (a, b) do Oklab, mantendo a claridade do cinza. */
vec3 toneGray(float v, vec2 ab) { return okToSrgb(vec3(pow(lmToLinear(vec3(v)).x, 1.0 / 3.0), ab)); }

vec4 applyFilter(vec4 c, vec2 uv) {
  float v = filmExposure(c.rgb, vec3(0.25, 0.62, 0.13));
  float l = mix(0.022, 0.955, paperCurve(v, 4.6, 0.47));
  l = lmLuma(lmFilmGrain(vec3(l), uv, 0.12, 1.1, time));
  // Cor por faixa: sombras castanhas, meios-tons sépia-mel, luzes marfim.
  vec2 shadow = vec2(0.016, 0.026);
  vec2 mid = vec2(0.013, 0.046);
  vec2 high = vec2(0.003, 0.03);
  vec2 ab = l < 0.45 ? mix(shadow, mid, smoothstep(0.05, 0.45, l)) : mix(mid, high, smoothstep(0.45, 0.95, l));
  ab *= smoothstep(0.0, 0.08, l);
  return vec4(toneGray(l, ab), c.a);
}
