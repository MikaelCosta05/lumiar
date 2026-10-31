// Sinal fraco: a antena longe da torre. O nível do sinal vai e volta devagar (desvanecimento); quando cai, a cor é
// a primeira a sumir (a TV corta a croma), o contraste lava com o preto acinzentado e o chuvisco cresce. O
// sincronismo horizontal fica inseguro: as linhas balançam em ondas suaves e, de vez em quando, um grupo de linhas
// rasga para o lado. O chuvisco tem a forma do ruído de vídeo: grãos deitados ao longo das 480 linhas, gaussianos,
// novos a cada campo (59,94 por segundo).

const float LINES = 480.0;

float snow(float x, float line, float seed) {
  float i = floor(x);
  float f = x - i;
  f = f * f * (3.0 - 2.0 * f);
  float a = lmGaussianNoise(vec3(i, line, seed));
  float b = lmGaussianNoise(vec3(i + 1.0, line, seed));
  return mix(a, b, f) / sqrt(f * f + (1.0 - f) * (1.0 - f));
}

vec4 effect(vec2 uv) {
  float field = floor(time * 59.94);
  float frame = floor(time * 29.97);
  float ypos = (1.0 - uv.y) * LINES;
  float line = floor(ypos);
  // O sinal vai e volta: em alguns instantes quase some.
  float level = clamp(forca * (0.75 + 0.55 * lmNoise(vec2(time * 1.1, 0.71)) + 0.2 * lmNoise(vec2(time * 4.3, 2.0))), 0.0, 1.0);

  // Linhas balançando (ondas suaves que descem) e rasgos de lado em grupos de linhas.
  float wob = lmNoise(vec2(ypos * 0.02 - time * 1.5, time * 0.7)) * 5.0 + lmNoise(vec2(ypos * 0.12, field * 0.4)) * 2.0;
  float group = floor(ypos / 12.0);
  float tearOn = step(0.975 - 0.05 * level, lmHash(vec3(group, frame, 1.0)));
  float tear = tearOn * (lmHash(vec3(group, frame, 2.0)) - 0.3) * 90.0 * smoothstep(0.0, 3.0, ypos - group * 12.0);
  float shift = (wob * oscilacao * 1.6 + tear) * level;
  float x = uv.x - lmPxUv(shift).x;
  vec3 col = getColor(vec2(x, uv.y)).rgb;
  col *= smoothstep(0.0, lmPxUv(2.0).x, x) * smoothstep(0.0, lmPxUv(2.0).x, 1.0 - x);

  float l = lmLuma(col);
  col = mix(col, vec3(l), smoothstep(0.2, 0.7, level));   // a cor é a primeira a sumir
  col = mix(col, vec3(0.4), 0.32 * level);                // contraste lavado, preto acinzentado

  // Chuvisco: mais forte quando o sinal cai, e mais visível no escuro.
  float n = snow(uv.x * 450.0, line, field) * 0.8 + snow(uv.x * 150.0, line, field + 0.5) * 0.3;
  float amt = neve * level * (0.55 + 0.45 * lmNoise(vec2(time * 3.7, 5.0)));
  vec3 grain = vec3(n) + vec3(snow(uv.x * 60.0, line, field + 0.25), 0.0, snow(uv.x * 55.0, line, field + 0.75)) * 0.15 * (1.0 - level);
  col = mix(col, vec3(0.45) + grain * 0.2, amt * 0.75);
  col += n * amt * 0.06 * (1.0 - l);
  return vec4(clamp(col, 0.0, 1.0), 1.0);
}
