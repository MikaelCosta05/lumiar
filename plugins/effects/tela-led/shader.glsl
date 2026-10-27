vec4 effect(vec2 uv) {
  float k = resolution.y / 720.0;
  vec2 p = uv * resolution / (size * k);
  vec3 c = getColor((floor(p) + 0.5) * size * k / resolution).rgb;
  float led = 1.0 - smoothstep(0.3, 0.45, length(fract(p) - 0.5));
  return vec4(c * (led * 1.35 + 0.04), 1.0);
}
