float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 saturate(vec3 c, float s) {
  return mix(vec3(luma(c)), c, s);
}

vec4 applyFilter(vec4 c, vec2 uv) {
  vec2 r = vec2(6.0 * resolution.y / 720.0) / resolution;
  vec3 blur = (getColor(uv + vec2(r.x, 0.0)).rgb + getColor(uv - vec2(r.x, 0.0)).rgb
    + getColor(uv + vec2(0.0, r.y)).rgb + getColor(uv - vec2(0.0, r.y)).rgb
    + getColor(uv + r * 0.7).rgb + getColor(uv - r * 0.7).rgb
    + getColor(uv + vec2(r.x, -r.y) * 0.7).rgb + getColor(uv + vec2(-r.x, r.y) * 0.7).rgb) / 8.0;
  float e = 1.0 + bright * 2.2;
  // Abre meios-tons e sombras sem estourar o branco.
  vec3 col = 1.0 - pow(1.0 - clamp(c.rgb, 0.0, 1.0), vec3(e));
  col = col * (1.0 - 0.1 * bright) + 0.1 * bright;
  vec3 bl = 1.0 - pow(1.0 - clamp(blur, 0.0, 1.0), vec3(e));
  col = 1.0 - (1.0 - col) * (1.0 - bl * 0.35 * soft);
  col = mix(col, vec3(1.0), smoothstep(0.82, 1.0, luma(col)) * 0.5);
  col = saturate(col, 0.92) * vec3(0.99, 1.0, 1.015);
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
