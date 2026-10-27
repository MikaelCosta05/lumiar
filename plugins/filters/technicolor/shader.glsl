float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec4 applyFilter(vec4 c, vec2 uv) {
  float gb = (c.g + c.b) * 0.5;
  vec3 col = vec3(c.r, gb, gb);
  col = clamp(mix(vec3(luma(col)), col, 1.4), 0.0, 1.0);
  col = mix(col, col * col * (3.0 - 2.0 * col), 0.30);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
