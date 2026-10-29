float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec4 effect(vec2 uv) {
  vec2 px = 1.0 / resolution;
  vec4 original = getColor(uv);
  vec3 c = original.rgb;

  // Tirar granulado: média dos vizinhos parecidos (filtro bilateral 5×5), que preserva as bordas.
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  float tolerance = 0.002 + 0.03 * granulado;
  for (int y = -2; y <= 2; y++) {
    for (int x = -2; x <= 2; x++) {
      vec3 s = getColor(uv + vec2(float(x), float(y)) * px).rgb;
      vec3 diff = s - c;
      float w = exp(-float(x * x + y * y) / 4.5) * exp(-dot(diff, diff) / tolerance);
      acc += s * w;
      wsum += w;
    }
  }
  vec3 col = mix(c, acc / wsum, granulado);

  // Nitidez: realça o detalhe (diferença para uma versão desfocada), sem realçar o granulado tirado.
  vec3 soft = (getColor(uv + vec2(1.5, 0.0) * px).rgb + getColor(uv - vec2(1.5, 0.0) * px).rgb
             + getColor(uv + vec2(0.0, 1.5) * px).rgb + getColor(uv - vec2(0.0, 1.5) * px).rgb) * 0.25;
  vec3 detail = col - mix(soft, acc / wsum, granulado * 0.5);
  col += detail * nitidez * 1.4;

  // Clarear o escuro: ganho maior nas sombras, que some nos tons claros (o céu não estoura).
  float l = luma(col);
  float gain = 1.0 + clarear * 1.6 * (1.0 - smoothstep(0.05, 0.65, l));
  col = col * gain + clarear * 0.025;

  // Cor mais viva.
  float g = luma(col);
  col = mix(vec3(g), col, 1.0 + cor * 0.7);
  return vec4(clamp(col, 0.0, 1.0), original.a);
}
