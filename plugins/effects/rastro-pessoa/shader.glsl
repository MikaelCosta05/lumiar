// Rastro da pessoa: cópias do passado só da pessoa, do mais antigo (mais apagado) para o mais novo.
// - O recorte de cada cópia é apertado um pouco (sem o halo do fundo antigo em volta do corpo).
// - Quanto mais "tingido", mais a cópia vira luz: a cor do rastro soma como luz em luz linear (screen), com as
//   altas luzes comprimidas, em vez de só pintar por cima. Sem tingir, as cópias são transparências comuns.
vec4 effect(vec2 uv) {
  vec4 base = getColor(uv);
  vec3 col = lmToLinear(base.rgb);
  float me = getPerson(uv);
  float n = floor(quantidade + 0.5);
  vec3 glowCol = lmToLinear(cor);
  for (int i = 10; i >= 1; i--) {
    float k = float(i);
    if (k > n) continue;
    vec4 past = getPast(uv, espaco * k);
    float a = smoothstep(0.25, 0.85, past.a) * (1.0 - me);
    if (a <= 0.0) continue;
    float fade = (1.0 - (k - 1.0) / n) * opacidade;
    float tint = tingir * (0.4 + 0.6 * k / n);
    vec3 p = lmToLinear(past.rgb);
    float l = lmLuma(p);
    // Cópia transparente (sem tinta) ou luz colorida (com tinta, mais forte nas mais antigas).
    vec3 ghost = mix(p, glowCol * (0.25 + l * 1.6), tint);
    col = mix(col, ghost, a * fade * (1.0 - tint * 0.6));
    col += glowCol * (0.2 + l) * a * fade * tint * 0.6;
  }
  return vec4(lmSoftClip(lmToSrgb(col), 0.85), base.a);
}
