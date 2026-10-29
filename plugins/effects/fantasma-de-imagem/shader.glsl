vec3 ghost(vec2 uv) {
  vec3 c = getColor(uv).rgb;
  // O fantasma chega mais fraco e quase sem cor.
  return mix(c, vec3(dot(c, vec3(0.299, 0.587, 0.114))), 0.6);
}

vec4 effect(vec2 uv) {
  vec4 base = getColor(uv);
  float drift = 1.0 + oscilacao * (0.35 * sin(time * 1.3) + 0.15 * sin(time * 7.1));
  float dx = distancia * drift;
  vec3 g1 = ghost(uv - vec2(dx, 0.0));
  vec3 g2 = ghost(uv - vec2(dx * 2.1, 0.0));
  vec3 col = base.rgb * (1.0 - 0.5 * forca) + g1 * 0.35 * forca + g2 * 0.15 * forca;

  // "Ringing": o sinal passa do ponto nas bordas e deixa um contorno claro logo depois delas.
  float px = 2.0 / resolution.x * resolution.y / 720.0;
  vec3 before = getColor(uv - vec2(px * 2.0, 0.0)).rgb;
  float edge = dot(base.rgb - before, vec3(0.333));
  col += vec3(abs(edge)) * contorno * 0.9;
  return vec4(clamp(col, 0.0, 1.0), base.a);
}
