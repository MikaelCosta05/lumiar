vec4 effect(vec2 uv) {
  // y da posição de cima para baixo (como o resto do editor); a textura tem y para cima.
  vec2 c = vec2(center.x, 1.0 - center.y);
  vec2 q = (uv - c) / max(size * 0.5, vec2(0.001));
  float d = oval > 0.5 ? length(q) : max(abs(q.x), abs(q.y));
  float inside = 1.0 - smoothstep(1.0 - feather, 1.0 + feather * 0.2, d);
  vec4 original = getColor(uv);
  if (inside <= 0.0) return original;
  vec4 hidden;
  if (pixelate > 0.5) {
    vec2 cells = resolution / mix(6.0, 48.0, strength);
    hidden = getColor((floor(uv * cells) + 0.5) / cells);
  } else {
    // Desfoque em anéis, forte o bastante para não dar para ler.
    vec3 sum = vec3(0.0);
    float n = 0.0;
    float radius = mix(0.01, 0.06, strength);
    for (int ring = 1; ring <= 4; ring++) {
      for (int i = 0; i < 12; i++) {
        float a = float(i) * 0.5236 + float(ring) * 0.7;
        vec2 o = vec2(cos(a), sin(a) * ratio) * radius * float(ring) / 4.0;
        sum += getColor(uv + o).rgb;
        n += 1.0;
      }
    }
    hidden = vec4(sum / n, 1.0);
  }
  return mix(original, hidden, inside);
}
