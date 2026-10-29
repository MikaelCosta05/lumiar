float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

vec4 effect(vec2 uv) {
  vec2 p = (uv - centro) * vec2(ratio, 1.0);
  float r = length(p) / raio;
  float w = (1.0 - smoothstep(0.5, 1.0, r)) * forca;
  if (w <= 0.0) return getColor(uv);

  vec2 q = p;
  // Mais comprido: cada ponto busca a imagem mais perto do centro na vertical.
  q.y /= 1.0 + esticar * 0.9 * w;
  // Testa estreita e boca larga demais (a metade de baixo abre para os lados).
  float lower = smoothstep(0.1, -0.4, p.y / raio);
  q.x /= 1.0 + (sorriso * 0.9 * lower - esticar * 0.2) * w;
  // Os traços escorrem para baixo em colunas irregulares.
  q.y += derreter * 0.12 * raio * w * vnoise(vec2(p.x * 14.0 / raio, time * 0.5));
  // Trancos: as linhas pulam de lado em rajadas curtas.
  float burst = step(0.55, hash(vec2(floor(time * 5.0), 2.0)));
  float frame = floor(time * 15.0);
  q.x += (hash(vec2(floor(uv.y * 90.0), frame)) - 0.5) * 0.08 * raio * tremor * w * (0.25 + 0.75 * burst);

  vec3 col = getColor(q / vec2(ratio, 1.0) + centro).rgb;
  // Um pouco mais duro e sem cor, como quem não está bem.
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(smoothstep(0.05, 0.95, l)), 0.3 * w);
  return vec4(col, 1.0);
}
