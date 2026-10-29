vec4 effect(vec2 uv) {
  vec4 base = getColor(uv);
  // Linhas medidas como num vídeo de 720 linhas: o pente tem o mesmo tamanho em qualquer resolução.
  float line = max(1.0, espessura * resolution.y / 720.0);
  float odd = mod(floor(uv.y * resolution.y / line), 2.0);
  if (odd < 0.5) return base;
  // O outro campo foi filmado um instante antes (e chega um pouco deslocado).
  float wobble = sin(time * 3.0 + uv.y * 4.0) * 0.5 + 0.5;
  vec3 field = getPast(uv + vec2(desvio * (0.5 + wobble), 0.0), 0.02).rgb;
  vec3 col = mix(base.rgb, field, forca) * (1.0 - escurecer);
  return vec4(col, base.a);
}
