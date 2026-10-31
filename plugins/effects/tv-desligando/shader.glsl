// Desligar a TV de tubo: primeiro a deflexão vertical morre e a imagem se espreme numa linha; depois a horizontal,
// e a linha encolhe até um ponto, que vai apagando devagar (o fósforo ainda brilha). A energia do feixe é a mesma
// numa área cada vez menor, então a imagem esmagada fica mais clara até virar luz branca: isso é feito em luz
// linear e comprimido com a curva de filme, sem estourar em branco chapado. Borda suavizada em px, halo do vidro
// em volta da linha e do ponto, colapso com aceleração. No modo ligar, o mesmo caminho ao contrário.

vec4 effect(vec2 uv) {
  // 0 = imagem normal, 1 = TV apagada.
  float len = max(duracaoTv, 0.05);
  float p = modo < 0.5
    ? clamp((time - (duration - len)) / len, 0.0, 1.0)
    : 1.0 - clamp(time / len, 0.0, 1.0);
  if (p <= 0.0) return getColor(uv);

  float a = lmEaseInCubic(clamp(p / 0.45, 0.0, 1.0));            // espreme na vertical
  float b = lmEaseInCubic(clamp((p - 0.4) / 0.32, 0.0, 1.0));    // a linha encolhe até virar ponto
  float lineH = lmPx(2.5);
  float dotW = lmPx(5.0) / ratio;
  float sy = mix(1.0, lineH, a);
  float sx = mix(1.0, dotW, b);

  // Forma em px da tela: retângulo que encolhe, com borda de 1 px suavizada.
  vec2 q = (uv - 0.5) * resolution;
  vec2 half_ = max(0.5 * resolution * vec2(sx, sy), vec2(0.5));
  float sd = lmSdBox(q, half_);
  float inside = clamp(0.5 - sd, 0.0, 1.0);

  // A imagem esmagada, mais clara na proporção da área perdida (em luz linear).
  vec2 src = clamp((uv - 0.5) / vec2(sx, sy) + 0.5, 0.0, 1.0);
  vec3 lin = lmToLinear(getColor(src).rgb);
  float gain = pow(1.0 / (sx * sy), 0.5 * brilhoLinha);
  vec3 white = vec3(0.86, 0.93, 1.0);
  lin = mix(lin, vec3(lmLuma(lin)) * white + white * 0.15, smoothstep(0.4, 1.0, a) * brilhoLinha);
  lin *= gain;

  // Halo do vidro em volta da linha e do ponto.
  float px = resolution.y / 1080.0;
  float dist = max(sd, 0.0) / px;
  float halo = (exp(-dist / 6.0) * 0.6 + exp(-dist / 30.0) * 0.25) * a * a * brilhoLinha * min(gain * 0.25, 2.5) * (1.0 - inside);

  // O ponto apaga devagar (fósforo); no fim, preto.
  float fade = exp(-6.0 * max(p - 0.72, 0.0) / 0.28) * (1.0 - smoothstep(0.96, 1.0, p));
  vec3 col = (lin * inside + white * halo) * fade;
  // A compressão das altas luzes entra junto com o colapso (no começo a imagem continua igual à original).
  vec3 outc = mix(lmToSrgb(col), lmToSrgb(lmTonemap(col * 1.1)), smoothstep(0.0, 0.25, a));
  return vec4(clamp(outc, 0.0, 1.0), 1.0);
}
