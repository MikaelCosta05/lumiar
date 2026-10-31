// Queimar: o clipe atual pega fogo em manchas orgânicas (fbm com o domínio torcido). À frente do fogo o papel
// tosta e escurece; na borda, uma linha de brasa com o miolo quase branco e a cor da brasa por fora, somada como
// luz (com as altas luzes comprimidas); atrás dela fica uma faixa de cinza em flocos, com pontinhos ainda acesos,
// que se desfaz no próximo clipe. "Borda" = largura dessas faixas; "Escala do ruído" = tamanho das manchas.

/** Soma luz (linear) à cor sem estourar: comprime só o que a luz acrescenta (sem luz, a cor fica igual). */
vec3 addGlow(vec3 base, vec3 lightLinear) {
  vec3 total = lmToSrgb(lmToLinear(base) + lightLinear);
  return clamp(base + lmSoftClip(total, 0.72) - lmSoftClip(base, 0.72), 0.0, 1.0);
}

/** Torção do domínio (muda devagar: pode ser a mesma para pontos vizinhos). */
vec2 burnWarp(vec2 c) {
  vec2 p = c * scale * 0.5;
  return vec2(lmFbm(p * 0.6 + vec2(3.1, 7.7), 3), lmFbm(p * 0.6 + vec2(8.3, 1.9), 3));
}

/** Campo do fogo (0 a 1) num ponto da tela: fbm com o domínio torcido (manchas de papel, não nuvem redonda). */
float burnField(vec2 c, vec2 warp, int octaves) {
  return clamp(0.5 + 0.68 * lmFbm(c * scale * 0.5 + warp * 0.7, octaves), 0.0, 1.0);
}

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  vec2 c = lmCentered(uv);
  vec2 warp = burnWarp(c);
  float n = burnField(c, warp, 5);
  // Inclinação do campo por diferenças largas (3 px), com a mesma torção: a distância até a frente sai lisa,
  // sem as listras que a derivada de pixel (fwidth) deixa.
  float h = 3.0 / resolution.y;
  float n4 = burnField(c, warp, 4);
  float gx = burnField(c + vec2(h, 0.0), warp, 4) - n4;
  float gy = burnField(c + vec2(0.0, h), warp, 4) - n4;
  float slope = max(length(vec2(gx, gy)) / 3.0, 1e-5);  // por pixel

  float charW = edge * 1.6;   // papel tostando à frente do fogo
  float ashW = edge * 0.9;    // cinza atrás da brasa
  float front = mix(-charW, 1.0 + ashW, lmEaseInOutSine(progress));
  float dn = n - front;  // > 0: ainda não queimou; < 0: já queimou

  // Distância até a frente em pixels de 1080p (pela derivada do ruído): a brasa tem espessura constante na
  // tela, como a borda de um papel queimando, em vez de engrossar onde o ruído é plano.
  float k = edge / 0.08;
  float dpx = dn / slope * 1080.0 / resolution.y;
  // Limites no próprio ruído: garantem que nada disso aparece em progress 0 e 1.
  float ahead = 1.0 - smoothstep(charW * 0.5, charW, dn);
  float behind = 1.0 - smoothstep(ashW * 0.5, ashW, -dn);

  vec4 from = getFromColor(uv);
  vec4 to = getToColor(uv);
  vec3 col;
  if (dn >= 0.0) {
    // Tostado: puxa para o marrom numa faixa larga (medida no ruído, lisa) e escurece quase em preto colado
    // na brasa.
    float toast = pow(1.0 - smoothstep(0.0, charW, dn), 1.4);
    float burnt = pow(1.0 - smoothstep(0.0, charW * 0.3, dn), 1.5) * (1.0 - smoothstep(0.0, 60.0 * k, dpx));
    vec3 toasted = from.rgb * vec3(0.62, 0.42, 0.24);
    col = mix(from.rgb, toasted, toast * 0.8);
    col *= 1.0 - 0.85 * burnt;
  } else {
    // Cinza em flocos (ruído fino) logo atrás da brasa: onde ela se rompe, aparece o próximo clipe.
    float a = 1.0 - smoothstep(0.0, ashW * 0.7, -dn);
    float flakes = lmNoise(c * 90.0) * 0.5 + 0.5;
    float ash = smoothstep(0.0, 0.3, a - (1.0 - flakes) * 0.7);
    vec3 ashColor = mix(vec3(0.05, 0.045, 0.04), vec3(0.24, 0.23, 0.22), flakes * flakes);
    col = mix(to.rgb, ashColor, ash);
  }
  // Brasa: linha fina (miolo quase branco, cor da brasa por fora) e um halo curto.
  float x = dpx + 1.5 * k;
  // A brasa não é uniforme: pontos mais quentes e trechos quase apagados ao longo da borda.
  float flicker = smoothstep(-0.5, 0.6, lmNoise(c * 14.0 + 5.0));
  float heat = exp(-x * x / (2.0 * pow(mix(1.8, 4.5, flicker) * k, 2.0))) * ahead * behind * mix(0.35, 1.25, flicker);
  float halo = exp(-abs(dpx) / (16.0 * k)) * ahead * behind * mix(0.3, 1.0, flicker);
  vec3 emberLin = lmToLinear(tint);
  vec3 coreLin = vec3(1.0, 0.85, 0.6);
  vec3 light = emberLin * (heat * 2.2 + halo * 0.45) + coreLin * heat * heat * 1.0;
  // Pontinhos ainda acesos dentro da cinza.
  if (dn < 0.0) {
    float spark = smoothstep(0.74, 0.92, lmNoise(c * 160.0 + 11.0) * 0.5 + 0.5);
    light += emberLin * spark * 1.8 * (1.0 - smoothstep(0.0, 34.0 * k, -dpx)) * behind;
  }
  return vec4(addGlow(col, light), from.a);
}
