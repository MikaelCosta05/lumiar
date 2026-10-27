vec4 effect(vec2 uv) {
  float s = max(size, 2.0);
  mat2 rot = mat2(0.7071, -0.7071, 0.7071, 0.7071);
  vec2 rp = rot * (uv * resolution);
  vec2 cellCenter = (floor(rp / s) + 0.5) * s;
  vec4 c = getColor((transpose(rot) * cellCenter) / resolution);
  float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  float radius = (1.0 - l) * s * 0.7;
  float ink = 1.0 - smoothstep(radius - 1.0, radius + 1.0, length(rp - cellCenter));
  vec3 paper = vec3(0.97, 0.95, 0.9);
  vec3 dotColor = mix(vec3(0.08), c.rgb * 0.6, colorful);
  return vec4(mix(paper, dotColor, ink), 1.0);
}
