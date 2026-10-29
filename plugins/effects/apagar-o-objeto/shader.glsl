float noise(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

// Onde está o objeto, um pouco maior (a margem cobre a borda da máscara e a sombra dele).
float area(vec2 uv, float r) {
  float m = getPerson(uv);
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7854;
    m = max(m, getPerson(uv + vec2(cos(a), sin(a) * ratio) * r));
  }
  return m;
}

vec4 effect(vec2 uv) {
  vec4 original = getColor(uv);
  float margin = 0.004 + grow * 0.025;
  float inside = area(uv, margin);
  if (inside <= 0.0) return original;

  // Anda em 16 direções até sair do objeto e pega a cor logo depois da borda: as mais perto pesam mais.
  vec3 sum = vec3(0.0);
  float total = 0.0;
  for (int i = 0; i < 16; i++) {
    float a = float(i) * 0.3927;
    vec2 dir = vec2(cos(a), sin(a) * ratio);
    float s = 0.0;
    bool found = false;
    for (int k = 1; k <= 40; k++) {
      s = float(k) * 0.012;
      vec2 p = uv + dir * s;
      if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) break;
      if (getPerson(p) < 0.5) {
        found = true;
        break;
      }
    }
    if (!found) continue;
    vec2 edge = clamp(uv + dir * (s + margin * 1.5), vec2(0.0), vec2(1.0));
    vec3 col = (getColor(edge).rgb + getColor(clamp(edge + dir * 0.01, vec2(0.0), vec2(1.0))).rgb) * 0.5;
    float w = 1.0 / max(s * s, 0.0004);
    sum += col * w;
    total += w;
  }
  if (total <= 0.0) return original;
  vec3 fill = sum / total;
  fill += (noise(uv * resolution + fract(time) * 91.0) - 0.5) * grain * 0.07;
  return vec4(mix(original.rgb, fill, inside), original.a);
}
