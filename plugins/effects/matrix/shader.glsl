// Matrix: chuva de código verde por cima da imagem.
// - Cada célula desenha um caractere de verdade: traços (segmentos com distância exata e borda antisserrilhada)
//   sorteados numa grade 3×5, como os katakana espelhados do filme, trocando de símbolo em ritmos diferentes.
// - Cada coluna tem a sua velocidade; a "cabeça" da gota é quase branca e o rastro se apaga célula a célula.
// - Os caracteres brilham (halo curto em volta do traço) e a luz soma em luz linear sobre a imagem escurecida.
// Tamanho relativo a um vídeo 720p, como antes.
float glyph(vec2 p, uint bits) {
  // Nós da grade: x em {-1, 0, 1} * 0,3; y em {-2..2} * 0,18.
  vec2 s = vec2(0.3, 0.18);
  float d = 1e3;
  int b = 0;
  // Horizontais: 2 por linha, 5 linhas.
  for (int j = -2; j <= 2; j++) {
    for (int i = -1; i <= 0; i++) {
      if (((bits >> uint(b)) & 1u) == 1u) d = min(d, lmSdSegment(p, vec2(float(i), float(j)) * s, vec2(float(i + 1), float(j)) * s));
      b++;
    }
  }
  // Verticais: 4 por coluna, 3 colunas.
  for (int i = -1; i <= 1; i++) {
    for (int j = -2; j <= 1; j++) {
      if (((bits >> uint(b)) & 1u) == 1u) d = min(d, lmSdSegment(p, vec2(float(i), float(j)) * s, vec2(float(i), float(j + 1)) * s));
      b++;
    }
  }
  // Duas diagonais.
  if (((bits >> 22u) & 1u) == 1u) d = min(d, lmSdSegment(p, vec2(-1.0, 1.0) * s, vec2(0.0, 0.0)));
  if (((bits >> 23u) & 1u) == 1u) d = min(d, lmSdSegment(p, vec2(0.0, 0.0), vec2(1.0, -2.0) * s));
  return d;
}

vec4 effect(vec2 uv) {
  float cs = size * resolution.y / 720.0;              // célula em pixels da tela
  vec2 pix = vec2(uv.x * resolution.x, (1.0 - uv.y) * resolution.y);
  vec2 id = floor(pix / cs);
  vec2 f = pix / cs - id - 0.5;                         // -0,5 a 0,5 dentro da célula (y para baixo)

  // A gota da coluna (a mesma conta de antes, medida no centro da célula: o rastro anda de célula em célula).
  float colRand = lmHash(vec2(id.x, 3.1));
  float head = fract(time * speed * (0.15 + 0.25 * colRand) + colRand * 5.0);
  float cy = (id.y + 0.5) * cs / resolution.y;        // de cima para baixo
  float d = fract(head - cy);
  float trail = exp(-d * 7.0) * step(0.0, d);
  float isHead = 1.0 - smoothstep(0.0, 1.5 * cs / resolution.y, d);

  // Símbolo: troca em ritmos diferentes por célula.
  float rate = 2.0 + 6.0 * lmHash(id + 0.7);
  uint bits = lmPcg3(uvec3(ivec3(int(id.x), int(id.y), int(floor(time * rate + lmHash(id) * 10.0))))).x;
  bits &= lmPcg3(uvec3(bits, 7u, 11u)).x | 0x00F0F0Fu;  // menos traços que metade: fica legível
  vec2 p = vec2(-f.x, -f.y);                            // espelhado, como no filme
  float sd = glyph(p, bits);
  float w = 0.055;
  float aa = 1.0 / cs;
  float ink = 1.0 - smoothstep(w - aa, w + aa, sd);
  float glow = exp(-max(sd - w, 0.0) / 0.07) * 0.35;

  float l = lmLuma(getColor(uv).rgb);
  vec3 back = lmToLinear(vec3(0.0, l * 0.6, l * 0.2)) * backdrop;
  vec3 green = lmToLinear(vec3(0.3, 1.0, 0.45));
  vec3 white = lmToLinear(vec3(0.82, 1.0, 0.86));
  vec3 light = (green * trail + white * isHead * 1.2) * (ink + glow);
  vec3 col = lmToSrgb(back + light);
  return vec4(lmSoftClip(col, 0.85), 1.0);
}
