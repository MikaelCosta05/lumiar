/** A silhueta (ou, sem pessoa no clipe, uma forma oval no centro). */
float silhouette(vec2 p) {
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) return 0.0;
  if (uHasPerson.x > 0.5) return getFromPerson(p);
  vec2 c = vec2(centro.x, 1.0 - centro.y);
  return 1.0 - smoothstep(0.9, 1.0, length((p - c) * vec2(ratio, 1.0) / vec2(0.22, 0.35)));
}

vec4 transition(vec2 uv) {
  vec2 c = vec2(centro.x, 1.0 - centro.y);
  float show = dentroPrimeiro > 0.5 ? smoothstep(0.0, 0.3, progress) : 1.0;
  float grow = dentroPrimeiro > 0.5 ? smoothstep(0.3, 1.0, progress) : smoothstep(0.0, 1.0, progress);
  float scale = 1.0 + grow * grow * 14.0;
  // Ponto da silhueta original que, depois de crescer, cobre este pixel.
  vec2 p = c + (uv - c) / scale;
  float inside = silhouette(p);
  // Borda brilhante: onde a máscara está no meio do caminho entre dentro e fora.
  float edge = 0.0;
  vec2 px = 3.0 / resolution / scale;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7854;
    edge = max(edge, abs(silhouette(p + vec2(cos(a), sin(a)) * px) - inside));
  }
  float reveal = clamp(inside * show + smoothstep(0.85, 1.0, progress), 0.0, 1.0);
  vec4 col = mix(getFromColor(uv), getToColor(uv), reveal);
  col.rgb += borda * edge * brilho * (1.0 - smoothstep(0.7, 1.0, progress));
  return col;
}
