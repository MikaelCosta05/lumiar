float noise(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

vec4 effect(vec2 uv) {
  // y da posição de cima para baixo (como o resto do editor); a textura tem y para cima.
  vec2 c = vec2(center.x, 1.0 - center.y);
  vec2 half_ = max(size * 0.5, vec2(0.001));
  vec2 q = (uv - c) / half_;
  float d = oval > 0.5 ? length(q) : max(abs(q.x), abs(q.y));
  vec4 original = getColor(uv);
  float inside = 1.0 - smoothstep(1.0 - feather, 1.0, d);
  if (inside <= 0.0) return original;

  // Preenche com as cores logo depois da borda, vindas de 24 direções: as mais perto pesam mais.
  vec3 sum = vec3(0.0);
  float total = 0.0;
  for (int i = 0; i < 24; i++) {
    float a = float(i) * 0.2618;
    vec2 dir = vec2(cos(a), sin(a));
    float s;
    if (oval > 0.5) {
      float b = dot(q, dir);
      float k = dot(q, q) - 1.1025;
      s = -b + sqrt(max(b * b - k, 0.0));
    } else {
      // Distância até a parede do retângulo em cada eixo (a mais perto é a de saída).
      float tx = abs(dir.x) < 1e-4 ? 1e4 : ((dir.x > 0.0 ? 1.05 : -1.05) - q.x) / dir.x;
      float ty = abs(dir.y) < 1e-4 ? 1e4 : ((dir.y > 0.0 ? 1.05 : -1.05) - q.y) / dir.y;
      s = min(tx, ty);
    }
    vec2 edge = c + (q + dir * s) * half_;
    vec2 out_ = dir * half_ * 0.12;
    vec3 col = (getColor(edge).rgb + getColor(edge + out_).rgb + getColor(edge + out_ * 2.0).rgb) / 3.0;
    float w = 1.0 / max(s * s, 0.0004);
    sum += col * w;
    total += w;
  }
  vec3 fill = sum / total;
  fill += (noise(uv * resolution + fract(time) * 91.0) - 0.5) * grain * 0.07;
  return vec4(mix(original.rgb, fill, inside), original.a);
}
