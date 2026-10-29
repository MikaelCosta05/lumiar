float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 saturate(vec3 c, float s) {
  return mix(vec3(luma(c)), c, s);
}

vec4 applyFilter(vec4 c, vec2 uv) {
  vec3 col = c.rgb;
  float l = luma(col);
  // Luz acesa = bem mais clara que o que está em volta (o céu claro não conta).
  vec2 r = vec2(12.0 * resolution.y / 720.0) / resolution;
  float around = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7854;
    around += luma(getColor(uv + vec2(cos(a), sin(a)) * r).rgb);
  }
  around /= 8.0;
  float lamp = smoothstep(0.45, 0.85, l) * smoothstep(0.03, 0.2, l - around);
  vec3 cool = col * vec3(0.78, 0.9, 1.18);
  cool = saturate(cool, 1.15);
  col = mix(col, cool, sky * (1.0 - lamp));
  col = pow(clamp(col, 0.0, 1.0), vec3(1.0 + 0.25 * sky));
  col = mix(col, vec3(1.0, 0.62, 0.3) * l * 1.35, lamp * lights * 0.7);
  col += vec3(0.0, 0.01, 0.04) * (1.0 - smoothstep(0.0, 0.3, luma(col))) * sky;
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
