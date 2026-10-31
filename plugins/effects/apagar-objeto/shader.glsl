// Apagar objeto (área oval ou retangular). Cada ponto de dentro é preenchido pela interpolação das cores logo depois
// da borda, vindas de 32 direções e lidas de um nível de detalhe já filtrado (a textura fina da borda não vira
// estrias em leque), com peso maior para a borda mais perto. A borda da área é suavizada sem serrilhado e o granulado
// que disfarça o preenchimento muda a 30 quadros por segundo, mais forte nos meios-tons, como o ruído de câmera.

vec4 effect(vec2 uv) {
  // y da posição de cima para baixo (como o resto do editor); a textura tem y para cima.
  vec2 c = vec2(center.x, 1.0 - center.y);
  vec2 half_ = max(size * 0.5, vec2(0.001));
  vec2 q = (uv - c) / half_;
  float d = oval > 0.5 ? length(q) : max(abs(q.x), abs(q.y));
  vec4 original = getColor(uv);
  float aa = fwidth(d);
  float inside = 1.0 - smoothstep(1.0 - feather - aa, 1.0 + aa, d);
  if (inside <= 0.0) return original;

  // Nível de detalhe: ~1/8 do tamanho da área (liso o bastante, sem trazer o objeto para fora).
  float sizePx = min(half_.x * ratio, half_.y) * resolution.y;
  float level = clamp(log2(max(sizePx * 0.12, 1.0)), 0.0, 5.0);
  vec3 sum = vec3(0.0);
  float total = 0.0;
  for (int i = 0; i < 32; i++) {
    float a = float(i) * 0.19634954 + 0.1;
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
    vec3 col = (lmToLinear(getColorLod(edge + out_ * 0.5, level).rgb) + lmToLinear(getColorLod(edge + out_ * 1.5, level).rgb)) * 0.5;
    float w = 1.0 / max(s * s, 0.0004);
    sum += col * w;
    total += w;
  }
  vec3 fill = lmToSrgb(sum / total);
  float frame = floor(time * 30.0);
  float l = lmLuma(fill);
  fill += lmGaussianNoise(vec3(floor(gl_FragCoord.xy), frame)) * grain * 0.018 * (0.4 + 2.4 * l * (1.0 - l));
  return vec4(mix(original.rgb, clamp(fill, 0.0, 1.0), inside), original.a);
}
