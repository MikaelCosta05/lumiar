// Meio-tom de gráfica (quadrinhos/revista).
// - Retícula de ponto redondo (função de ponto cosseno, contínua): pontos redondos nos claros, que se tocam em
//   xadrez a 50% e viram furos redondos nos escuros. O tom é lido em cada pixel (como no RIP), já com a média do
//   tamanho do ponto, então o desenho dos pontos acompanha a imagem sem degraus entre células.
// - Em cores, quatro retículas CMYK com os ângulos clássicos (C 15°, M 75°, Y 0°, K 45°), tintas que se multiplicam
//   como na impressão e preto com substituição de cinza (GCR). Sem cor, só a retícula preta a 45°.
// - Borda dos pontos antisserrilhada pela derivada do pixel, com um leve tremido da tinta no papel.
// Tamanho em px de um vídeo 1080p.

vec2 rot(vec2 p, float a) { float s = sin(a), c = cos(a); return vec2(c * p.x + s * p.y, -s * p.x + c * p.y); }

float spot(vec2 p, float angle, float cell) {
  vec2 q = rot(p, angle) / cell * 6.28318530718;
  return 0.5 * (cos(q.x) + cos(q.y));  // 1 no centro do ponto, -1 no meio do furo; contínuo em toda parte
}

/** Cobertura da tinta (0 a 1) da retícula num tom de 0 (nada) a 1 (chapado). */
float screenInk(vec2 p, float angle, float cell, float tone, float rough) {
  float sp = spot(p, angle, cell) + rough;
  float thr = 1.0 - 2.0 * clamp(tone, 0.0, 1.0);
  float w = max(fwidth(sp), 1e-4) * 0.7;
  return smoothstep(thr - w, thr + w, sp) * step(0.003, tone);
}

vec4 effect(vec2 uv) {
  float cell = max(size, 2.0);
  vec2 p = lmCentered(uv) * 1080.0;
  // Média do tom no tamanho do ponto.
  float lod = max(log2(cell * 0.55 * resolution.y / 1080.0), 0.0);
  vec3 c = clamp(getColorLod(uv, lod).rgb, 0.0, 1.0);

  // Tinta tremida e papel.
  float rough = lmNoise(p / 1.7) * 0.05 + lmNoise(p / 7.0 + 3.0) * 0.04;
  vec3 paper = vec3(0.97, 0.95, 0.9) * (1.0 + lmNoise(p / 3.0 + 9.0) * 0.012);

  // Separação CMYK com GCR.
  vec3 cmy = 1.0 - c;
  float kk = min(cmy.r, min(cmy.g, cmy.b)) * 0.9;
  vec3 cmyk = clamp((cmy - kk) / max(1.0 - kk, 1e-3), 0.0, 1.0);
  // Ganho de ponto: o tom da imagem leve para a retícula (a tinta "engorda" no papel).
  float mono = pow(1.0 - lmLuma(c), 1.1);
  float kTone = mix(mono, kk, colorful);
  vec3 cTone = pow(cmyk, vec3(1.1)) * colorful;

  float inkK = screenInk(p, radians(45.0), cell, kTone, rough);
  float inkC = screenInk(p, radians(15.0), cell, cTone.r, rough);
  float inkM = screenInk(p, radians(75.0), cell, cTone.g, rough);
  float inkY = screenInk(p, radians(0.0), cell, cTone.b, rough);

  vec3 cyan = vec3(0.0, 0.66, 0.93);
  vec3 magenta = vec3(0.92, 0.05, 0.55);
  vec3 yellow = vec3(1.0, 0.93, 0.0);
  vec3 black = vec3(0.08, 0.08, 0.09);
  vec3 col = paper;
  col *= mix(vec3(1.0), cyan, inkC);
  col *= mix(vec3(1.0), magenta, inkM);
  col *= mix(vec3(1.0), yellow, inkY);
  col *= mix(vec3(1.0), black, inkK);
  return vec4(col, 1.0);
}
