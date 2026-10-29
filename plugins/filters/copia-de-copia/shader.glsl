float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

/** Ruído sem seno (estável em qualquer placa). */
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

/** Grão animado (-0.5 a 0.5), do mesmo tamanho em qualquer resolução. */
float grainAt(vec2 uv, float size) {
  vec2 cell = floor(uv * resolution / max(size * resolution.y / 720.0, 1.0));
  return hash(cell + vec2(mod(floor(time * 24.0), 113.0) * 17.31, 3.7)) - 0.5;
}

vec4 applyFilter(vec4 c, vec2 uv) {
  float k = resolution.y / 720.0;
  vec2 px = vec2((1.0 + gen * 2.5) * k / resolution.x, 0.0);
  vec3 blur = (c.rgb + getColor(uv + px).rgb + getColor(uv - px).rgb + getColor(uv + px * 2.0).rgb + getColor(uv - px * 2.0).rgb) / 5.0;
  vec3 col = mix(c.rgb, blur, 0.5 + 0.5 * gen);
  // Eco da imagem um pouco à direita e o realce do aparelho criando aura nas bordas.
  vec3 echo = getColor(uv - vec2(9.0 * k / resolution.x, 0.0)).rgb;
  col += (echo - blur) * 0.22 * ghost;
  col += (c.rgb - blur) * 0.8 * ghost;
  // A cor descola da imagem e perde força a cada cópia.
  vec3 chroma = getColor(uv + vec2(4.0 * k / resolution.x, 0.0)).rgb;
  col = vec3(luma(col)) + (chroma - luma(chroma)) * (1.0 - gen * 0.55);
  col += vec3(0.02, -0.01, 0.03) * gen;
  col = mix(vec3(0.42), col, 1.0 - gen * 0.32);
  col += grainAt(uv, 1.4) * 0.05 * gen;
  col *= 0.96 + 0.04 * sin(uv.y * resolution.y * PI / (2.0 * k));
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
