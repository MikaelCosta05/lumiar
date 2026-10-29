// Onde está o objeto, um pouco maior (a margem cobre a borda da máscara, que é pequena).
float area(vec2 uv) {
  float r = grow * 0.02;
  float m = getPerson(uv);
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7854;
    m = max(m, getPerson(uv + vec2(cos(a), sin(a) * ratio) * r));
  }
  return m;
}

vec4 effect(vec2 uv) {
  vec4 original = getColor(uv);
  float inside = area(uv);
  if (inside <= 0.0) return original;
  vec4 hidden;
  if (pixelate > 0.5) {
    vec2 cells = resolution / mix(6.0, 48.0, strength);
    hidden = getColor((floor(uv * cells) + 0.5) / cells);
  } else {
    // Desfoque em anéis, forte o bastante para não dar para reconhecer.
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
  return vec4(mix(original.rgb, hidden.rgb, inside), original.a);
}
