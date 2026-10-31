// Câmera de vigilância antiga (circuito fechado dos anos 90): sensor CCD barato com ~330 linhas de resolução
// (imagem mole, não em blocos), quase sem cor e fria, pretos esmagados pelo ganho automático e chiado de vídeo
// forte nas sombras, em grãos deitados ao longo das 480 linhas, quadro a quadro (29,97 por segundo). As luzes
// fortes deixam o risco vertical do CCD (smear) e um pouco de brilho; a lente barata escurece os cantos e uma
// barra de zumbido passa devagar.

// ---- Sinal de vídeo analógico (NTSC): 480 linhas, 29,97 quadros e 59,94 campos por segundo.
const float LINES = 480.0;
vec3 toYiq(vec3 c) { return mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312) * c; }
vec3 toRgb(vec3 y) { return mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703) * y; }
/** Ruído suave ao longo da linha (x em células), independente de uma linha para a outra: -1 a 1. */
float streak(float x, float line, float seed) {
  float i = floor(x);
  float f = x - i;
  f = f * f * (3.0 - 2.0 * f);
  return mix(lmHash(vec3(i, line, seed)), lmHash(vec3(i + 1.0, line, seed)), f) * 2.0 - 1.0;
}
/** Chuvisco gaussiano ao longo da linha (a forma do ruído que passou pela banda do vídeo): média 0, desvio ~1. */
float snow(float x, float line, float seed) {
  float i = floor(x);
  float f = x - i;
  f = f * f * (3.0 - 2.0 * f);
  float a = lmGaussianNoise(vec3(i, line, seed));
  float b = lmGaussianNoise(vec3(i + 1.0, line, seed));
  return mix(a, b, f) / sqrt(f * f + (1.0 - f) * (1.0 - f));
}
/** Luma lida ao longo da linha com uma gaussiana de desvio "sigma" (px de 1080p). */
float lumaBlur(vec2 uv, float sigma) {
  if (sigma < 0.05) return lmLuma(getColor(uv).rgb);
  float sum = 0.0, tot = 0.0;
  for (int i = -4; i <= 4; i++) {
    float k = float(i) * 0.6;
    float w = exp(-0.5 * k * k);
    sum += lmLuma(getColor(uv + vec2(lmPxUv(k * sigma).x, 0.0)).rgb) * w;
    tot += w;
  }
  return sum / tot;
}
/** Croma (I/Q) da fita: gaussiana larga atrasada para a direita, alternando com a linha de cima (filtro de 1H). */
vec2 tapeChroma(vec2 uv, float sigma, float delay) {
  vec2 sum = vec2(0.0);
  float tot = 0.0;
  for (int i = 0; i < 14; i++) {
    float k = (float(i) - 6.5) / 6.5 * 2.2;
    float w = exp(-0.5 * k * k);
    vec2 q = vec2(uv.x - delay + k * sigma, uv.y + (i % 2 == 0 ? 0.0 : 1.0 / LINES));
    sum += toYiq(getColor(q).rgb).yz * w * step(0.0, q.x) * step(q.x, 1.0);
    tot += w;
  }
  return sum / tot;
}
/** Linhas de varredura de 240 por campo, que somem (sem moiré) quando a tela é pequena demais para mostrá-las. */
float scanlines(vec2 uv, float amount, float lum) {
  float pitch = resolution.y / 240.0;
  float s = 0.5 - 0.5 * cos((1.0 - uv.y) * 240.0 * 2.0 * PI);
  float depth = amount * mix(1.0, 0.45, clamp(lum, 0.0, 1.0)) * smoothstep(1.6, 3.2, pitch);
  return (1.0 - depth * s) * (1.0 + depth * 0.5);
}

vec4 applyFilter(vec4 c, vec2 uv) {
  float frame = floor(time * 29.97);
  float line = floor((1.0 - uv.y) * LINES);
  // Resolução baixa: imagem mole (desfoque gaussiano de 1 a 3,5 px de 1080p).
  // Gaussiana em 3×3 toques bilineares (cada um já é a média de 4 pixels), em luz linear.
  vec2 o = lmPxUv(mix(0.8, 3.0, lowres));
  vec3 lin = lmToLinear(getColor(uv).rgb) * 0.25;
  lin += (lmToLinear(getColor(uv + vec2(o.x, 0.0)).rgb) + lmToLinear(getColor(uv - vec2(o.x, 0.0)).rgb)
    + lmToLinear(getColor(uv + vec2(0.0, o.y)).rgb) + lmToLinear(getColor(uv - vec2(0.0, o.y)).rgb)) * 0.125;
  lin += (lmToLinear(getColor(uv + o).rgb) + lmToLinear(getColor(uv - o).rgb)
    + lmToLinear(getColor(uv + vec2(o.x, -o.y)).rgb) + lmToLinear(getColor(uv - vec2(o.x, -o.y)).rgb)) * 0.0625;
  // Smear do CCD: as luzes fortes vazam pela coluna inteira.
  float smear = 0.0;
  for (int i = 0; i < 8; i++) {
    float y = (float(i) + 0.5) / 8.0;
    vec3 l = lmToLinear(getColorLod(vec2(uv.x, y), 4.0).rgb);
    smear += max(lmLuma(l) - 0.7, 0.0);
  }
  lin += vec3(smear / 8.0) * 1.5;
  lin += lmBloom(uv, 0.7, 0.1) * 0.4;
  vec3 col = lmToSrgb(lin);
  // Quase sem cor, frio, pretos esmagados.
  float Y = lmLuma(col);
  col = mix(vec3(Y), col, 0.15) * vec3(0.92, 1.0, 1.07);
  col = smoothstep(0.07, 0.93, col);
  // Chiado: mais forte no escuro (o ganho automático puxando).
  float n = snow(uv.x * 330.0, line, frame) * 0.75 + snow(uv.x * 110.0, line, frame + 0.5) * 0.35;
  col += n * noiseAmt * 0.085 * mix(1.5, 0.5, Y);
  // Barra de zumbido e linhas de varredura.
  float hum = 0.5 + 0.5 * cos((uv.y + time * 0.05) * 2.0 * PI);
  col *= 1.0 - 0.06 * hum * hum * hum;
  col *= scanlines(uv, 0.12, Y);
  col *= lmVignette(uv, 0.55, 0.4);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
