vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 sep = vec3(dot(c.rgb, vec3(0.393, 0.769, 0.189)), dot(c.rgb, vec3(0.349, 0.686, 0.168)), dot(c.rgb, vec3(0.272, 0.534, 0.131)));
  vec3 col = mix(c.rgb, min(sep, 1.0), 0.45) * 0.9 + 0.07;
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
