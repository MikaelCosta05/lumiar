// Neve em 5 planos de profundidade, com paralaxe: os flocos de perto são grandes, desfocados (macios e
// transparentes) e caem mais rápido na tela; os de longe são pequenos, nítidos, lentos e muitos. Cada floco tem o
// tamanho, a velocidade e o balanço de lado próprios (ritmo, fase e amplitude sorteados por floco) e um vento leve leva a
// neve toda de lado. A cor do floco acompanha a luz da cena (fica acinzentado no escuro), sem estourar.

/** Cobertura de flocos numa camada (0 a 1). z = 0 perto, 1 longe. */
float snowLayer(vec2 p, float z, float seed) {
  float cell = mix(0.17, 0.035, z);
  float fall = speed * mix(0.20, 0.055, z);
  vec2 q = (p + vec2(-time * speed * 0.025 * mix(1.6, 0.6, z), time * fall)) / cell + seed * vec2(5.31, 2.77);
  vec2 b = floor(q - 0.5);
  float pixel = 1.0 / (resolution.y * cell); // 1 px desta resolução, em células
  float cover = 0.0;
  for (int j = 0; j < 2; j++) {
    for (int i = 0; i < 2; i++) {
      vec2 id = b + vec2(float(i), float(j));
      vec3 h = lmHash3(id + seed * 13.7);
      if (h.z > mix(0.35, 0.75, z)) continue;
      float h2 = lmHash(id * 1.71 + seed);
      // Balanço lateral (o floco oscila ao cair), cada um com o seu ritmo, fase e amplitude.
      float w = mix(0.8, 1.8, h2) * (0.4 + speed);
      vec2 sway = vec2(sin(time * w + h.x * 6.2831853) * mix(0.08, 0.18, h.y), cos(time * w * 0.7 + h.y * 6.2831853) * 0.04);
      vec2 center = id + 0.25 + h.xy * 0.5 + sway;
      float r = mix(0.05, 0.14, h2 * h2) * size * mix(1.0, 0.8, z);
      float d = length(q - center);
      // Perto = desfocado (borda larga); longe = borda de 1 px.
      float soft = max(r * mix(0.85, 0.25, z), pixel * 1.2);
      float flake = 1.0 - smoothstep(r - soft * 0.5, r + soft * 0.5, d);
      float opacity = mix(0.45, 0.95, z) * mix(0.75, 1.0, h.x);
      cover = max(cover, flake * opacity);
    }
  }
  return cover;
}

vec4 effect(vec2 uv) {
  vec3 lin = lmToLinear(getColor(uv).rgb);
  vec3 ambient = lmToLinear(getColorLod(uv, 6.0).rgb);
  // Ar de inverno: um véu frio bem leve.
  lin = mix(lin, vec3(lmLuma(ambient)) * vec3(0.95, 0.98, 1.05), 0.06 * amount);
  vec2 p = lmCentered(uv);
  float snow = 0.0;
  for (int i = 0; i < 5; i++) {
    float z = float(i) / 4.0;
    float s = snowLayer(p, 1.0 - z, float(i) + 1.0);
    snow = 1.0 - (1.0 - snow) * (1.0 - s);
  }
  // O floco é branco frio, iluminado pela cena (no escuro fica cinza-azulado, no sol fica branco).
  float lit = clamp(0.35 + lmLuma(ambient) * 1.4, 0.35, 1.0);
  vec3 flakeColor = vec3(0.90, 0.94, 1.0) * lit;
  lin = mix(lin, flakeColor, snow * amount);
  return vec4(lmToSrgb(lin), 1.0);
}
