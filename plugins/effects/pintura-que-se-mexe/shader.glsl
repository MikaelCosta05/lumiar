// Pintura que se mexe: pinceladas grossas que seguem as bordas, o movimento da cena e redemoinhos lentos.
// - Integração ao longo das linhas do campo de direção (LIC): a cor e o "pelo" do pincel são somados ida e volta
//   ao longo da pincelada.
// - Ruído de gradiente da biblioteca (sem os padrões do seno); o pelo muda 6 vezes por segundo, como tinta viva.
// - Tons reduzidos com a passagem suave entre um e outro e relevo das cerdas iluminado (inclinação do pelo).
// Ruído suave de 0 a 1 (gradiente, da biblioteca), para o redemoinho.
float vnoise(vec2 p) { return lmNoise(p) * 0.5 + 0.5; }

/** Ruído de valor (acaso por célula da biblioteca, curva quíntica): barato, sem senos, para texturas finas. */
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = lmCellHash(i), b = lmCellHash(i + vec2(1.0, 0.0));
  float c = lmCellHash(i + vec2(0.0, 1.0)), d = lmCellHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}


float luma(vec3 c) { return lmLuma(c); }

/**
 * Direção da pincelada em cada ponto: ao longo das bordas da imagem (perpendicular ao gradiente),
 * puxada para o lado em que a cena anda e torcida por um redemoinho lento.
 */
vec2 swirlDir;

vec2 strokeDir(vec2 p, vec2 edge) {
  // Movimento em pixels por quadro (o gradiente também é medido em pixels).
  vec2 m = getMotion(p) * resolution * 720.0 / resolution.y;
  float speed = length(m);
  vec2 dir = edge;
  if (speed > 1e-3) dir = mix(dir, m / speed * max(0.5, length(edge)), smoothstep(0.3, 3.0, speed) * seguir);
  // O redemoinho é largo (3 voltas por altura): lido uma vez no ponto de partida, vale para a pincelada toda.
  vec2 swirl = swirlDir;
  dir = mix(dir, swirl, redemoinho * 0.6 * (1.0 - length(edge) * 0.5));
  return length(dir) > 1e-4 ? normalize(dir) : swirl;
}

vec4 effect(vec2 uv) {
  vec4 c = getColor(uv);
  float sa = (vnoise(uv * vec2(ratio, 1.0) * 3.0 + time * 0.08) - 0.5) * 6.2832 * redemoinho;
  swirlDir = vec2(cos(sa), sin(sa));
  vec2 px = 1.0 / resolution;
  float r = mix(2.0, 8.0, tamanho) * resolution.y / 720.0;
  // Gradiente largo (sobre a imagem já um pouco borrada pelo passo) para o campo não tremer.
  vec2 o = px * r * 2.0;
  float gx = luma(getColor(uv + vec2(o.x, 0.0)).rgb) - luma(getColor(uv - vec2(o.x, 0.0)).rgb);
  float gy = luma(getColor(uv + vec2(0.0, o.y)).rgb) - luma(getColor(uv - vec2(0.0, o.y)).rgb);
  vec2 edge = vec2(-gy, gx) * 6.0;
  if (length(edge) > 1.0) edge = normalize(edge);

  // Pincelada: a cor e um "pelo" de pincel somados ao longo da linha que segue a direção (ida e volta).
  float stepLen = mix(0.4, 1.4, comprimento) * r * 0.6;
  vec2 cell = vec2(ratio, 1.0) * resolution.y / (r * 2.2);
  float t = floor(time * 6.0) * 0.37;
  vec3 sum = c.rgb;
  float fur = valueNoise(uv * cell + t);
  float total = 1.0;
  for (int s = -1; s <= 1; s += 2) {
    vec2 p = uv;
    vec2 d = strokeDir(uv, edge);
    for (int i = 1; i <= 8; i++) {
      vec2 nd = strokeDir(p, edge);
      d = dot(nd, d) < 0.0 ? -nd : nd;
      p += d * float(s) * stepLen * px;
      float w = 1.0 - float(i) / 9.0;
      sum += getColor(p).rgb * w;
      fur += valueNoise(p * cell + t) * w;
      total += w;
    }
  }
  vec3 col = sum / total;
  fur /= total;

  // Tinta: cores mais cheias (saturação mantendo a luminância) e em menos tons, com a passagem entre um tom e outro
  // suave (sem degraus serrilhados); o relevo das cerdas é iluminado de cima à esquerda pela inclinação do "pelo".
  col = lmSaturate(col, 1.0 + cores * 0.8);
  vec3 x = col * 10.0;
  vec3 q = (floor(x) + smoothstep(0.1, 0.9, fract(x))) / 10.0;
  col = mix(col, q, cores * 0.5);
  float k = resolution.y / 720.0;
  vec2 slope = vec2(dFdx(fur), dFdy(fur)) / max(k, 1e-3);
  float light = dot(slope, normalize(vec2(-0.6, 0.8))) * 7.0;
  col *= 1.0 + clamp(light, -0.5, 0.5) * 0.3 * relevo + (fur - 0.5) * 0.5 * relevo;
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
