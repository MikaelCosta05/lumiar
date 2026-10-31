// P&B de alto contraste (papel grau 5 / cópia "lith"): quase tudo vira preto ou branco puro.
// - Exposição com filtro amarelo (#8) em película pancromática, somada em luz linear: céu um pouco mais escuro,
//   pele clara e limpa.
// - Curva de papel muito dura em vez de um degrau: a passagem do preto para o branco acompanha a imagem, sem
//   serrilhado. Antes da curva, a luminância é alisada 1,2 px (de 1080p) para que o ruído da compressão do vídeo
//   não vire pontinhos pretos e brancos nas áreas de meio-tom.

float filmExposure(vec3 c, vec3 w) {
  return lmToSrgb(vec3(max(dot(lmToLinear(c), w / dot(w, vec3(1.0))), 0.0))).x;
}

float paperCurve(float x, float hard, float pivot) {
  x = pow(clamp(x, 0.0, 1.0), log(0.5) / log(pivot));
  hard = max(hard, 0.05);
  float a = 1.0 / (1.0 + exp(0.5 * hard));
  return (1.0 / (1.0 + exp(-hard * (x - 0.5))) - a) / (1.0 - 2.0 * a);
}

vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 film = vec3(0.30, 0.63, 0.07);
  vec3 smooth_ = lmGaussianBlur(uv, lmPx(1.2)).rgb;
  float v = mix(filmExposure(c.rgb, film), filmExposure(smooth_, film), 0.6);
  float l = paperCurve(v, 13.0, 0.47);
  return vec4(vec3(clamp(l, 0.0, 1.0)), c.a);
}
