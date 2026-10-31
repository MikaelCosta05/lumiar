// Preto e branco clássico de laboratório.
// - O cinza é a luminância medida em luz linear (como a película soma a luz), não a média do sRGB: azuis
//   saturados ficam escuros e amarelos claros como o olho vê.
// - O contraste acima de 1 é uma curva de papel (S logística): o meio-tom ganha inclinação "contrast", e o
//   preto e o branco chegam em 0 e 1 por um pé e um ombro suaves, sem cortar (nada de sombras empastadas).
// - Abaixo de 1 a imagem fica lavada em volta do meio-tom, como antes (preto levantado, branco rebaixado).

/** Exposição na película: soma em luz linear com a sensibilidade "w" de cada canal, de volta em sRGB. */
float filmExposure(vec3 c, vec3 w) {
  return lmToSrgb(vec3(max(dot(lmToLinear(c), w / dot(w, vec3(1.0))), 0.0))).x;
}

/** Curva do papel: S logística (0 → 0, 1 → 1), "hard" = dureza, "pivot" = valor que fica no centro. */
float paperCurve(float x, float hard, float pivot) {
  x = pow(clamp(x, 0.0, 1.0), log(0.5) / log(pivot));
  hard = max(hard, 0.05);
  float a = 1.0 / (1.0 + exp(0.5 * hard));
  return (1.0 / (1.0 + exp(-hard * (x - 0.5))) - a) / (1.0 - 2.0 * a);
}

/** Dureza da curva logística cuja inclinação no meio é "slope" (resolve u / tanh(u) = slope, u = dureza / 4). */
float hardnessForSlope(float slope) {
  float u = sqrt(3.0 * max(slope - 1.0, 0.0));
  for (int i = 0; i < 10; i++) u = slope * tanh(max(u, 1e-3));
  return 4.0 * u;
}

vec4 applyFilter(vec4 c, vec2 uv) {
  float v = filmExposure(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  float l = contrast >= 1.0
    ? paperCurve(v, hardnessForSlope(contrast), 0.5)
    : 0.5 + (v - 0.5) * contrast;
  return vec4(vec3(clamp(l, 0.0, 1.0)), c.a);
}
