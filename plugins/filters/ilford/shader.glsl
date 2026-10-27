float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec4 applyFilter(vec4 c, vec2 uv) {
  float l = dot(c.rgb, vec3(0.3, 0.6, 0.1));
  l = smoothstep(0.05, 0.95, l);
  l += (hash(floor(uv * resolution) + fract(time) * 50.0) - 0.5) * 0.08;
  vec3 col = vec3(l);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
