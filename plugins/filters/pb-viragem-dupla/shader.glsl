// P&B com viragem dupla (split toning de laboratório):
// - Primeiro uma cópia pancromática em luz linear, com curva de papel e preto denso.
// - As viragens agem por faixa de tom, como no banho: a das sombras pega onde há mais prata (selênio/ouro) e a das
//   luzes pega onde a prata é fina (sépia); "Equilíbrio" é o tom em que uma passa para a outra.
// - Só a cor (matiz e croma em Oklab) de cada viragem entra; a claridade é exatamente a do P&B. O branco do
//   papel e o preto máximo ficam quase neutros (não há prata para virar no branco).

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
  float v = lmToSrgb(vec3(dot(lmToLinear(c.rgb), vec3(0.25, 0.62, 0.13)))).x;
  float l = mix(0.018, 0.965, paperCurve(v, 3.4, 0.46));
  vec2 shadowAb = lmToOklab(lmToLinear(shadowTone)).yz;
  vec2 lightAb = lmToOklab(lmToLinear(lightTone)).yz;
  float w = smoothstep(balance - 0.35, balance + 0.35, l);
  // Quanto cada viragem pega em cada tom (some no preto máximo e no branco do papel).
  float shadowTake = smoothstep(0.0, 0.12, l) * (1.0 - w);
  float lightTake = (1.0 - smoothstep(0.86, 1.0, l)) * w;
  vec2 ab = (shadowAb * shadowTake + lightAb * lightTake) * 0.8;
  return vec4(toneGray(l, ab), c.a);
}
