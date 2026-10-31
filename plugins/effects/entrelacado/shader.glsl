// Entrelaçado: o vídeo de TV é feito de dois campos, um com as linhas pares e outro com as ímpares, filmados com
// 1/59,94 s de diferença. Uma linha sim, outra não vem do campo anterior: o que está parado fica igual, o que se
// mexe vira o "pente". As linhas têm a espessura em px de 720p (como antes) e a troca entre elas é suavizada pela área que
// cada linha cobre no pixel (sem moiré quando as linhas ficam mais finas que o pixel).

/** Quanto de [0, x] (em linhas) cai nas linhas ímpares. */
float oddArea(float x) {
  float h = x * 0.5;
  return floor(h) + max(fract(h) * 2.0 - 1.0, 0.0);
}

vec4 effect(vec2 uv) {
  vec4 base = getColor(uv);
  float line = max(espessura * resolution.y / 720.0, 0.5);
  float y = (1.0 - uv.y) * resolution.y / line;
  float w = 1.0 / line; // um pixel, em linhas
  float odd = (oddArea(y + 0.5 * w) - oddArea(y - 0.5 * w)) / w;
  if (odd <= 0.0) return base;

  // O outro campo chegou 1/59,94 s antes e um pouco deslocado (o horizontal dos dois campos não bate certinho).
  float wobble = 0.5 + 0.5 * lmNoise(vec2(time * 1.7, uv.y * 3.0));
  vec3 field = getPast(uv + vec2(desvio * (0.5 + wobble), 0.0), 1.0 / 59.94).rgb;
  vec3 b = lmToLinear(base.rgb);
  vec3 other = mix(b, lmToLinear(field), forca) * (1.0 - escurecer);
  vec3 lin = mix(b, other, odd);
  // Quando o campo velho cobre só parte do pixel, a média sai em luz linear (como a tela mostraria).
  return vec4(lmToSrgb(lin), base.a);
}
