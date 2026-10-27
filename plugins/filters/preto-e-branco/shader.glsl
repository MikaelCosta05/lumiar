float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec4 applyFilter(vec4 c, vec2 uv) {
  float l = clamp((luma(c.rgb) - 0.5) * contrast + 0.5, 0.0, 1.0);
  return vec4(vec3(l), c.a);
}
