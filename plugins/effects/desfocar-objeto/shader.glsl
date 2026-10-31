// Desfocar (ou pixelar) exatamente o objeto escolhido. A máscara cresce por igual em volta (24 leituras em dois
// raios, com a proporção da tela certa, sem pontas de estrela), o desfoque é gaussiano em luz linear sobre o mapa de
// níveis (sem anéis nem cópias) e o pixelado usa a média de cada bloco, com tamanhos em px de 1080p.

// Onde está o objeto, um pouco maior (a margem cobre a borda da máscara, que é pequena). Metade da margem cresce
// cheia (máximo dos vizinhos); a outra metade é uma borda macia (média dos vizinhos mais longe), que esconde o
// contorno serrilhado da máscara.
float area(vec2 uv) {
  float r = max(grow * 0.035, 0.004);
  float m = getPerson(uv);
  float outer = 0.0;
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 0.5235988 + 0.26;
    vec2 dir = vec2(cos(a) / ratio, sin(a));
    m = max(m, getPerson(uv + dir * r * 0.5));
    outer += getPerson(uv + dir * r);
  }
  return max(m, smoothstep(0.0, 0.5, outer / 12.0));
}

vec3 heavyBlur(vec2 uv, float radius) {
  float rPx = radius * resolution.y;
  float level = clamp(log2(max(rPx / 6.0, 1.0)), 0.0, 7.0);
  float spin = lmIGN(gl_FragCoord.xy) * 6.28318530718;
  vec3 sum = vec3(0.0);
  float total = 0.0;
  for (int i = 0; i < 32; i++) {
    float r = sqrt((float(i) + 0.5) / 32.0);
    float a = float(i) * 2.39996323 + spin;
    float w = exp(-4.5 * r * r);
    vec2 o = vec2(cos(a), sin(a)) * r * radius * vec2(1.0 / ratio, 1.0);
    sum += lmToLinear(getColorLod(uv + o, level).rgb) * w;
    total += w;
  }
  return lmToSrgb(sum / total);
}

vec3 blocks(vec2 uv, float cellPx) {
  vec2 cell = lmPxUv(cellPx);
  vec2 c0 = (floor(uv / cell) + 0.5) * cell;
  float level = clamp(log2(max(cellPx * resolution.y / 1080.0 * 0.5, 1.0)), 0.0, 7.0);
  vec2 q = cell * 0.25;
  vec3 s = lmToLinear(getColorLod(c0 + vec2(-q.x, -q.y), level).rgb) + lmToLinear(getColorLod(c0 + vec2(q.x, -q.y), level).rgb)
         + lmToLinear(getColorLod(c0 + vec2(-q.x, q.y), level).rgb) + lmToLinear(getColorLod(c0 + vec2(q.x, q.y), level).rgb);
  return lmToSrgb(s * 0.25);
}

vec4 effect(vec2 uv) {
  vec4 original = getColor(uv);
  float inside = area(uv);
  if (inside <= 0.0) return original;
  vec3 hidden = pixelate > 0.5 ? blocks(uv, mix(6.0, 48.0, strength)) : heavyBlur(uv, mix(0.027, 0.16, strength));
  return vec4(mix(original.rgb, hidden, inside), original.a);
}
