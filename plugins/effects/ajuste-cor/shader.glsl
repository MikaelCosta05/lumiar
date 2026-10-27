vec4 effect(vec2 uv) {
  vec4 c = getColor(uv);
  vec3 col = c.rgb + brightness;
  col = (col - 0.5) * contrast + 0.5;
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(luma), col, saturation);
  col += vec3(temperature, temperature * 0.2, -temperature) * 0.1;
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
