float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

/**
 * Direção da pincelada em cada ponto: ao longo das bordas da imagem (perpendicular ao gradiente),
 * puxada para o lado em que a cena anda e torcida por um redemoinho lento.
 */
vec2 strokeDir(vec2 p, vec2 edge) {
  // Movimento em pixels por quadro (o gradiente também é medido em pixels).
  vec2 m = getMotion(p) * resolution * 720.0 / resolution.y;
  float speed = length(m);
  vec2 dir = edge;
  if (speed > 1e-3) dir = mix(dir, m / speed * max(0.5, length(edge)), smoothstep(0.3, 3.0, speed) * seguir);
  float a = (vnoise(p * vec2(ratio, 1.0) * 3.0 + time * 0.08) - 0.5) * 6.2832 * redemoinho;
  vec2 swirl = vec2(cos(a), sin(a));
  dir = mix(dir, swirl, redemoinho * 0.6 * (1.0 - length(edge) * 0.5));
  return length(dir) > 1e-4 ? normalize(dir) : swirl;
}

vec4 effect(vec2 uv) {
  vec4 c = getColor(uv);
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
  float fur = vnoise(uv * cell + t);
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
      fur += vnoise(p * cell + t) * w;
      total += w;
    }
  }
  vec3 col = sum / total;
  fur /= total;

  // Tinta: cores mais cheias e em menos tons, e o relevo das cerdas acendendo e escurecendo.
  float l = luma(col);
  col = mix(vec3(l), col, 1.0 + cores * 0.8);
  col = mix(col, floor(col * 10.0 + 0.5) / 10.0, cores * 0.5);
  col *= 1.0 + (fur - 0.5) * 0.9 * relevo;
  return vec4(clamp(col, 0.0, 1.0), c.a);
}
