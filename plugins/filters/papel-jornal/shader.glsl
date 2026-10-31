// Meio-tom de jornal (retícula AM a 45°, ~85 linhas por polegada) sobre papel-jornal amarelado:
// - Como no RIP de uma impressora de verdade, a imagem contínua é comparada pixel a pixel com a função de ponto da
//   retícula (pontos redondos que se tocam a 50% e viram furos brancos nas sombras): o ponto segue a borda da
//   imagem e a borda de cada ponto é suavizada em 1 px (sem serrilhado).
// - A retícula tem 7,5 px de 1080p em qualquer resolução (a miniatura bate com o vídeo), com a proporção certa
//   (pontos redondos). A imagem é alisada no tamanho da célula antes, para não aparecer moiré.
// - Ganho de ponto do papel-jornal, tinta que não é preto puro, densidade irregular, e papel com fibras e
//   pequenas impurezas da reciclagem.

float lum(vec3 c) { return lmToSrgb(vec3(lmLuma(lmToLinear(c)))).x; }

vec4 applyFilter(vec4 c, vec2 uv) {
  float cellPx = 7.5;
  vec2 px = lmCentered(uv) * 1080.0;
  float v = lum(lmGaussianBlur(uv, lmPx(cellPx * 0.7)).rgb);
  // Cobertura de tinta pedida (com o ganho de ponto do papel poroso: os meios-tons escurecem).
  float cover = clamp(pow(1.0 - v, 1.12) * 1.04 - 0.02, 0.0, 1.0);
  vec2 q = lmRotate(px, 0.7853982) / cellPx;
  // Função de ponto: 0 no centro do ponto, 1 no centro do furo; contínua, então a derivada é boa para suavizar.
  float spot = 0.5 - 0.25 * (cos(6.2831853 * q.x) + cos(6.2831853 * q.y));
  float sd = spot - cover;
  float ink = clamp(0.5 - sd / max(fwidth(sd), 1e-5), 0.0, 1.0);
  // Papel: fibras e impurezas.
  float fibers = lmFbm(px * vec2(0.02, 0.08) + 5.0, 4);
  vec3 paperColor = vec3(0.905, 0.88, 0.8) * (1.0 + fibers * 0.035);
  float fleck = smoothstep(0.62, 0.8, lmNoise(px * 0.35 + 21.0)) * smoothstep(0.3, 0.6, lmNoise(px * 0.02 + 3.0));
  paperColor *= 1.0 - fleck * 0.18;
  // Tinta com densidade irregular.
  float density = 0.9 + 0.1 * lmFbm(px * 0.01 + 9.0, 3);
  vec3 inkColor = vec3(0.13, 0.13, 0.145);
  vec3 col = paperColor * mix(vec3(1.0), inkColor / vec3(0.905, 0.88, 0.8), ink * density);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
