// Chuva em 4 planos de profundidade. Cada gota é um risco do tamanho do caminho que ela faz com o obturador aberto
// (comprimento = velocidade × 1/25 s), então velocidade e comprimento sempre combinam: as de perto são rápidas,
// longas, largas e desfocadas; as de longe são finas, curtas e lentas na tela. A inclinação gira a queda inteira (o
// risco aponta para onde a gota anda). Cada coluna tem velocidade própria (sem fileiras alinhadas), a borda do risco
// tem pelo menos ~1 px de suavização e a cena fica mais fria, escura e enevoada, como num dia de chuva.

/** Quanto de gota há neste ponto numa camada (0 a 1). "p" já está girado: a chuva cai para −y. */
float rainLayer(vec2 p, float z, float seed, float density) {
  float v = mix(3.0, 1.0, z) * speed;                       // alturas de tela por segundo
  float len = max(v / 25.0, mix(lmPx(14.0), lmPx(5.0), z)); // risco do obturador (1/25 s)
  float halfW = mix(lmPx(2.2), lmPx(0.6), z);               // meia largura
  float cw = mix(0.045, 0.011, z);                          // largura da coluna
  float ch = len + mix(0.16, 0.05, z);                      // altura da célula (a gota cabe inteira)
  float col = floor(p.x / cw);
  float hc = lmHash(vec2(col, seed));
  float y = p.y + time * v * (0.85 + 0.3 * hc) + hc * 23.0;
  float row = floor(y / ch);
  vec3 h = lmHash3(vec2(col, row) + seed * 7.13);
  if (h.z > density) return 0.0;
  float cx = (col + 0.25 + 0.5 * h.x) * cw;
  float cy = len * 0.5 + h.y * (ch - len);
  float dx = p.x - cx;
  float dy = (y - row * ch) - cy;
  // Seção do risco: gaussiana com pelo menos ~0,7 px (sem serrilhado); pontas macias.
  float w = max(halfW, lmPx(0.7));
  float across = exp(-dx * dx / (w * w));
  float ends = 1.0 - smoothstep(len * 0.5 - min(len * 0.35, w * 6.0), len * 0.5, abs(dy));
  // As de perto são desfocadas (largas e transparentes); as finas de longe, mais apagadas pelo ar.
  float opacity = mix(0.30, 0.55, smoothstep(0.0, 0.5, z)) * mix(1.0, 0.7, smoothstep(0.5, 1.0, z));
  return across * ends * opacity * (0.6 + 0.4 * h.x);
}

vec4 effect(vec2 uv) {
  vec3 src = getColor(uv).rgb;
  vec3 lin = lmToLinear(src);
  // Dia de chuva: menos luz, cor mais fria e lavada, um véu de água no ar.
  vec3 cool = lmToLinear(lmWhiteBalance(lmSaturate(src, 1.0 - 0.25 * amount), -0.18 * amount, 0.0));
  lin = cool * (1.0 - 0.2 * amount);
  vec3 ambient = lmToLinear(getColorLod(uv, 6.0).rgb);
  lin = mix(lin, vec3(lmLuma(ambient)) * vec3(0.92, 0.96, 1.0), 0.08 * amount);

  // A queda girada pela inclinação (positiva: o vento empurra para a esquerda).
  float ang = slant * 0.6;
  vec2 p = lmRotate(lmCentered(uv), ang);
  float rain = 0.0;
  for (int i = 0; i < 4; i++) {
    float z = float(i) / 3.0;
    float density = mix(0.10, 0.42, amount) * mix(0.55, 1.0, z);
    float d = rainLayer(p + vec2(float(i) * 3.71, 0.0), z, float(i) + 1.0, density);
    rain = 1.0 - (1.0 - rain) * (1.0 - d);
  }
  // A gota refrata a luz do céu e da cena: um cinza claro e frio que acompanha o ambiente.
  vec3 drop = mix(vec3(0.55, 0.60, 0.68), ambient * 1.6 + 0.18, 0.5);
  lin = mix(lin, drop, rain * min(amount * 1.3, 1.0)) + drop * rain * 0.15 * amount;
  return vec4(lmToSrgb(lin), 1.0);
}
