// Desfocar (ou pixelar) uma área para esconder placa, rosto ou tela. O desfoque é gaussiano de verdade, em luz linear,
// sobre o mapa de níveis (sem os anéis e cópias da grade de amostras) e forte o bastante para não dar para ler; o
// tamanho vale em px de 1080p (igual em qualquer resolução). O pixelado usa a média de cada bloco (não um ponto só,
// que tremeria) e a borda da área é suavizada sem serrilhado.

/** Desfoque gaussiano largo (raio = 3 desvios, em uv de altura): espiral de 32 amostras sobre um nível já filtrado. */
vec3 heavyBlur(vec2 uv, float radius) {
  float rPx = radius * resolution.y;
  float level = clamp(log2(max(rPx / 6.0, 1.0)), 0.0, 7.0);
  float spin = lmIGN(gl_FragCoord.xy) * 6.28318530718;
  vec3 sum = vec3(0.0);
  float total = 0.0;
  for (int i = 0; i < 32; i++) {
    float r = sqrt((float(i) + 0.5) / 32.0);
    float a = float(i) * 2.39996323 + spin;
    float w = exp(-4.5 * r * r);
    vec2 o = vec2(cos(a), sin(a)) * r * radius * vec2(1.0 / ratio, 1.0);
    sum += lmToLinear(getColorLod(uv + o, level).rgb) * w;
    total += w;
  }
  return lmToSrgb(sum / total);
}

/** Pixelado: cada bloco com a cor média dele (4 leituras de um nível já filtrado). */
vec3 blocks(vec2 uv, float cellPx) {
  vec2 cell = lmPxUv(cellPx);
  vec2 c0 = (floor(uv / cell) + 0.5) * cell;
  float level = clamp(log2(max(cellPx * resolution.y / 1080.0 * 0.5, 1.0)), 0.0, 7.0);
  vec2 q = cell * 0.25;
  vec3 s = lmToLinear(getColorLod(c0 + vec2(-q.x, -q.y), level).rgb) + lmToLinear(getColorLod(c0 + vec2(q.x, -q.y), level).rgb)
         + lmToLinear(getColorLod(c0 + vec2(-q.x, q.y), level).rgb) + lmToLinear(getColorLod(c0 + vec2(q.x, q.y), level).rgb);
  return lmToSrgb(s * 0.25);
}

vec4 effect(vec2 uv) {
  // y da posição de cima para baixo (como o resto do editor); a textura tem y para cima.
  vec2 c = vec2(center.x, 1.0 - center.y);
  vec2 q = (uv - c) / max(size * 0.5, vec2(0.001));
  float d = oval > 0.5 ? length(q) : max(abs(q.x), abs(q.y));
  // Borda: "Borda suave" para dentro, sempre com pelo menos ~1 px de suavização.
  float aa = fwidth(d);
  float inside = 1.0 - smoothstep(1.0 - feather - aa, 1.0 + feather * 0.2 + aa, d);
  vec4 original = getColor(uv);
  if (inside <= 0.0) return original;
  vec3 hidden = pixelate > 0.5 ? blocks(uv, mix(6.0, 48.0, strength)) : heavyBlur(uv, mix(0.027, 0.16, strength));
  return vec4(mix(original.rgb, hidden, inside), mix(original.a, 1.0, inside));
}
