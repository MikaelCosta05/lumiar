// Estática de TV: o chuvisco de um canal analógico sem sinal. O ruído chega pelo mesmo caminho do vídeo:
// muda a cada campo (59,94 por segundo), é independente de uma das 480 linhas para a outra e, ao longo da
// linha, tem a banda do sinal (~4 MHz, ~450 pontos), por isso vira grãos curtos deitados, não pixels quadrados.
// Distribuição gaussiana (alguns pontos bem claros), linhas inteiras um pouco mais claras ou escuras (o controle
// automático de ganho) e o sincronismo horizontal tremendo quando o sinal cai.

const float LINES = 480.0;

/** Ruído gaussiano suave ao longo da linha, independente entre linhas: média 0, desvio ~1. */
float snow(float x, float line, float seed) {
  float i = floor(x);
  float f = x - i;
  f = f * f * (3.0 - 2.0 * f);
  float a = lmGaussianNoise(vec3(i, line, seed));
  float b = lmGaussianNoise(vec3(i + 1.0, line, seed));
  // A interpolação diminui o desvio no meio da célula: compensa para o grão ter o mesmo contraste.
  return mix(a, b, f) / sqrt(f * f + (1.0 - f) * (1.0 - f));
}

vec4 effect(vec2 uv) {
  float field = floor(time * 59.94);
  float ypos = (1.0 - uv.y) * LINES;
  float line = floor(ypos);
  float a = clamp(amount, 0.0, 1.0);

  // Sem sinal forte, o horizontal não segura: as linhas tremem de lado.
  float jitter = (lmHash(vec3(line, field, 1.0)) - 0.5) * 6.0 + lmNoise(vec2(line * 0.05, field * 0.5)) * 4.0;
  vec4 c = getColor(uv + vec2(lmPxUv(jitter * a * a).x, 0.0));

  // O chuvisco: grão fino + um pouco de grão maior, e o ganho de cada linha.
  float n = snow(uv.x * 450.0, line, field) * 0.8 + snow(uv.x * 140.0, line, field + 0.5) * 0.35;
  float agc = 1.0 + (lmHash(vec3(line, field, 2.0)) - 0.5) * 0.18 + lmNoise(vec2(ypos * 0.02, time * 2.0)) * 0.08;
  float s = clamp(0.46 + n * 0.2 * agc, 0.0, 1.0);
  // Com um pouco de sinal ainda sobra cor no chuvisco (manchas de croma); sem sinal, a TV corta a cor.
  vec3 tint = vec3(snow(uv.x * 60.0, line, field + 0.25), 0.0, snow(uv.x * 55.0, line, field + 0.75)) * 0.05 * (1.0 - a);
  vec3 noiseCol = vec3(s) + vec3(tint.x, -0.5 * (tint.x + tint.z), tint.z);

  // O sinal enfraquecendo: a imagem perde contraste e cor e o chuvisco toma conta.
  float l = lmLuma(c.rgb);
  vec3 weak = mix(c.rgb, vec3(l), a * 0.6) * (1.0 - a * 0.35) + 0.12 * a;
  vec3 col = mix(weak, noiseCol, a);
  // Mesmo com pouco chuvisco o grão aparece por cima (soma de sinal e ruído).
  col += n * 0.12 * a * (1.0 - a);
  return vec4(clamp(col, 0.0, 1.0), 1.0);
}
