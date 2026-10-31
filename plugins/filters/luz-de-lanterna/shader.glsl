// Luz de lanterna: só o facho ilumina. A luz é somada em luz linear: um miolo quente (lâmpada incandescente de
// pilha, ~2800 K), os anéis do refletor, a borda do facho macia e um pouco de luz espalhada em volta; o resto fica
// no escuro. O círculo é círculo em qualquer proporção. A mão balança devagar e treme (ruído suave, não saltos) e a
// pilha fraca falha por instantes, apagando e voltando suave.

vec4 applyFilter(vec4 c, vec2 uv) {
  // A mão: balanço lento e tremor fino, os dois suaves.
  vec2 jit = vec2(lmNoise(vec2(time * 1.1, 1.7)), lmNoise(vec2(5.1, time * 1.3))) * 0.045 * shake;
  jit += vec2(lmNoise(vec2(time * 7.0, 3.3)), lmNoise(vec2(8.2, time * 8.0))) * 0.006 * shake;
  vec2 pos = vec2(lampPos.x, lampPos.y);
  vec2 p = lmCentered(uv) - lmCentered(pos) - jit * vec2(ratio, 1.0);
  float d = length(p) / lampSize;
  // Perfil do facho.
  float beam = 1.0 - smoothstep(0.6, 1.0, d);
  float hot = exp(-d * d * 4.0) * 0.9;
  float r1 = (d - 0.55) / 0.06, r2 = (d - 0.82) / 0.05;
  float rings = 0.12 * exp(-r1 * r1) + 0.08 * exp(-r2 * r2);
  float spill = exp(-max(d - 1.0, 0.0) * 1.8) * 0.06 * step(1.0, d) + 0.06 * (1.0 - step(1.0, d));
  float light = beam * (0.7 + hot) + rings * beam + spill;
  // Pilha fraca: quedas curtas e suaves.
  float slot = floor(time * 6.0);
  float dip = step(0.9, lmHash(vec2(slot, 4.0))) * lmBell(fract(time * 6.0)) * 0.55 * shake;
  light *= 1.0 - dip;
  vec3 lin = lmToLinear(c.rgb);
  vec3 warm = vec3(1.0, 0.82, 0.6);
  vec3 lit = lin * warm * light * 2.2;
  // Luz ambiente que sobra (bem fraca, fria).
  vec3 ambient = lin * vec3(0.55, 0.65, 0.9) * 0.6 * (1.0 - darkness);
  vec3 col = lmToSrgb(lmTonemap(lit + ambient));
  col = lmFilmGrain(col, uv, 0.25, 1.4, time);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
