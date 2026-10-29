vec4 effect(vec2 uv) {
  // 0 = imagem normal, 1 = TV apagada.
  float len = max(duracaoTv, 0.05);
  float p = modo < 0.5
    ? clamp((time - (duration - len)) / len, 0.0, 1.0)
    : 1.0 - clamp(time / len, 0.0, 1.0);
  if (p <= 0.0) return getColor(uv);

  float a = smoothstep(0.0, 0.55, p);  // espreme na vertical até virar linha
  float b = smoothstep(0.5, 0.92, p);  // a linha encolhe até virar ponto
  float sy = mix(1.0, 0.004, a);
  float sx = mix(1.0, 0.003, b);
  vec2 d = uv - 0.5;
  vec2 px = 1.5 / resolution;

  float inside = (1.0 - smoothstep(sy * 0.5, sy * 0.5 + px.y, abs(d.y))) * (1.0 - smoothstep(sx * 0.5, sx * 0.5 + px.x, abs(d.x)));
  vec3 col = getColor(clamp(d / vec2(sx, sy) + 0.5, 0.0, 1.0)).rgb;
  col = mix(col, vec3(1.0), a * brilhoLinha) * (1.0 + a * 0.6);

  float glow = exp(-max(abs(d.y) - sy * 0.5, 0.0) * 110.0) * exp(-max(abs(d.x) - sx * 0.5, 0.0) * 35.0);
  vec3 halo = vec3(0.82, 0.9, 1.0) * glow * a * brilhoLinha * 0.7;
  float fade = 1.0 - smoothstep(0.9, 1.0, p);
  return vec4(clamp((col * inside + halo) * fade, 0.0, 1.0), 1.0);
}
