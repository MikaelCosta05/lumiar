// Desfoque suave: as duas imagens desfocam como uma lente (gaussiano em luz linear), trocam no ponto mais
// desfocado e voltam ao foco. O raio sobe e desce em curva de seno ao quadrado (começa e termina parado). Cada
// amostra lê um nível pré-filtrado do tamanho do espaço entre amostras, então o desfoque largo fica liso, sem
// granulado nem cópias.

vec3 blurFrom(vec2 uv, float radius, float spin) {
  float spacing = radius * resolution.y * 0.36;
  float lod = clamp(log2(max(spacing, 1.0)) - 0.5, 0.0, 6.0);
  vec3 sum = vec3(0.0);
  float total = 0.0;
  for (int i = 0; i < 24; i++) {
    float r = sqrt((float(i) + 0.5) / 24.0);
    float a = float(i) * 2.39996323 + spin;
    float w = exp(-4.5 * r * r);
    sum += lmToLinear(getFromColorLod(uv + vec2(cos(a), sin(a)) * r * radius * vec2(1.0 / ratio, 1.0), lod).rgb) * w;
    total += w;
  }
  return sum / total;
}

vec3 blurTo(vec2 uv, float radius, float spin) {
  float spacing = radius * resolution.y * 0.36;
  float lod = clamp(log2(max(spacing, 1.0)) - 0.5, 0.0, 6.0);
  vec3 sum = vec3(0.0);
  float total = 0.0;
  for (int i = 0; i < 24; i++) {
    float r = sqrt((float(i) + 0.5) / 24.0);
    float a = float(i) * 2.39996323 + spin;
    float w = exp(-4.5 * r * r);
    sum += lmToLinear(getToColorLod(uv + vec2(cos(a), sin(a)) * r * radius * vec2(1.0 / ratio, 1.0), lod).rgb) * w;
    total += w;
  }
  return sum / total;
}

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  float bell = sin(progress * PI);
  float radius = bell * bell * 0.045 * strength;
  float spin = lmIGN(gl_FragCoord.xy) * 6.28318530718;
  float m = smoothstep(0.3, 0.7, progress);
  vec3 col = vec3(0.0);
  if (m < 1.0) col += blurFrom(uv, radius, spin) * (1.0 - m);
  if (m > 0.0) col += blurTo(uv, radius, spin) * m;
  return vec4(lmToSrgb(col), 1.0);
}
