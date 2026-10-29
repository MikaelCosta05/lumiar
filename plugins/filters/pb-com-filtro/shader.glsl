vec4 applyFilter(vec4 c, vec2 uv) {
  // O filtro deixa passar a sua cor e segura as outras (ao quadrado: filtro de vidro denso).
  vec3 fc = lensColor * lensColor;
  vec3 w = vec3(0.3, 0.59, 0.11);
  float l = dot(c.rgb * fc, w) / max(dot(fc, w), 0.02);
  l = clamp(0.5 + (l - 0.5) * contrast, 0.0, 1.0);
  return vec4(vec3(l), c.a);
}
