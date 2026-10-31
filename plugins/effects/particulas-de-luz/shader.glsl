// Partículas de luz (bokeh): luzes de lente desfocadas em 4 planos de profundidade. As de perto são grandes, macias
// e sobem mais rápido (paralaxe); as de longe são pequenas, mais nítidas e lentas. Cada uma tem o miolo claro e quase
// branco caindo para a borda, deriva de lado com ruído suave e respira devagar. Somadas como luz (linear).

/**
 * Soma luz (linear) e só comprime o que passa do joelho: F(base + luz) − F(base) + base, com F = identidade até
 * 0,55 e um ombro exponencial depois. Sem luz, a imagem fica igual; com muita luz, a textura de baixo continua
 * aparecendo (a inclinação nunca cai a zero), em vez de tudo encostar no mesmo branco e a pele "sumir".
 */
vec3 shoulder(vec3 x) {
  const float k = 0.55;
  return mix(x, k + (1.0 - k) * (1.0 - exp(-(x - k) / (1.0 - k))), step(k, x));
}
vec3 addLightSoft(vec3 base, vec3 light) {
  base = max(base, 0.0);
  return base + shoulder(base + max(light, 0.0)) - shoulder(base);
}

/** Cor de luz em Oklab (claridade alta, matiz "angle", croma "chroma"), em luz linear. */
vec3 oklabTint(float angle, float chroma) {
  return max(lmFromOklab(vec3(0.85, chroma * cos(angle), chroma * sin(angle))), 0.0);
}

vec4 effect(vec2 uv) {
  vec4 base = getColor(uv);
  vec2 p = lmCentered(uv);
  vec3 acc = vec3(0.0);
  // "Cor" continua sendo a volta do círculo de cores (o mesmo valor dá a mesma família de cor), mas a partícula é
  // montada em Oklab: claridade alta, croma moderado e a mesma luz para qualquer matiz. Em HSV linearizado o azul e o
  // roxo saíam saturados e com pouca luz, e sobre o cabelo escuro viravam discos chapados de cor forte.
  vec3 ref = lmToOklab(lmToLinear(lmHsvToRgb(vec3(hue, 1.0, 1.0))));
  float baseAngle = atan(ref.z, ref.y);
  // As quatro pontas da variação entre partículas (matiz ±0,2 rad, croma 0,10 a 0,14), montadas uma vez por pixel:
  // cada partícula só mistura entre elas (em vez de converter de Oklab 16 vezes).
  vec3 tintLo0 = oklabTint(baseAngle - 0.2, 0.1), tintLo1 = oklabTint(baseAngle - 0.2, 0.14);
  vec3 tintHi0 = oklabTint(baseAngle + 0.2, 0.1), tintHi1 = oklabTint(baseAngle + 0.2, 0.14);
  for (int layer = 0; layer < 4; layer++) {
    float fl = float(layer);
    float z = fl / 3.0; // 0 = perto, 1 = longe
    float cell = mix(0.30, 0.10, z) * size;
    float rise = speed * mix(0.10, 0.035, z);
    vec2 q = (p - vec2(0.0, time * rise)) / cell + vec2(fl * 13.17, fl * 5.71);
    // As 4 células mais próximas (cada partícula cabe em 1 célula de raio em volta da sua).
    vec2 b = floor(q - 0.5);
    for (int j = 0; j < 2; j++) {
      for (int i = 0; i < 2; i++) {
        vec2 id = b + vec2(float(i), float(j));
        vec3 h = lmHash3(id + fl * 31.7);
        if (h.z > 0.36) continue;
        float h2 = lmHash(id * 1.37 + fl * 7.1);
        float r = mix(0.16, 0.36, h2);
        // Longe demais mesmo com a deriva máxima (±0,2 célula): pula antes de calcular o ruído.
        vec2 center = id + 0.18 + h.xy * 0.64;
        if (length(q - center) > r * 1.2 + 0.2) continue;
        // Posição na célula e deriva lateral suave (cada partícula com a sua).
        center += vec2(lmNoise(vec2(time * 0.25 * (0.5 + speed), h.x * 40.0)), lmNoise(vec2(h.y * 40.0, time * 0.2 * (0.5 + speed)))) * 0.14;
        float d = length(q - center) / r;
        // Borda: perto = bem desfocada (vira um brilho, não uma bola); mínimo de ~1 px para não serrilhar.
        float soft = max(mix(0.55, 0.06, z * z), 1.5 / (resolution.y * cell * r));
        float disc = 1.0 - smoothstep(1.0 - soft, 1.0 + soft * 0.3, d);
        if (disc <= 0.0) continue;
        // Perfil de luz: miolo forte e quase branco (como uma luz desfocada de verdade) caindo para uma borda macia,
        // bem mais fraca. Um disco de brilho uniforme sobre o escuro parece um adesivo de cor, não luz.
        float core = exp(-d * d * mix(2.2, 2.8, z));
        float body = disc * (0.07 + 0.93 * core);
        float twinkle = 0.65 + 0.35 * (0.5 + 0.5 * sin(time * mix(0.8, 2.0, h.y) + h2 * 6.2831853));
        vec3 tint = mix(mix(tintLo0, tintLo1, h.x), mix(tintHi0, tintHi1, h.x), h2);
        tint /= max(lmLuma(tint), 1e-4);
        tint = mix(tint, vec3(1.0), 0.35 * core * core);
        // Partícula grande espalha a luz por mais área: fica mais fraca.
        float energy = mix(0.45, 1.75, z) * mix(1.0, 0.65, h2);
        acc += tint * body * twinkle * energy;
      }
    }
  }
  vec3 col = addLightSoft(lmToLinear(base.rgb), acc * amount);
  return vec4(lmToSrgb(col), 1.0);
}
