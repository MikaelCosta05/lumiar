// Cor borrada de VHS: a fita grava a cor "por baixo" da luma, com ~0,5 MHz de banda (contra ~3 MHz da luma).
// Por isso a croma (I/Q, NTSC) borra muito na horizontal, chega atrasada e arrasta um rabo para a direita,
// é a média de duas linhas (o filtro de 1H do aparelho) e chia em manchas compridas que mudam a cada quadro
// (29,97 por segundo). A luma só amolece um pouco. Tudo medido em 480 linhas e em px de 1080p.

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

vec4 effect(vec2 uv) {
  vec4 base = getColor(uv);
  float frame = floor(time * 29.97);
  float line = floor((1.0 - uv.y) * LINES);
  vec2 px = lmPxUv(1.0);

  // Luma: um pouco mole (gaussiana horizontal).
  float sy = maciez * 4.5;
  float Y = lmLuma(base.rgb);
  if (sy > 0.05) {
    float sum = 0.0, tot = 0.0;
    for (int i = -3; i <= 3; i++) {
      float o = float(i) * sy * 0.8;
      float w = exp(-0.5 * float(i * i) * 0.64);
      sum += lmLuma(getColor(uv + vec2(o * px.x, 0.0)).rgb) * w;
      tot += w;
    }
    Y = sum / tot;
  }

  // Croma: gaussiana larga + rabo exponencial para a direita, atrasada, alternando com a linha de cima.
  float sigma = 0.0015 + vazamento * 0.011;  // em largura de quadro
  float tail = vazamento * 0.012;
  float delay = atraso * 0.014;
  float reach = 2.2 * sigma + 3.0 * tail;
  vec2 iq = vec2(0.0);
  float tot = 0.0;
  for (int i = 0; i < 20; i++) {
    // s = quanto à esquerda a amostra está (de -2,2σ a +reach).
    float s = mix(-2.2 * sigma, reach, (float(i) + 0.5) / 20.0);
    float g = min(s, 0.0) / sigma;
    float w = exp(-0.5 * g * g) * exp(-max(s, 0.0) / (sigma + tail));
    vec2 q = vec2(uv.x - delay - s, uv.y + (i % 2 == 0 ? 0.0 : 1.0 / LINES));
    // Fora do quadro não há cor (o apagamento do sinal), em vez de esticar a borda.
    float inside = step(0.0, q.x) * step(q.x, 1.0);
    iq += toYiq(getColor(q).rgb).yz * w * inside;
    tot += w;
  }
  iq /= tot;
  // A cor forte satura um pouco quando borra (o circuito de croma da fita puxa o ganho).
  iq *= 1.0 + 0.15 * vazamento;

  // Chiado de croma: riscos compridos por linha e manchas que derivam devagar.
  vec2 streaks = vec2(streak(uv.x * 40.0, line, frame), streak(uv.x * 34.0, line, frame + 0.5));
  vec2 blotch = vec2(lmNoise(vec3(uv.x * 9.0, line * 0.06, time * 1.3)), lmNoise(vec3(uv.x * 8.0 + 5.0, line * 0.05, time * 1.1)));
  float darkBoost = mix(1.3, 0.7, clamp(Y, 0.0, 1.0));
  iq += (streaks * 0.75 + blotch * 0.5) * ruidoCor * 0.075 * darkBoost;

  vec3 col = toRgb(vec3(Y, iq));
  return vec4(clamp(col, 0.0, 1.0), 1.0);
}
