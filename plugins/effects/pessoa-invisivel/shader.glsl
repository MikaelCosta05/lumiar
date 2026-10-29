float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

float luma(vec2 uv) {
  return dot(getColor(uv).rgb, vec3(0.299, 0.587, 0.114));
}

/** Gradiente do recorte medido a `r` pixels: perto da borda aponta para fora do corpo. */
vec2 maskSlope(vec2 uv, float r) {
  vec2 px = r * resolution.y / 720.0 / resolution;
  return vec2(getPerson(uv + vec2(px.x, 0.0)) - getPerson(uv - vec2(px.x, 0.0)),
              getPerson(uv + vec2(0.0, px.y)) - getPerson(uv - vec2(0.0, px.y)));
}

vec4 effect(vec2 uv) {
  vec4 c = getColor(uv);
  float me = getPerson(uv);
  vec2 near = maskSlope(uv, 2.5);
  float edge = clamp(length(near) * 1.2, 0.0, 1.0);
  if (me < 0.01 && edge < 0.01) return c;

  // Lente: o gradiente largo do recorte curva o vidro nas bordas; os traços do corpo (o brilho da
  // própria pessoa) entortam o miolo, então o formato continua legível mesmo transparente.
  vec2 wide = maskSlope(uv, 22.0);
  vec2 px = 2.0 / resolution;
  vec2 detail = vec2(luma(uv + vec2(px.x, 0.0)) - luma(uv - vec2(px.x, 0.0)),
                     luma(uv + vec2(0.0, px.y)) - luma(uv - vec2(0.0, px.y)));
  vec2 ripple = vec2(vnoise(uv * 18.0 + time * 0.7), vnoise(uv * 18.0 - time * 0.6 + 7.0)) - 0.5;
  vec2 bend = (-wide * 0.07 + detail * 0.06 + ripple * 0.012) * refracao;

  // Um pouco de separação de cor, como luz passando por vidro grosso.
  vec3 glass = vec3(getBackground(uv + bend * 1.1).r, getBackground(uv + bend).g, getBackground(uv + bend * 0.9).b);
  // Os traços da pessoa continuam aparecendo de leve, como reflexo no vidro (só os detalhes, sem a cor).
  vec2 o = 5.0 * resolution.y / 720.0 / resolution;
  float soft = (luma(uv + vec2(o.x, 0.0)) + luma(uv - vec2(o.x, 0.0)) + luma(uv + vec2(0.0, o.y)) + luma(uv - vec2(0.0, o.y))) * 0.25;
  glass += (luma(uv) - soft) * 0.8 * refracao;
  // Perto da borda o vidro escurece um pouco (a luz entra torta), o que desenha o volume do corpo.
  glass *= 1.0 - 0.3 * clamp(length(wide) * 1.5, 0.0, 1.0) * refracao;
  vec3 col = mix(c.rgb, glass, me * invisivel);

  // Borda cintilante: pontinhos que acendem e apagam correndo pelo contorno.
  float spark = vnoise(uv * vec2(ratio, 1.0) * 90.0 + vec2(0.0, time * 6.0));
  float shimmer = mix(1.0, 0.3 + 1.4 * smoothstep(0.45, 0.85, spark), cintilar);
  col += cor * edge * borda * shimmer * 0.8;
  return vec4(col, c.a);
}
