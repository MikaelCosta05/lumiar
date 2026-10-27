float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

// Intensidade das bordas (filtro de Sobel)
float edges(vec2 uv, vec2 px) {
  float tl = luma(getColor(uv + px * vec2(-1.0, 1.0)).rgb);
  float t = luma(getColor(uv + px * vec2(0.0, 1.0)).rgb);
  float tr = luma(getColor(uv + px * vec2(1.0, 1.0)).rgb);
  float l = luma(getColor(uv + px * vec2(-1.0, 0.0)).rgb);
  float r = luma(getColor(uv + px * vec2(1.0, 0.0)).rgb);
  float bl = luma(getColor(uv + px * vec2(-1.0, -1.0)).rgb);
  float b = luma(getColor(uv + px * vec2(0.0, -1.0)).rgb);
  float br = luma(getColor(uv + px * vec2(1.0, -1.0)).rgb);
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
  float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  return length(vec2(gx, gy));
}

vec4 effect(vec2 uv) {
  float k = resolution.y / 720.0;
  float e = edges(uv, vec2(k) / resolution);
  float l = luma(getColor(uv).rgb);
  vec2 p = uv * resolution / k;
  float s1 = 1.0 - smoothstep(0.08, 0.22, abs(fract((p.x + p.y) / 6.0) - 0.5));
  float s2 = 1.0 - smoothstep(0.08, 0.22, abs(fract((p.x - p.y) / 6.0) - 0.5));
  float shade = 1.0 - hatching * 0.55 * (s1 * (1.0 - smoothstep(0.35, 0.7, l)) + s2 * (1.0 - smoothstep(0.1, 0.4, l)));
  float ink = 1.0 - clamp(e * strength, 0.0, 1.0);
  vec3 paper = vec3(0.96, 0.95, 0.91);
  return vec4(paper * clamp(min(shade, ink), 0.0, 1.0), 1.0);
}
