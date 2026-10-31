// Eco temporal / estroboscópio. No eco, as exposições passadas são somadas em luz linear com pesos que caem suave
// até zero na mais antiga (o rastro some sem degrau); o "só as partes claras" soma como luz apenas o que era mais
// claro no passado do que agora (rastro de luz macio, sem os contornos duros do "clarear" por máximo). No
// estroboscópio, cópias nítidas da pessoa nos instantes passados, cada vez mais transparentes e apagadas.

vec3 addLightSoft(vec3 base, vec3 light) {
  vec3 room = max(1.0 - base, 1e-4);
  return base + room * (1.0 - exp(-max(light, 0.0) / room));
}

vec4 effect(vec2 uv) {
  vec4 base = getColor(uv);
  float n = floor(copias + 0.5);
  vec3 cur = lmToLinear(base.rgb);
  if (modo < 0.5) {
    vec3 sum = cur;
    float total = 1.0;
    vec3 light = vec3(0.0);
    for (int i = 1; i <= 8; i++) {
      float k = float(i);
      if (k > n) break;
      vec3 past = lmToLinear(getPast(uv, espaco * k).rgb);
      // Peso que cai como uma cauda (suave) até a última exposição.
      float f = 1.0 - k / (n + 1.0);
      float w = f * f * (3.0 - 2.0 * f);
      sum += past * w;
      total += w;
      // Rastro de luz: só as altas luzes do passado, e só o quanto passam do que há agora.
      float hi = smoothstep(0.12, 0.6, lmLuma(past));
      light += max(past * hi - cur, 0.0) * w;
    }
    vec3 echo = sum / total;
    vec3 trails = addLightSoft(cur, light * 0.85);
    return vec4(lmToSrgb(mix(echo, trails, brilho)), base.a);
  }
  // Estroboscópio: das cópias mais antigas (mais transparentes) para as mais novas; a pessoa de agora fica por cima.
  vec3 col = cur;
  float me = getPerson(uv);
  for (int i = 8; i >= 1; i--) {
    float k = float(i);
    if (k > n) continue;
    vec4 past = getPast(uv, espaco * k);
    float age = k / (n + 1.0);
    vec3 pc = lmToLinear(past.rgb);
    // As mais antigas perdem um pouco de cor e de contraste, como uma exposição mais fraca.
    pc = mix(pc, vec3(lmLuma(pc)), age * 0.35);
    float a = smoothstep(0.1, 0.9, past.a) * (1.0 - me) * (0.40 + 0.55 * (1.0 - age));
    col = mix(col, pc, a);
  }
  return vec4(lmToSrgb(col), base.a);
}
