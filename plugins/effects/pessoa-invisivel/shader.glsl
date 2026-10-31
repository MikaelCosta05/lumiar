// Pessoa invisível: o corpo vira vidro grosso e deixa ver o fundo, torto como numa lente.
// - A lente: o gradiente largo do recorte curva o vidro nas bordas; os traços do corpo entortam o miolo (o formato
//   continua legível), e uma ondulação suave (ruído de gradiente que corre devagar) dá vida ao vidro.
// - Separação de cor leve, como luz passando por vidro grosso; a borda escurece um pouco (volume).
// - Borda cintilante: pontinhos de luz correndo pelo contorno, somados como luz em luz linear.
float luma(vec2 uv) { return lmLuma(getColor(uv).rgb); }

/** Gradiente do recorte medido a `r` px de 1080p: perto da borda aponta para fora do corpo. */
vec2 maskSlope(vec2 uv, float r) {
  vec2 px = lmPxUv(r);
  return vec2(getPerson(uv + vec2(px.x, 0.0)) - getPerson(uv - vec2(px.x, 0.0)),
              getPerson(uv + vec2(0.0, px.y)) - getPerson(uv - vec2(0.0, px.y)));
}

vec4 effect(vec2 uv) {
  vec4 c = getColor(uv);
  float me = getPerson(uv);
  vec2 near = maskSlope(uv, 3.75);
  float edge = clamp(length(near) * 1.2, 0.0, 1.0);
  if (me < 0.01 && edge < 0.01) return c;

  vec2 wide = maskSlope(uv, 33.0);
  vec2 px = lmPxUv(3.0);
  vec2 detail = vec2(luma(uv + vec2(px.x, 0.0)) - luma(uv - vec2(px.x, 0.0)),
                     luma(uv + vec2(0.0, px.y)) - luma(uv - vec2(0.0, px.y)));
  vec2 a = lmCentered(uv);
  vec2 ripple = vec2(lmNoise(a * 18.0 + vec2(time * 0.7, 0.0)), lmNoise(a * 18.0 + vec2(7.0, -time * 0.6))) * 0.5;
  vec2 bend = (-wide * 0.07 + detail * 0.06 + ripple * 0.012) * refracao;

  vec3 glass = vec3(getBackground(uv + bend * 1.1).r, getBackground(uv + bend).g, getBackground(uv + bend * 0.9).b);
  // Os traços da pessoa continuam aparecendo de leve, como reflexo no vidro (só os detalhes, sem a cor).
  vec2 o = lmPxUv(7.5);
  float soft = (luma(uv + vec2(o.x, 0.0)) + luma(uv - vec2(o.x, 0.0)) + luma(uv + vec2(0.0, o.y)) + luma(uv - vec2(0.0, o.y))) * 0.25;
  glass += (luma(uv) - soft) * 0.8 * refracao;
  glass *= 1.0 - 0.3 * clamp(length(wide) * 1.5, 0.0, 1.0) * refracao;
  vec3 col = mix(c.rgb, clamp(glass, 0.0, 1.0), me * invisivel);

  // Borda cintilante (luz).
  float spark = lmNoise(a * 90.0 + vec2(0.0, time * 6.0)) * 0.5 + 0.5;
  float shimmer = mix(1.0, 0.3 + 1.4 * smoothstep(0.45, 0.85, spark), cintilar);
  vec3 lin = lmToLinear(col) + lmToLinear(cor) * edge * borda * shimmer * 0.8;
  return vec4(lmSoftClip(lmToSrgb(lin), 0.85), c.a);
}
