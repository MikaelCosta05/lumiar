float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec4 applyFilter(vec4 c, vec2 uv) {
  float l = smoothstep(0.12, 0.85, luma(c.rgb));
  vec2 p = (uv - 0.5) * vec2(ratio, 1.0);
  l *= 1.0 - dot(p, p) * 0.9;
  return vec4(vec3(clamp(l, 0.0, 1.0)), c.a);
}
