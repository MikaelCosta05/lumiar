/**
 * Traz a cor de volta para dentro do sRGB sem mudar a luminância nem o matiz: em vez de cortar cada canal
 * (o que muda a cor e faz quinas), puxa a cor para o cinza de mesma luminância, com um joelho suave.
 * Entrada e saída em luz linear.
 */
vec3 fitGamut(vec3 lin) {
  float y = clamp(lmLuma(lin), 0.0, 1.0);
  vec3 d = lin - y;
  float hi = max(d.r, max(d.g, d.b));
  float lo = min(d.r, min(d.g, d.b));
  // Quanto do caminho até a borda do gamut a cor já usa (1 = na borda).
  float e = max(max(hi, 0.0) / max(1.0 - y, 1e-5), max(-lo, 0.0) / max(y, 1e-5));
  const float knee = 0.9;
  float f = e <= knee ? e : knee + (1.0 - knee) * (1.0 - exp(-(e - knee) / (1.0 - knee)));
  return y + d * (f / max(e, 1e-5));
}

/** Oklab → sRGB, já dentro do gamut. */
vec3 fromLab(vec3 lab) { return lmToSrgb(fitGamut(lmFromOklab(lab))); }

/** Pesos de sombras, meios-tons e altas luzes pela luminosidade Oklab (somam ~1; o preto puro fica neutro). */
vec3 toneWeights(float L) {
  float sh = smoothstep(0.0, 0.22, L) * (1.0 - smoothstep(0.25, 0.65, L));
  float hi = smoothstep(0.55, 0.92, L);
  return vec3(sh, max(1.0 - sh - hi, 0.0) * smoothstep(0.0, 0.3, L), hi);
}

/** Tinge sombras, meios-tons e altas luzes (deslocamentos a/b de Oklab), como as rodas de cor de um corretor. */
vec3 splitTone(vec3 lab, vec2 shadows, vec2 mids, vec2 highlights) {
  vec3 w = toneWeights(lab.x);
  lab.yz += shadows * w.x + mids * w.y + highlights * w.z;
  return lab;
}

vec3 planckXyz(float T) {
  float t = 1000.0 / T;
  float x = T < 4000.0 ? ((-0.2661239 * t - 0.2343589) * t + 0.8776956) * t + 0.179910 : ((-3.0258469 * t + 2.1070379) * t + 0.2226347) * t + 0.240390;
  float y = T < 2222.0 ? ((-1.1063814 * x - 1.34811020) * x + 2.18555832) * x - 0.20219683
    : T < 4000.0 ? ((-0.9549476 * x - 1.37418593) * x + 2.09137015) * x - 0.16748867
    : ((3.0817580 * x - 5.87338670) * x + 3.75112997) * x - 0.37001483;
  return vec3(x / y, 1.0, (1.0 - x - y) / y);
}
/**
 * Balanço de branco de verdade: adaptação cromática de Bradford do branco de 6504 K para o de uma luz de corpo negro
 * deslocada de "mired" (positivo = mais quente, negativo = mais frio; 30 mired ≈ um filtro 81A), mantendo a luminância
 * de cada pixel. Entrada e saída lineares.
 */
vec3 kelvin(vec3 lin, float mired) {
  const mat3 XYZ_TO_LMS = mat3(0.8951, -0.7502, 0.0389, 0.2664, 1.7135, -0.0685, -0.1614, 0.0367, 1.0296);
  const mat3 RGB_TO_LMS = mat3(0.4227253, 0.0556998, 0.0213826, 0.4913453, 0.9615341, 0.0876419, 0.0273579, 0.0231838, 0.9805081);
  const mat3 LMS_TO_RGB = mat3(2.5380445, -0.1460041, -0.0422985, -1.293277, 1.1166483, -0.0716072, -0.0402369, -0.022329, 1.0227527);
  float T = 1.0e6 / (1.0e6 / 6504.0 + mired);
  vec3 gain = (XYZ_TO_LMS * planckXyz(clamp(T, 1700.0, 24000.0))) / (XYZ_TO_LMS * planckXyz(6504.0));
  vec3 out_ = LMS_TO_RGB * (gain * (RGB_TO_LMS * lin));
  out_ *= lmLuma(lin) / max(lmLuma(out_), 1e-6);
  return fitGamut(out_);
}

/**
 * Frio: balanço de branco de verdade (adaptação cromática de Bradford para um branco de ~15000 K), com a luminância de
 * cada pixel preservada: a imagem fica azulada de inverno sem escurecer nem clarear. As sombras ganham um toque a
 * mais de azul-aço, como o céu de inverno nelas.
 */
vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 lin0 = lmToLinear(c.rgb);
  vec3 lab0 = lmToOklab(lin0);
  vec3 lin = kelvin(lin0, -90.0);
  vec3 lab = lmToOklab(lin);
  // Um branco de 15000 K cai do lado violeta do azul: o bege vira lilás e a pele, rosa-magenta. Um toque de verde
  // (o ajuste de matiz que o colorista faria junto com a temperatura) leva o frio para o azul-aço.
  lab.y -= 0.011 * smoothstep(0.0, 0.25, lab.x);
  // A pele fica pálida e fria, mas com o matiz dela (sem virar rosa): menos croma, menos amarelo.
  float h = degrees(atan(lab0.z, lab0.y));
  float ch = length(lab0.yz);
  float skin = (1.0 - smoothstep(10.0, 24.0, abs(h - 44.0))) * smoothstep(0.035, 0.06, ch) * (1.0 - smoothstep(0.16, 0.2, ch))
    * smoothstep(0.2, 0.35, lab0.x);
  lab.yz = mix(lab.yz, lab0.yz * 0.72 + vec2(-0.004, -0.012), skin * 0.7);
  lab = splitTone(lab, vec2(-0.004, -0.012), vec2(0.0), vec2(0.0));
  return vec4(clamp(fromLab(lab), 0.0, 1.0), c.a);
}
