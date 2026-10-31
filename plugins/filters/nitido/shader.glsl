/** Luminância em valores de tela de uma amostra. */
float lumaAt(vec2 p) { return lmToSrgb(vec3(lmLuma(lmToLinear(getColor(p).rgb)))).x; }

/**
 * Nitidez (máscara de nitidez na luminância): compara o pixel com um desfoque gaussiano de raio fixo em px de 1080p
 * (5×5 toques, determinístico, sem ruído) e soma a diferença igual nos três canais, então os contornos ganham
 * definição sem franjas de cor. A diferença passa por um limitador suave: sem halos brancos e pretos em volta das
 * bordas fortes, e o ruído fino quase não é realçado.
 */
vec4 applyFilter(vec4 c, vec2 uv) {
  vec2 px = lmPxUv(1.0);
  float center = lumaAt(uv);
  float blur = 0.0, total = 0.0;
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      vec2 o = vec2(float(i), float(j));
      float w = exp(-dot(o, o) / (2.0 * 1.1 * 1.1));
      blur += lumaAt(uv + o * px) * w;
      total += w;
    }
  }
  blur /= total;
  float detail = center - blur;
  // Limita o realce: bordas fortes não ganham halo; detalhe pequeno demais (ruído) entra mais fraco.
  float limited = 0.08 * tanh(detail / 0.08);
  float noiseGate = smoothstep(0.002, 0.012, abs(detail));
  vec3 col = c.rgb + limited * 2.4 * noiseGate;
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
