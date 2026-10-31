// ---- Cor em Oklab: L = claridade percebida (0 a 1), ab = cor. Matiz em graus: vermelho ~28, pele ~50,
// laranja ~55, dourado ~85, verde-amarelado ~120, verde ~140, ciano ~210, azul do céu ~250, magenta ~340.
vec3 toLab(vec3 srgb) { return lmToOklab(lmToLinear(srgb)); }
/** Oklab → sRGB. O que sai da gama perde saturação (mesma luminância e matiz) em vez de virar outra cor. */
vec3 fromLab(vec3 lab) {
  vec3 c = lmFromOklab(vec3(max(lab.x, 0.0), lab.yz));
  float y = clamp(lmLuma(c), 0.0, 1.0);
  float lo = min(c.r, min(c.g, c.b));
  float hi = max(c.r, max(c.g, c.b));
  float k = 1.0;
  if (lo < 0.0) k = min(k, y / max(y - lo, 1e-6));
  if (hi > 1.0) k = min(k, (1.0 - y) / max(hi - y, 1e-6));
  return lmToSrgb(mix(vec3(y), c, clamp(k, 0.0, 1.0)));
}
float hueDeg(vec3 lab) { return degrees(atan(lab.z, lab.y + 1e-7)); }
/** 1 no matiz `center` (graus), caindo até 0 a `width` graus; cores quase cinza não contam. */
float hueBand(vec3 lab, float center, float width) {
  float d = abs(mod(hueDeg(lab) - center + 540.0, 360.0) - 180.0);
  return (1.0 - smoothstep(width * 0.3, width, d)) * smoothstep(0.012, 0.045, length(lab.yz));
}
/** Peso de pele: matiz perto de 50°, croma moderado (laranja vivo não é pele), nem preto nem branco. */
float skinWeight(vec3 lab) {
  float d = abs(mod(hueDeg(lab) - 52.0 + 540.0, 360.0) - 180.0);
  float c = length(lab.yz);
  return (1.0 - smoothstep(12.0, 30.0, d)) * smoothstep(0.028, 0.055, c) * (1.0 - smoothstep(0.13, 0.19, c))
    * smoothstep(0.22, 0.38, lab.x) * (1.0 - smoothstep(0.93, 0.99, lab.x));
}
vec2 rotAB(vec2 ab, float deg) { float r = radians(deg); float s = sin(r), k = cos(r); return mat2(k, s, -s, k) * ab; }
/** Curva racional: inclinação s no fim (t = 1) e 1/s no começo; s = 1 não muda nada. */
float rcurve(float t, float s) { return t / ((s - 1.0) * (1.0 - t) + 1.0); }
/** Contraste em S em volta do pivô, sem cortar 0 nem 1 e sem esmagar os pretos (s = inclinação no pivô). */
float contrastL(float x, float s, float p) {
  x = clamp(x, 0.0, 1.0);
  return x < p ? p * rcurve(x / p, s) : 1.0 - (1.0 - p) * rcurve((1.0 - x) / (1.0 - p), s);
}
/** Pesos das faixas tonais em L (somam ~1): sombras, meios-tons, altas luzes. */
float wShadow(float L) { return 1.0 - smoothstep(0.08, 0.62, L); }
float wHigh(float L) { return smoothstep(0.42, 0.95, L); }
float wMid(float L) { return max(1.0 - wShadow(L) - wHigh(L), 0.0); }
/** Vibração em Oklab: realça o croma baixo mais que o alto; "skin" = quanto poupar a pele (0 a 1). */
vec3 vibranceLab(vec3 lab, float amount, float skin) {
  float c = length(lab.yz);
  float room = 1.0 - smoothstep(0.0, 0.2, c);
  float g = 1.0 + amount * room * room * (1.0 - skin * skinWeight(lab));
  lab.yz *= g;
  return lab;
}
/** Menor giro (graus, −180 a 180) para levar o matiz `from` até `to`. */
float hueDelta(float from, float to) { return mod(to - from + 540.0, 360.0) - 180.0; }
// ---- A pessoa (recorte da IA), com a borda alargada e suavizada para não aparecer recorte.
/** Recorte suavizado num raio de `radiusPx` px de 1080p (9 leituras); sem o recorte da IA devolve −1. */
float personSoft(vec2 uv, float radiusPx) {
  if (uHasPerson < 0.5) return -1.0;
  vec2 r = lmPxUv(radiusPx);
  float m = getPerson(uv) * 2.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398 + 0.39;
    m += getPerson(uv + vec2(cos(a), sin(a)) * r);
  }
  return m / 10.0;
}
/** Onde está a pessoa (bordas suaves); sem o recorte da IA, vale a imagem toda. */
float personOrAll(vec2 uv) { float p = personSoft(uv, 4.0); return p < 0.0 ? 1.0 : p; }

// Retrato claro (high-key): fundo quase branco, sombras abertas e pele luminosa, como estúdio de moda. Como no
// estúdio, quem clareia é a luz, não um véu: a claridade abre por uma curva em Oklab que sobe os meios-tons e as
// altas luzes e deixa os tons escuros (cabelo, sobrancelha, cílios) quase onde estavam, com o contraste deles.
// Com o recorte da IA, o fundo vai para o branco; perto da pessoa, os fios escuros que a máscara não pega ficam
// escuros sobre o fundo claro em vez de virarem fios cinza. "Suavidade" espalha as luzes num brilho macio (bloom em
// luz linear) que não cai por cima dos pretos.
vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 lab = toLab(c.rgb);
  float L0 = clamp(lab.x, 0.0, 1.0);
  // Quanto cada tom é aberto: nada nos escuros (L < ~0,3: cabelo preto, pupila), tudo dos meios-tons para cima.
  float open = smoothstep(0.2, 0.62, L0);
  float e = 1.0 + bright * 1.8;
  float lifted = 1.0 - pow(1.0 - L0, e);
  lab.x = L0 + (lifted - L0) * mix(0.18, 1.0, open);
  lab.yz *= 0.9 + 0.1 * (1.0 - bright);
  float person = personSoft(uv, 8.0);
  float bg = person < 0.0 ? smoothstep(0.78, 0.97, lab.x) * 0.6 : 1.0 - person;
  if (person >= 0.0) {
    // Perto da pessoa (~24 px), o que é quase preto é fio de cabelo solto: não vai para o branco com o fundo. Só o
    // quase preto: um fundo médio (árvore, parede) clareia igual, sem deixar um contorno escuro em volta da pessoa.
    float near = smoothstep(0.0, 0.3, personSoft(uv, 24.0));
    bg *= mix(1.0, smoothstep(0.2, 0.36, L0), near);
  }
  lab.x = mix(lab.x, 0.985, bg * bright * 0.85);
  lab.yz *= 1.0 - 0.75 * bg * bright;
  lab.yz += vec2(-0.001, -0.005) * wHigh(lab.x);
  vec3 lin = lmToLinear(fromLab(lab));
  // O brilho difuso não lava os pretos: a luz espalhada some em cima do que é escuro de verdade.
  vec3 glow = lmBloom(uv, 0.45, 0.55) * mix(0.3, 1.0, smoothstep(0.15, 0.5, L0));
  lin += glow * 0.9 * soft;
  return vec4(lmSoftClip(lmToSrgb(lin), 0.88), c.a);
}
