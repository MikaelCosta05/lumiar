// Câmera térmica (paleta "ironbow" das câmeras FLIR): preto → anil → roxo → magenta → laranja → amarelo → branco.
// - O calor vem da luminância e, quando a IA acha uma pessoa, do corpo dela (pessoas são as coisas mais quentes da
//   cena; o rosto e as mãos, mais claros, ficam mais quentes que a roupa).
// - O sensor térmico tem pouca resolução: a imagem é levemente suavizada e ganha um chuvisco fino de sensor
//   (um quadro novo a 30 por segundo), com as cores interpoladas suavemente entre as paradas da paleta.
vec3 ironbow(float t) {
  vec3 c[7] = vec3[7](vec3(0.0, 0.0, 0.02), vec3(0.11, 0.02, 0.38), vec3(0.42, 0.0, 0.58), vec3(0.78, 0.07, 0.42),
                      vec3(0.98, 0.42, 0.04), vec3(1.0, 0.82, 0.18), vec3(1.0, 0.99, 0.9));
  float x = clamp(t, 0.0, 1.0) * 6.0;
  int i = int(min(floor(x), 5.0));
  float f = x - float(i);
  return mix(c[i], c[i + 1], f * f * (3.0 - 2.0 * f));
}

vec4 effect(vec2 uv) {
  float k = resolution.y / 1080.0;
  float l = lmLuma(getColorLod(uv, max(log2(2.5 * k), 0.0)).rgb);
  float body = getPerson(uv);
  // O ambiente fica mais frio que o corpo: a luminância só usa a parte de baixo da escala fora da pessoa.
  float heat = mix(l * 0.68, 0.6 + 0.4 * l, body * 0.85);
  heat = (heat - 0.5) * contrast + 0.5;
  // Ruído do sensor (NETD): fino, quadro a quadro.
  vec2 cell = floor(uv * resolution / max(1.5 * k, 1.0));
  heat += lmGaussianNoise(vec3(cell, floor(time * 30.0))) * 0.008;
  return vec4(ironbow(heat), 1.0);
}
