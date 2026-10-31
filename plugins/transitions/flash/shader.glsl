// Flash: um clarão de luz que sobe rápido (fica cada vez mais forte até o pico em 0,5, onde a troca acontece
// escondida) e se apaga devagar. Em luz linear: a imagem é superexposta e a cor do flash somada como luz, com as
// altas luzes comprimidas (a imagem "queima" para a cor do flash em vez de virar uma tinta chapada por cima).
// No pico, com intensidade 1, a tela é exatamente a cor do flash.

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  // Envelope: sobe de 0,36 a 0,5 acelerando, cai de 0,5 a 0,92 numa curva suave.
  float g = progress < 0.5
    ? pow(clamp((progress - 0.36) / 0.14, 0.0, 1.0), 2.2)
    : pow(1.0 - clamp((progress - 0.5) / 0.42, 0.0, 1.0), 3.2);
  float gb = g * clamp(brightness, 0.0, 1.0);
  vec4 a = getFromColor(uv);
  vec4 b = getToColor(uv);
  float m = smoothstep(0.49, 0.51, progress);
  vec3 lin = mix(lmToLinear(a.rgb), lmToLinear(b.rgb), m);
  vec3 tintLin = lmToLinear(tint);
  // Superexposição proporcional ao brilho da cor do flash (um "flash preto" só escurece).
  lin = lin * (1.0 + 5.0 * gb * lmLuma(tintLin)) * (1.0 - gb * (1.0 - lmLuma(tintLin)) * 0.6) + tintLin * gb * 1.2;
  vec3 col = lmToSrgb(lin);
  col = mix(col, lmSoftClip(col, 0.72), smoothstep(0.0, 0.2, gb));
  col = mix(col, tint, pow(gb, 4.0));
  return vec4(clamp(col, 0.0, 1.0), mix(a.a, b.a, m));
}
