// Flash de vinheta: as bordas escurecem como uma íris de lente que se fecha (círculo de verdade na tela, borda
// larga e suave, fechando cada vez mais rápido) até o preto total no meio; a íris reabre já no próximo clipe com um clarão
// que nasce do escuro e se apaga devagar. Tudo em luz linear, com as altas luzes do clarão comprimidas.

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  float d = length(lmCentered(uv));
  const float soft = 0.42;
  float radius;
  if (progress < 0.5) radius = mix(1.5, -soft - 0.02, pow(progress * 2.0, 1.6));  // fecha acelerando
  else radius = mix(-soft - 0.02, 1.5, lmEaseOutCubic(progress * 2.0 - 1.0));
  float v = 1.0 - smoothstep(radius - soft, radius + soft, d);
  v = v * v * (3.0 - 2.0 * v);
  vec3 img = lmToLinear((progress < 0.5 ? getFromColor(uv) : getToColor(uv)).rgb);
  // Clarão: nasce logo depois do preto (sem pular para o branco) e decai devagar.
  float y = clamp((progress - 0.5) / 0.36, 0.0, 1.0);
  float flash = progress > 0.5 ? smoothstep(0.5, 0.535, progress) * pow(1.0 - y, 2.4) : 0.0;
  vec3 lin = img * v * (1.0 + 3.0 * flash) + vec3(0.85) * flash * (0.35 + 0.65 * v);
  vec3 col = lmToSrgb(lin);
  col = mix(col, lmSoftClip(col, 0.75), smoothstep(0.0, 0.15, flash));
  return vec4(col, 1.0);
}
