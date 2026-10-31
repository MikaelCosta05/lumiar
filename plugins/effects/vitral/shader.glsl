// Vitral: cacos de vidro colorido presos por perfis de chumbo.
// - Células de Voronoi com a distância exata até a borda (método de Inigo Quilez, em duas passadas): o chumbo
//   tem a mesma largura em todo o contorno, com a borda antisserrilhada.
// - Cada caco tem a cor média da imagem nele (nível de detalhe), mais saturada e iluminada por trás, com a textura
//   do vidro soprado (manchas suaves de fbm e um pouco de variação por caco).
// - O chumbo é arredondado: escuro, com um fio de brilho ao longo do perfil.
vec2 seed(vec2 cell) { return lmHash2(cell + 0.37) * 0.85 + 0.075; }

vec4 effect(vec2 uv) {
  vec2 aspect = vec2(ratio, 1.0);
  vec2 x = uv * aspect * cells;
  vec2 n = floor(x);
  vec2 f = x - n;

  // 1) ponto mais próximo
  vec2 mg = vec2(0.0), mr = vec2(0.0);
  float md = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 r = g + seed(n + g) - f;
      float d = dot(r, r);
      if (d < md) { md = d; mr = r; mg = g; }
    }
  }
  // 2) distância até a borda mais próxima (bissetrizes com os vizinhos)
  float edge = 8.0;
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      vec2 g = mg + vec2(float(i), float(j));
      vec2 r = g + seed(n + g) - f;
      vec2 dr = r - mr;
      if (dot(dr, dr) > 1e-5) edge = min(edge, dot(0.5 * (mr + r), normalize(dr)));
    }
  }

  vec2 cellId = n + mg;
  vec2 pointUv = (x + mr) / cells / aspect;
  float cellPx = resolution.y / cells;
  vec3 c = getColorLod(pointUv, max(log2(cellPx * 0.35), 0.0)).rgb;
  // Vidro: cor mais cheia (Oklab), um pouco mais escura no miolo grosso, manchas do sopro.
  vec3 lab = lmToOklab(lmToLinear(c));
  lab.yz *= 1.45;
  lab.x = mix(lab.x, 0.62, 0.18) * (0.92 + 0.16 * lmCellHash(cellId * 1.7 + 3.0));
  vec3 glass = clamp(lmToSrgb(lmFromOklab(lab)), 0.0, 1.0);
  vec2 a = lmCentered(uv);
  float mottle = lmFbm(a * cells * 2.2 + cellId * 3.1, 3);
  glass *= 0.9 + 0.16 * mottle;
  glass *= 1.0 - 0.12 * smoothstep(0.0, 0.45, edge);  // mais luz passa perto da borda (vidro mais fino)

  // Chumbo: meia largura em unidades de célula (~3 px de 1080p numa célula de 60 px), arredondado.
  float lw = 0.055;
  float aa = max(fwidth(edge), 1e-4);
  float leadMask = 1.0 - smoothstep(lw - aa, lw + aa, edge);
  float profile = clamp(edge / lw, 0.0, 1.0);
  float shine = exp(-pow((profile - 0.45) * 4.0, 2.0));
  vec3 lead = vec3(0.05, 0.05, 0.055) + vec3(0.16) * shine * 0.6;
  return vec4(mix(glass, lead, leadMask), 1.0);
}
