// Painel de LED: cada célula é um diodo redondo (borda antisserrilhada) com a cor média da imagem naquela célula.
// A luz é somada em luz linear: miolo um pouco mais quente, um halo que vaza para o painel escuro em volta (cada
// ponto soma a luz dos 3×3 LEDs vizinhos) e as altas luzes comprimidas, em vez de estourar.
// Tamanho relativo a um vídeo 720p, como antes (o mesmo visual em qualquer resolução).
vec3 ledColor(vec2 cell, float cs, float lod) {
  vec2 c = (cell + 0.5) * cs / resolution + 0.5;
  return lmToLinear(getColorLod(c, lod).rgb);
}

vec4 effect(vec2 uv) {
  float cs = size * resolution.y / 720.0;               // célula em pixels da tela
  vec2 p = (uv - 0.5) * resolution / cs;                // grade centrada
  vec2 cell = floor(p);
  vec2 f = fract(p) - 0.5;
  float lod = max(log2(cs * 0.5), 0.0);
  float aa = 0.75 / cs;                                 // um pixel em unidades de célula

  vec3 light = vec3(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j));
      vec3 c = ledColor(cell + o, cs, lod);
      float d = length(f - o);
      light += c * exp(-d * d / 0.09) * 0.22;         // halo (o vidro do painel espalha um pouco)
    }
  }
  vec3 own = ledColor(cell, cs, lod);
  float d = length(f);
  float diode = clamp(0.5 - (d - 0.36) / aa, 0.0, 1.0);
  float core = exp(-d * d / 0.05);
  light += own * diode * (1.05 + 0.5 * core);
  vec3 panel = vec3(0.012, 0.012, 0.014) * (1.0 - diode);
  vec3 col = lmToSrgb(light + lmToLinear(panel));
  return vec4(lmSoftClip(col, 0.82), 1.0);
}
