vec4 effect(vec2 uv) {
  vec4 base = getColor(uv);
  float n = floor(copias + 0.5);
  if (modo < 0.5) {
    // Eco: a média dos quadros passados (rastro suave) ou só o que é claro (rastro de luz).
    vec3 sum = base.rgb;
    float total = 1.0;
    vec3 light = base.rgb;
    for (int i = 1; i <= 8; i++) {
      float k = float(i);
      if (k > n) break;
      vec3 past = getPast(uv, espaco * k).rgb;
      float w = 1.0 - k / (n + 1.0);
      sum += past * w;
      total += w;
      light = max(light, past * w);
    }
    return vec4(mix(sum / total, light, brilho), base.a);
  }
  // Estroboscópio: cópias nítidas da pessoa, das mais antigas (mais claras) para as mais novas.
  vec3 col = base.rgb;
  float me = getPerson(uv);
  for (int i = 8; i >= 1; i--) {
    float k = float(i);
    if (k > n) continue;
    vec4 past = getPast(uv, espaco * k);
    col = mix(col, past.rgb, past.a * (1.0 - me) * (0.45 + 0.5 * (1.0 - k / (n + 1.0))));
  }
  return vec4(col, base.a);
}
