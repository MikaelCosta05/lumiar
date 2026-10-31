// Brilho (glow) de lente: soma de vários níveis de detalhe (mipmaps), como os motores de cinema, com o tamanho
// medido em px de um vídeo 1080p (o mesmo brilho em 720p, 4K e na miniatura). A luz é somada em luz linear e só o
// que passaria do branco é comprimido: o que já estava na imagem não muda e o fundo claro não vira branco chapado.

/** Nível do mapa de níveis com filtro em tenda de 9 toques (sem quadriculado). */
vec3 tentLod(vec2 uv, float level) {
  vec2 t = exp2(level) / resolution;
  vec3 c = getColorLod(uv, level).rgb * 4.0;
  c += (getColorLod(uv + vec2(t.x, 0.0), level).rgb + getColorLod(uv - vec2(t.x, 0.0), level).rgb
      + getColorLod(uv + vec2(0.0, t.y), level).rgb + getColorLod(uv - vec2(0.0, t.y), level).rgb) * 2.0;
  c += getColorLod(uv + t, level).rgb + getColorLod(uv - t, level).rgb
     + getColorLod(uv + vec2(t.x, -t.y), level).rgb + getColorLod(uv + vec2(-t.x, t.y), level).rgb;
  return lmToLinear(c / 16.0);
}

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

vec4 effect(vec2 uv) {
  vec4 base = getColor(uv);
  vec3 lin = lmToLinear(base.rgb);
  // "A partir de" é medido na tela (sRGB); o corte com joelho suave é feito em luz linear.
  float thr = lmToLinear(vec3(threshold)).x;
  float knee = max(thr * 0.6, 0.02);
  // Nível 1080p → nível desta resolução.
  float shift = log2(resolution.y / 1080.0);
  // Até que nível somar: cada nível dobra o alcance (nível n ≈ 2^n px). Pesos iguais = queda longa e macia.
  float top = log2(max(radius, 1.0));
  vec3 glow = vec3(0.0);
  float total = 0.0;
  for (int i = 1; i <= 8; i++) {
    float k = float(i);
    float w = clamp(top + 2.0 - k, 0.0, 1.0);
    if (w <= 0.0) break;
    vec3 c = tentLod(uv, max(k + shift, 0.0));
    float l = lmLuma(c);
    float soft = clamp(l - thr + knee, 0.0, 2.0 * knee);
    float part = max(soft * soft / (4.0 * knee), l - thr) / max(l, 1e-4);
    glow += c * part * w;
    total += w;
  }
  glow /= max(total, 1e-4);
  // O que já é luz forte recebe menos brilho por cima dele mesmo: o halo aparece em volta (no escuro), sem lavar
  // as áreas claras grandes.
  float self = lmLuma(lin);
  float selfPart = clamp((self - thr) / max(1.0 - thr, 1e-3), 0.0, 1.0);
  glow *= mix(1.0, 0.5, selfPart);
  vec3 col = addLightSoft(lin, glow * intensity * 1.6);
  return vec4(lmToSrgb(col), base.a);
}
