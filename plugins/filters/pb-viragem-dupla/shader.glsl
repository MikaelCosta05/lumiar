float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec4 applyFilter(vec4 c, vec2 uv) {
  float l = luma(c.rgb);
  l = mix(l, smoothstep(0.0, 1.0, l), 0.2);
  vec3 tone = mix(shadowTone, lightTone, smoothstep(balance - 0.35, balance + 0.35, l));
  // Só a "cor" da viragem entra; o claro e o escuro continuam os do P&B.
  vec3 col = vec3(l) + (tone - luma(tone)) * (0.35 + 2.6 * l * (1.0 - l)) * 0.55;
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
