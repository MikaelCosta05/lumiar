// Solarização (efeito Sabattier): as partes claras se invertem, como uma foto revelada sob luz.
// - A curva é a de verdade: até "A partir de" a imagem segue normal; dali em diante o tom volta a cair até o
//   preto, de forma contínua (sem o salto de valor que fazia bordas serrilhadas e contornos picotados). Com o
//   valor padrão (0,5) é exatamente o "claro vira escuro" de antes. Feito por canal, como antes (cores trocam).
// - O pico da curva é levemente arredondado, e as linhas de Mackie (o contorno escuro que a solarização deixa nas
//   bordas entre a parte normal e a invertida) aparecem finas, com 1,5 px de 1080p, só onde há borda.

vec3 solarize(vec3 x, float t) {
  t = clamp(t, 0.02, 0.98);
  vec3 rising = x;
  vec3 falling = t * (1.0 - x) / (1.0 - t);
  // Mínimo suave (raio 0,03) entre a subida e a descida: o pico não fica com quina dura.
  float k = 0.03;
  vec3 h = clamp(0.5 + 0.5 * (falling - rising) / k, 0.0, 1.0);
  return mix(falling, rising, h) - k * h * (1.0 - h);
}

vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 col = solarize(clamp(c.rgb, 0.0, 1.0), threshold);
  // Linhas de Mackie: no contorno onde a luminância cruza o limiar, só onde há borda de verdade.
  float l = lmToSrgb(vec3(lmLuma(lmToLinear(lmGaussianBlur(uv, lmPx(1.2)).rgb)))).x;
  float grad = length(vec2(dFdx(l), dFdy(l))) * resolution.y / 1080.0; // variação por px de 1080p
  float distPx = abs(l - threshold) / max(grad, 1e-4);
  float line = exp(-distPx * distPx / (1.5 * 1.5)) * smoothstep(0.008, 0.03, grad);
  col *= 1.0 - 0.35 * line;
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
