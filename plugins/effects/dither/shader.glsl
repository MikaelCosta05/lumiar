// Dither 1-bit: só duas cores, pontilhado ordenado (Bayer 8×8, 64 tons) como nos computadores e no Macintosh antigos.
// O pixel tem o tamanho em px de 720p, como antes (inteiro, para a grade não ficar irregular) e a cor de cada pixel é a média
// da área dele (sem cintilar nas bordas finas). A proporção de pontos claros é calculada em luz linear entre as duas
// cores escolhidas: de longe, o brilho médio bate com o da imagem.

float bayer8(vec2 p) {
  ivec2 q = ivec2(mod(floor(p), 8.0));
  int x = q.x, y = q.y ^ q.x;
  // Intercala os bits de x e de (x xor y): a matriz de Bayer clássica.
  int v = ((y & 1) << 5) | ((x & 1) << 4) | ((y & 2) << 2) | ((x & 2) << 1) | ((y & 4) >> 1) | ((x & 4) >> 2);
  return (float(v) + 0.5) / 64.0;
}

/** Média da vizinhança (fixa, igual para todo o pixel grande): 12 pontos em dois anéis, em luz linear. */
vec3 around(vec2 c, float r) {
  vec3 s = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 0.5236 + (i < 6 ? 0.0 : 0.2618);
    float rr = i % 2 == 0 ? r : r * 0.5;
    s += lmToLinear(getColor(c + vec2(cos(a), sin(a)) * rr * vec2(1.0 / ratio, 1.0)).rgb);
  }
  return s / 12.0;
}

vec4 effect(vec2 uv) {
  float k = max(1.0, floor(pixel * resolution.y / 720.0 + 0.5));
  vec2 pix = floor(uv * resolution / k);
  vec2 cellUv = k / resolution;
  vec2 base = pix * cellUv;
  // Média da área do pixel grande (4 amostras), em luz linear.
  vec3 lin = vec3(0.0);
  lin += lmToLinear(getColor(base + cellUv * vec2(0.25, 0.25)).rgb);
  lin += lmToLinear(getColor(base + cellUv * vec2(0.75, 0.25)).rgb);
  lin += lmToLinear(getColor(base + cellUv * vec2(0.25, 0.75)).rgb);
  lin += lmToLinear(getColor(base + cellUv * vec2(0.75, 0.75)).rgb);
  float y = lmLuma(lin * 0.25);
  float y0 = lmLuma(lmToLinear(dark));
  float y1 = lmLuma(lmToLinear(light));
  float tLin = clamp((y - y0) / max(y1 - y0, 1e-4), 0.0, 1.0);
  // Em pontos grandes o olho não integra tudo em luz linear: o meio-termo com o brilho percebido segura os meios-tons.
  float p0 = lmToSrgb(vec3(y0)).x, p1 = lmToSrgb(vec3(y1)).x;
  float tPer = clamp((lmToSrgb(vec3(y)).x - p0) / max(p1 - p0, 1e-4), 0.0, 1.0);
  float t = mix(tLin, tPer, 0.6);
  // Realce de bordas (como os conversores de imagem da época): o desenho não some nos meios-tons.
  float aroundT = clamp((lmToSrgb(vec3(lmLuma(around(base + cellUv * 0.5, k * 3.0 / resolution.y)))).x - p0) / max(p1 - p0, 1e-4), 0.0, 1.0);
  t = clamp(t + (tPer - aroundT) * 0.8, 0.0, 1.0);
  float on = step(bayer8(pix), t);
  return vec4(mix(dark, light, on), 1.0);
}
