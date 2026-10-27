float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec4 applyFilter(vec4 c, vec2 uv) {
  float l = smoothstep(0.3, 0.7, dot(c.rgb, vec3(0.2126, 0.7152, 0.0722)));
  l += (hash(floor(uv * resolution / 1.5)) - 0.5) * 0.15;
  vec3 col = vec3(clamp(l, 0.0, 1.0)) * vec3(0.98, 0.97, 0.94);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
