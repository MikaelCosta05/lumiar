float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 saturate(vec3 c, float s) {
  return mix(vec3(luma(c)), c, s);
}

vec4 applyFilter(vec4 c, vec2 uv) {
  // Canal escuro: onde nem o canal mais escuro chega perto do preto, há névoa na frente.
  vec2 r = vec2(5.0 * resolution.y / 720.0) / resolution;
  float dark = min(c.r, min(c.g, c.b));
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7854;
    vec3 s = getColor(uv + vec2(cos(a), sin(a)) * r).rgb;
    dark = min(dark, min(s.r, min(s.g, s.b)));
  }
  float air = max(min(hazeColor.r, min(hazeColor.g, hazeColor.b)), 0.2);
  float t = clamp(1.0 - 0.75 * dark / air, 0.5, 1.0);
  vec3 col = clamp((c.rgb - hazeColor) / t + hazeColor, 0.0, 1.0);
  // Sem a névoa, as sombras ficam fundas demais: abre um pouco.
  col = mix(col, 1.0 - pow(1.0 - col, vec3(1.4)), lift);
  col = saturate(col, 1.05);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
