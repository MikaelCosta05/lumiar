// P&B frio (papel "cold tone" com viragem azul), clima de noite e de suspense:
// - Exposição pancromática em luz linear; curva de papel firme com pé longo (sombras fundas sem empastar).
// - O azul entra por faixa de tom, em Oklab (a claridade é a do P&B): sombras e meios-tons azul-aço, as luzes
//   voltam quase ao branco frio, como uma cópia virada ao ouro/ferro.
// - Vinheta de lente (cos⁴) com a proporção certa, em luz linear; grão fino.

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
  float v = filmExposure(c.rgb, vec3(0.24, 0.60, 0.16));
  float l = mix(0.015, 0.96, paperCurve(v, 4.8, 0.46));
  l = lmToSrgb(vec3(lmToLinear(vec3(l)).x * lmVignette(uv, 0.6, 0.5))).x;
  l = lmLuma(lmFilmGrain(vec3(l), uv, 0.14, 1.2, time));
  vec2 steel = vec2(-0.018, -0.05);
  vec2 frost = vec2(-0.006, -0.016);
  vec2 ab = mix(steel, frost, smoothstep(0.35, 0.95, l)) * smoothstep(0.0, 0.1, l);
  return vec4(toneGray(l, ab), c.a);
}
