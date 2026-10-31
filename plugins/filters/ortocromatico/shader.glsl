// Filme ortocromático (o P&B do cinema mudo, até os anos 1920):
// - A emulsão é cega ao vermelho (só vê do azul ao amarelo-esverdeado): batom e vermelhos ficam quase pretos,
//   a pele escurece e mostra cada sarda, olhos claros e céu azul saem brancos. Soma feita em luz linear.
// - "Contraste": acima de 1, curva de papel com essa inclinação no meio-tom e pé/ombro suaves; abaixo, a imagem
//   fica lavada (véu de laboratório).
// - "Oscilação": a exposição de cada quadro varia (cópia e manivela da época, a 18 quadros por segundo), com uma
//   deriva lenta por cima, e a vinheta da lente respira junto.
// - Sem camada anti-halo: as luzes fortes ganham um halo cinza em volta. Grão grosso de emulsão antiga.

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
  float frame = floor(time * 18.0);
  // Sensibilidade ortocromática (R, G, B em luz linear): quase nada de vermelho.
  vec3 ortho = vec3(0.03, 0.42, 0.55);
  float y = dot(lmToLinear(c.rgb), ortho);
  // Halo: a luz forte atravessa a emulsão, bate no fundo da base e volta espalhada.
  vec3 glowRgb = lmBloom(uv, 0.5, 0.4);
  y += dot(glowRgb, ortho) * 0.35;
  // Oscilação de exposição por quadro (em diafragmas), mais uma deriva suave.
  float stops = ((lmHash(frame + 0.5) - 0.5) * 0.34 + lmNoise(vec2(time * 1.3, 4.7)) * 0.12) * flick;
  y *= exp2(stops);
  float v = lmToSrgb(vec3(max(y, 0.0))).x;
  float l = paperCurve(v, hardnessForSlope(max(contrast, 1.0)) + 0.9, 0.5);
  if (contrast < 1.0) l = 0.5 + (l - 0.5) * contrast;
  l = mix(0.02, 0.97, l);
  // Vinheta de lente antiga, respirando com a oscilação.
  float vig = lmVignette(uv, 0.45 + 0.25 * flick + (lmHash(frame + 7.3) - 0.5) * 0.12 * flick, 0.5);
  l = lmToSrgb(vec3(lmToLinear(vec3(l)).x * vig)).x;
  // Grão de emulsão antiga, trocado a cada quadro de 18 fps.
  l = lmLuma(lmFilmGrain(vec3(l), uv, 0.55, 1.8, (frame + 0.5) / 24.0));
  vec3 col = vec3(l) * vec3(1.0, 0.99, 0.965);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
