// Contorno brilhante: um tubo de neon acompanha o corpo da pessoa.
// - A distância até a pessoa sai da máscara borrada por uma gaussiana (48 amostras fixas numa espiral, sem acaso):
//   numa borda, a máscara borrada vale Φ(−d/σ), e invertendo (aproximação logística) temos a distância com sinal,
//   contínua e suave. O traço fica limpo, sem os degraus da busca em anéis, e arredonda as quinas da máscara.
// - O brilho em volta é a máscara borrada numa escala maior (cai como luz de verdade, sem borda).
// - Tudo é somado como luz em luz linear, com as altas luzes comprimidas; o miolo do tubo tende ao branco.
// Tamanhos em px de 1080p.
const int TAPS = 48;

float personBlur(vec2 uv, float sigmaPx) {
  vec2 toUv = vec2(1.0 / ratio, 1.0) / 1080.0;
  float sum = 0.0, wsum = 0.0;
  for (int i = 0; i < TAPS; i++) {
    float r = sqrt((float(i) + 0.5) / float(TAPS)) * 2.5;
    float a = float(i) * 2.39996323;
    float w = exp(-0.5 * r * r);
    sum += getPerson(uv + vec2(cos(a), sin(a)) * r * sigmaPx * toUv) * w;
    wsum += w;
  }
  return sum / wsum;
}

/** Distância com sinal (px de 1080p) até a borda da pessoa: positiva fora. */
float personDistance(float blurred, float sigmaPx) {
  float m = clamp(blurred, 1e-4, 1.0 - 1e-4);
  return sigmaPx * log((1.0 - m) / m) / 1.702;
}

vec4 effect(vec2 uv) {
  vec4 base = getColor(uv);
  float offset = distancia * 36.0;
  float width = (1.5 + largura * 9.0) * 1.5;
  float glowSize = (6.0 + brilho * 14.0) * 1.5;

  float glowBlur = personBlur(uv, glowSize);
  if (glowBlur < 2e-4) return base;
  float sigma = max((offset + width) * 0.55, 3.0);
  float d = personDistance(personBlur(uv, sigma), sigma);

  float aa = 0.75 * 1080.0 / resolution.y;
  float line = 1.0 - smoothstep(width * 0.5 - aa, width * 0.5 + aa, abs(d - offset - width * 0.5));
  float outside = smoothstep(offset - aa, offset + width * 0.5, d);
  float glow = (1.0 - exp(-glowBlur * 3.2)) * outside;
  if (offset > 0.5) glow *= smoothstep(0.0, aa * 2.0, d);

  float beat = 0.5 + 0.5 * sin(time * pulso * PI);
  vec3 col = arcoiris > 0.5 ? lmHsvToRgb(vec3(fract(time * 0.15 + uv.y * 0.6), 0.85, 1.0)) : mix(cor, cor2, beat);
  float strength = brilho * (0.75 + 0.25 * beat);
  vec3 lin = lmToLinear(base.rgb) + lmToLinear(col) * glow * strength * 1.4;
  vec3 tube = lmToLinear(mix(col, vec3(1.0), 0.35)) * 1.15;
  lin = mix(lin, tube + lmToLinear(col) * 0.15, line);
  return vec4(lmSoftClip(lmToSrgb(lin), 0.85), base.a);
}
