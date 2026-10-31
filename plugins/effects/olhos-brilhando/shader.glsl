/**
 * Olhos brilhando: os olhos acendem como os de um bicho no escuro, ou ficam totalmente pretos.
 * - No modo aceso a íris vira fonte de luz: a cor emite por cima (mais quente e quase branca no miolo), o desenho
 *   do olho continua por baixo, e o halo que vaza pela pele soma como luz em luz linear, com as altas luzes
 *   comprimidas (o brilho não estoura em branco chapado).
 * - Distância "de olho": elipse mais larga que alta, em unidades do tamanho, com a proporção da tela corrigida.
 * Os pontos vêm na posição da tela (y para baixo); o uv do GL tem y para cima.
 */
float eyeDistance(vec2 uv, vec2 point) {
  vec2 q = (uv - vec2(point.x, 1.0 - point.y)) * vec2(ratio, 1.0) / tamanho;
  q.y *= 1.8;
  return length(q);
}

vec4 effect(vec2 uv) {
  vec4 c = getColor(uv);
  float d = min(eyeDistance(uv, olhoEsquerdo), eyeDistance(uv, olhoDireito));
  if (d > 14.0) return c;
  // Batimento lento e irregular (dois senos fora de fase), nunca apaga de vez.
  float beat = 1.0 - pulsar * 0.5 * (0.5 + 0.5 * sin(time * 2.3) * sin(time * 0.9 + 1.0));
  float core = 1.0 - smoothstep(0.55, 1.0, d);
  vec3 col = c.rgb;
  if (modo < 0.5) {
    vec3 lin = lmToLinear(c.rgb);
    vec3 glowLin = lmToLinear(cor);
    float hot = 1.0 - smoothstep(0.0, 0.6, d);
    float l = lmLuma(c.rgb);
    // A luz sai de dentro do olho: a emissão segue um pouco o desenho da íris.
    vec3 emit = mix(glowLin * 1.8, vec3(1.6), hot * 0.45) * (0.5 + 0.9 * l);
    lin = mix(lin, emit * beat, core * 0.85);
    float halo = exp(-d * d * 0.35) * 0.9 + exp(-d * 0.6) * 0.35;
    lin += glowLin * halo * brilho * beat * (1.0 - core * 0.5) * 1.1;
    col = lmSoftClip(lmToSrgb(lin), 0.8);
  } else {
    // Preto de ponta a ponta, uma sombra funda em volta e só um reflexo pequeno de luz.
    float rim = exp(-d * d * 0.25);
    col *= 1.0 - rim * 0.55 * brilho;
    col = mix(col, vec3(0.008), smoothstep(0.0, 1.0, core) * 0.97 * mix(1.0, beat, 0.3));
    vec2 spot = vec2(0.28, -0.25);
    float sl = min(eyeDistance(uv - spot * tamanho / vec2(ratio, 1.0), olhoEsquerdo), eyeDistance(uv - spot * tamanho / vec2(ratio, 1.0), olhoDireito));
    col += vec3(0.5) * (1.0 - smoothstep(0.05, 0.16, sl));
  }
  return vec4(col, c.a);
}
