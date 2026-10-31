// Filtro degradê: um filtro graduado de vidro na frente da lente. Acima do horizonte, a luz passa pelo vidro da cor
// escolhida (cinza = só escurece, como um ND graduado): multiplicação em luz linear, como o vidro faz. O horizonte
// gira de verdade (a suavidade fica igual em qualquer inclinação) e a transição é uma curva suave, sem quina.
vec4 applyFilter(vec4 c, vec2 uv) {
  vec2 p = lmCentered(uv) - vec2(0.0, height - 0.5);
  float a = atan(tilt * 0.5);
  float y = dot(p, vec2(sin(a), cos(a)));
  float t = clamp(y / soft + 0.5, 0.0, 1.0);
  t = t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
  // A mesma cor de vidro de antes (×1,25 em sRGB), agora como transmissão em luz linear.
  vec3 glass = lmToLinear(clamp(tint * 1.25, 0.0, 1.0));
  vec3 lin = lmToLinear(c.rgb) * mix(vec3(1.0), glass, t);
  return vec4(lmToSrgb(lin), c.a);
}
