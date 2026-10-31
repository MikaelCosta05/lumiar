// Debaixo d'água como a física da água: a luz perde o vermelho primeiro e depois o verde (absorção por canal em luz
// linear, mais forte embaixo, onde a água é mais funda), a água espalha um azul-esverdeado por cima (névoa de
// profundidade), a superfície ondulada entorta a imagem com um campo de rotação suave (sem esticar), as cáusticas
// são uma teia fina e viva (duas camadas de células animadas, entortadas por ruído) mais forte perto da superfície,
// e feixes de luz inclinados descem da superfície. Tudo somado como luz.

vec2 mirrorUv(vec2 u) { return 1.0 - abs(1.0 - mod(u, 2.0)); }

vec3 addLightSoft(vec3 base, vec3 light) {
  vec3 room = max(1.0 - base, 1e-4);
  return base + room * (1.0 - exp(-max(light, 0.0) / room));
}

/** Uma camada de cáusticas: brilho nas bordas entre células que se mexem devagar (teia de luz). */
float caustic(vec2 p, float t) {
  vec2 n = floor(p);
  vec2 f = p - n;
  float d1 = 8.0;
  float d2 = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 h = lmHash2(n + g);
      vec2 pt = 0.5 + 0.38 * sin(t * (0.5 + h * 0.7) + h * 6.2831853);
      vec2 r = g + pt - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  }
  float e = sqrt(d2) - sqrt(d1);
  return exp(-e * e / 0.006) + 0.35 * exp(-e * e / 0.04);
}

vec4 effect(vec2 uv) {
  float t = time;
  vec2 p = lmCentered(uv);
  // Superfície ondulada: deslocamento por campo de rotação (sem compressão), proporcional à força.
  vec2 wob = lmCurl(p * 2.2 + vec2(0.0, t * 0.15), t * 0.35) * 0.0016 * strength;
  vec3 lin = lmToLinear(getColor(mirrorUv(uv + wob * vec2(1.0 / ratio, 1.0))).rgb);
  // Turbidez: a água tira um pouco da nitidez.
  vec3 soft = lmToLinear(getColorLod(mirrorUv(uv + wob * vec2(1.0 / ratio, 1.0)), 1.5).rgb);
  lin = mix(lin, soft, clamp(0.25 * strength, 0.0, 0.5));

  // Profundidade aparente: mais funda embaixo do quadro.
  float depth = strength * (0.55 + 0.6 * (1.0 - uv.y));
  vec3 absorb = exp(-vec3(1.6, 0.45, 0.25) * depth);
  vec3 water = vec3(0.010, 0.075, 0.105);
  float scatter = 1.0 - exp(-0.9 * depth);
  lin = lin * absorb + water * scatter;

  // Cáusticas: duas camadas entortadas por ruído, multiplicadas (teia mais fina e irregular).
  vec2 q = p * 4.5 + vec2(lmNoise(vec3(p * 2.0, t * 0.2)), lmNoise(vec3(p * 2.0 + 9.1, t * 0.2))) * 0.35;
  float c1 = caustic(q + vec2(t * 0.12, t * 0.05), t * 0.9);
  float c2 = caustic(q * 1.37 + vec2(-t * 0.08, t * 0.1) + 3.7, t * 1.1);
  float ca = c1 * c2 * 1.6 + (c1 + c2) * 0.08;
  float nearSurface = smoothstep(-0.1, 1.0, uv.y);
  vec3 light = vec3(0.55, 0.9, 1.0) * ca * 0.10 * strength * nearSurface * (0.4 + 0.6 * lmLuma(absorb));

  // Feixes de luz inclinados que descem da superfície e mudam devagar.
  float x = p.x + p.y * 0.35;
  float shafts = pow(0.5 + 0.5 * lmNoise(vec2(x * 5.0, t * 0.25)), 3.0) * 0.7 + pow(0.5 + 0.5 * lmNoise(vec2(x * 11.0 + 4.0, t * 0.3)), 4.0) * 0.3;
  light += vec3(0.35, 0.75, 0.9) * shafts * 0.06 * strength * smoothstep(0.0, 1.0, uv.y);

  lin = addLightSoft(lin, light);
  return vec4(lmToSrgb(lin), 1.0);
}
