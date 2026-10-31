// Granulado de filme: grão de película (aglomerados irregulares, mais fortes nos meios-tons, um quadro de grão a
// cada 1/24 s) e a cintilação da exposição de projetor, também quadro a quadro de filme (24 por segundo), com uma
// oscilação lenta por baixo. A cintilação é um ganho de exposição em luz linear (não um véu cinza).

vec4 effect(vec2 uv) {
  vec4 c = getColor(uv);
  float frame = floor(time * 24.0);
  // Cintilação: cada quadro de filme com uma exposição um pouco diferente.
  float flick = (lmHash(vec2(frame, 3.1)) - 0.5) * 0.09 + lmNoise(vec2(time * 2.3, 1.7)) * 0.05;
  vec3 lin = lmToLinear(c.rgb) * exp2(flick * flicker * 1.4);
  vec3 col = lmToSrgb(lin);
  col = lmFilmGrain(col, uv, amount * 2.6, size, time);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
