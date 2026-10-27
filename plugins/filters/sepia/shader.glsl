vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 s = vec3(
    dot(c.rgb, vec3(0.393, 0.769, 0.189)),
    dot(c.rgb, vec3(0.349, 0.686, 0.168)),
    dot(c.rgb, vec3(0.272, 0.534, 0.131))
  );
  return vec4(min(s, 1.0), c.a);
}
