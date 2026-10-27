float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec4 applyFilter(vec4 c, vec2 uv) {
  float l = smoothstep(0.05, 0.95, dot(c.rgb, vec3(0.2126, 0.7152, 0.0722)));
  l += (hash(floor(uv * resolution / 1.5) + fract(time * 7.0) * 61.0) - 0.5) * 0.18;
  float scratch = step(0.996, hash(vec2(floor(uv.x * resolution.x / 2.0), floor(time * 12.0))));
  vec3 col = vec3(l + scratch * 0.35);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
