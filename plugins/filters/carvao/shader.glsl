// Desenho a carvão sobre papel de desenho:
// - Contornos por diferença de dois desfoques em tenda (~2 px e ~5 px de 1080p, lidos dos níveis de detalhe): o lado
//   escuro de cada borda vira linha contínua e suave, sem o serrilhado de um gradiente de vizinhos.
// - Sombreado: quanto mais escuro o tom, mais carvão; o carvão pega primeiro nos picos do dente do papel (ruído
//   fino e fixo), então os tons leves ficam granulados e os escuros fecham. Traços em diagonal (ruído esticado na
//   direção do traço), com hachura cruzada só nas sombras fundas, e uma base esfumada por baixo.
// - Papel creme com fibras; carvão preto-acinzentado (nunca preto puro).

float paperCurve(float x, float hard, float pivot) {
  x = pow(clamp(x, 0.0, 1.0), log(0.5) / log(pivot));
  hard = max(hard, 0.05);
  float a = 1.0 / (1.0 + exp(0.5 * hard));
  return (1.0 / (1.0 + exp(-hard * (x - 0.5))) - a) / (1.0 - 2.0 * a);
}

/** Imagem borrada (raio ~"px" de 1080p) pelos níveis de detalhe, com filtro em tenda (sem blocos). */
vec3 wideBlur(vec2 uv, float px) {
  float level = log2(max(px * resolution.y / 1080.0, 1.0)) - 1.0;
  vec2 texel = exp2(level) / resolution;
  vec3 s = getColorLod(uv, level).rgb * 4.0;
  s += (getColorLod(uv + vec2(texel.x, 0.0), level).rgb + getColorLod(uv - vec2(texel.x, 0.0), level).rgb
    + getColorLod(uv + vec2(0.0, texel.y), level).rgb + getColorLod(uv - vec2(0.0, texel.y), level).rgb) * 2.0;
  s += getColorLod(uv + texel, level).rgb + getColorLod(uv - texel, level).rgb
    + getColorLod(uv + vec2(texel.x, -texel.y), level).rgb + getColorLod(uv + vec2(-texel.x, texel.y), level).rgb;
  return s / 16.0;
}

float lum(vec3 c) { return lmToSrgb(vec3(lmLuma(lmToLinear(c)))).x; }

vec4 applyFilter(vec4 c, vec2 uv) {
  vec2 px = lmCentered(uv) * 1080.0;
  float fine = lum(wideBlur(uv, 1.5 * 1.4));
  float wide = lum(wideBlur(uv, 5.0));
  // Contorno: onde o ponto é mais escuro que a vizinhança.
  float edge = smoothstep(0.02, 0.09, wide - fine);
  // Tom do carvão.
  float tone = paperCurve(fine, 3.2, 0.5);
  float dark = pow(1.0 - tone, 1.35);
  // Dente do papel (picos pegam o carvão primeiro).
  float tooth = lmFbm(px * 0.42 + 2.7, 3) * 0.5 + 0.5;
  // Traços: ruído esticado ao longo de 35° (e -55° nas sombras fundas).
  vec2 a = lmRotate(px, 0.61);
  vec2 b = lmRotate(px, -0.96);
  float stroke = lmNoise(a * vec2(0.025, 0.42)) * 0.5 + 0.5;
  float cross_ = lmNoise(b * vec2(0.025, 0.42) + 13.0) * 0.5 + 0.5;
  float hatch = mix(stroke, min(stroke, cross_) * 1.25, smoothstep(0.55, 0.85, dark));
  float amount = dark * (0.75 + 0.5 * hatch);
  float deposit = smoothstep(0.0, 1.0, amount * 1.7 - (1.0 - tooth) * 0.85);
  // Base esfumada (o dedo espalhando o pó) e a linha de contorno, que também mostra o dente.
  float ink = max(deposit * 0.88, dark * 0.32);
  ink = max(ink, edge * (0.55 + 0.4 * tooth));
  // Papel com fibras.
  float fibers = lmFbm(px * vec2(0.03, 0.11) + 7.0, 2);
  vec3 paperColor = vec3(0.95, 0.935, 0.9) * (1.0 + fibers * 0.014);
  vec3 charcoal = vec3(0.1, 0.1, 0.11);
  vec3 col = mix(paperColor, charcoal, clamp(ink, 0.0, 1.0));
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
