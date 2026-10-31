// Preto e branco com filtro de vidro colorido na lente, como no laboratório:
// - O filtro deixa passar a luz da sua cor e segura as outras (transmitância = a cor em luz linear), e a película
//   pancromática (um pouco mais sensível ao azul que o olho) soma o que passou.
// - O fotógrafo compensa o fator do filtro abrindo o diafragma: um cinza neutro sai com o mesmo valor com qualquer
//   filtro. Por isso a soma é normalizada (só a cor do filtro importa, não o quanto ela é escura).
//   Vermelho (#25): céu quase preto, nuvens saltam, pele lisa e clara. Laranja (#21) e amarelo (#8): o mesmo, mais
//   brando. Verde (#11): folhas claras, lábios e pele mais escuros.
// - Contraste com curva de papel (pé e ombro suaves, sem cortar o preto e o branco).

float filmExposure(vec3 c, vec3 w) {
  return lmToSrgb(vec3(max(dot(lmToLinear(c), w / max(dot(w, vec3(1.0)), 1e-6)), 0.0))).x;
}

float paperCurve(float x, float hard, float pivot) {
  x = pow(clamp(x, 0.0, 1.0), log(0.5) / log(pivot));
  hard = max(hard, 0.05);
  float a = 1.0 / (1.0 + exp(0.5 * hard));
  return (1.0 / (1.0 + exp(-hard * (x - 0.5))) - a) / (1.0 - 2.0 * a);
}

float hardnessForSlope(float slope) {
  float u = sqrt(3.0 * max(slope - 1.0, 0.0));
  for (int i = 0; i < 10; i++) u = slope * tanh(max(u, 1e-3));
  return 4.0 * u;
}

vec4 applyFilter(vec4 c, vec2 uv) {
  // Transmitância do vidro por canal (luz linear), normalizada pelo canal mais aberto.
  vec3 glass = lmToLinear(lensColor);
  float top = max(glass.r, max(glass.g, glass.b));
  glass = top > 1e-4 ? glass / top : vec3(1.0);
  // Sensibilidade da emulsão pancromática (Tri-X / HP5) em R, G, B.
  vec3 film = vec3(0.25, 0.62, 0.13);
  float v = filmExposure(c.rgb, film * glass);
  float l = contrast >= 1.0
    ? paperCurve(v, hardnessForSlope(contrast), 0.46)
    : 0.46 + (paperCurve(v, 0.05, 0.46) - 0.46) * contrast;
  return vec4(vec3(clamp(l, 0.0, 1.0)), c.a);
}
