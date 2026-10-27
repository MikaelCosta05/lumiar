vec4 applyFilter(vec4 c, vec2 uv) {
  float k = resolution.y / 720.0;
  float s = max(2.0, 5.0 * k);
  mat2 r = mat2(0.7071, -0.7071, 0.7071, 0.7071);
  vec2 p = r * (uv * resolution);
  vec2 cell = (floor(p / s) + 0.5) * s;
  float l = dot(getColor((transpose(r) * cell) / resolution).rgb, vec3(0.2126, 0.7152, 0.0722));
  float rad = (1.0 - l) * s * 0.75;
  float ink = 1.0 - smoothstep(rad - 0.7, rad + 0.7, length(p - cell));
  vec3 col = mix(vec3(0.93, 0.9, 0.82), vec3(0.12), ink);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
