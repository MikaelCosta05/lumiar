float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

vec4 effect(vec2 uv) {
  vec4 c = getColor(uv);
  // A partir da primeira piscada, uma a cada 1/frequência segundos, num instante sorteado do intervalo.
  float slot = floor((time - inicio) * frequencia);
  float start = inicio + (slot + acaso * hash(vec2(slot, 3.1)) * 0.7) / frequencia;
  float frames = floor(quadros + 0.5);
  float frame = floor((time - start) * 30.0);
  if (slot < 0.0 || time < start || frame >= frames) return c;

  float kind = floor(tipo + 0.5);
  if (kind < 0.5) kind = 1.0 + floor(hash(vec2(slot, 9.7)) * 4.0);
  vec3 col;
  if (kind < 1.5) {
    // Negativo duro, um pouco esverdeado como filme revelado errado.
    col = smoothstep(0.1, 0.9, 1.0 - c.rgb) * vec3(0.85, 1.0, 0.9);
  } else if (kind < 2.5) {
    // Contraste estourado: só preto e branco duros, com um toque de vermelho.
    float l = smoothstep(0.38, 0.48, luma(c.rgb));
    col = mix(vec3(0.02, 0.0, 0.0), vec3(1.0, 0.92, 0.9), l);
  } else if (kind < 3.5) {
    // De cabeça para baixo e escurecida.
    col = getColor(vec2(1.0 - uv.x, 1.0 - uv.y)).rgb * 0.8;
  } else {
    // O rosto de perto, com o contraste lá em cima.
    vec2 p = vec2(ponto.x, 1.0 - ponto.y);
    vec2 q = clamp(p + (uv - p) / aproximar, 0.0, 1.0);
    vec3 z = getColor(q).rgb;
    col = smoothstep(0.1, 0.8, vec3(luma(z))) * vec3(1.0, 0.95, 0.92);
  }
  // Chiado e uma linha torta: o quadro parece emendado na fita.
  float n = hash(floor(uv * resolution / 2.0) + frame * 17.0 + slot);
  col = mix(col, vec3(n), ruido * 0.35);
  float tear = step(0.985, hash(vec2(floor(uv.y * 120.0), slot + frame)));
  col = mix(col, vec3(1.0), tear * ruido);
  return vec4(col, c.a);
}
