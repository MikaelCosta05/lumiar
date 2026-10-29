vec4 applyFilter(vec4 c, vec2 uv) {
  vec2 p = uv - 0.5;
  float y = p.y + p.x * tilt * 0.5 * ratio;
  float t = smoothstep(height - 0.5 - soft * 0.5, height - 0.5 + soft * 0.5, y);
  // Acima do horizonte, a imagem passa por um vidro da cor escolhida (cinza = só escurece).
  vec3 col = c.rgb * mix(vec3(1.0), clamp(tint * 1.25, 0.0, 1.0), t);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
