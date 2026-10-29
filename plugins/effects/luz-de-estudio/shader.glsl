/** Inclinação da superfície pela profundidade, medida a `r` pixels (mais longe = superfície mais lisa). */
vec2 slope(vec2 uv, float r) {
  vec2 px = r * resolution.y / 720.0 / resolution;
  return vec2(getDepth(uv + vec2(px.x, 0.0)) - getDepth(uv - vec2(px.x, 0.0)),
              getDepth(uv + vec2(0.0, px.y)) - getDepth(uv - vec2(0.0, px.y)));
}

vec4 effect(vec2 uv) {
  vec4 c = getColor(uv);
  float mask = soPessoa > 0.5 ? getPerson(uv) : 1.0;

  // Normal: média de inclinações em três escalas; a suavidade pesa as largas (luz que "abraça").
  float s = suavidade;
  vec2 g = slope(uv, 4.0) * (1.0 - s) + slope(uv, 14.0) * 0.6 + slope(uv, 40.0) * s * 1.2;
  vec3 n = normalize(vec3(-g * 5.0, 1.0));

  // Direção da luz: o ângulo na tela (0° = da direita, 90° = de cima) e a altura (1 = de frente).
  float a = radians(angulo);
  vec2 side = vec2(cos(a), sin(a));
  vec3 l = normalize(vec3(side * (1.0 - altura * 0.85), 0.25 + altura));
  // Luz "enrolada": suave passa da metade do rosto; dura corta seco.
  float wrap = mix(0.05, 0.6, s);
  float diffuse = clamp((dot(n, l) + wrap) / (1.0 + wrap), 0.0, 1.0);
  // Queda de lado a lado do corpo, para a direção valer também onde o rosto é plano.
  float across = clamp(0.5 + dot((uv - 0.5) * vec2(ratio, 1.0), side) * mix(2.4, 1.2, s), 0.0, 1.0);
  float light = mix(diffuse, diffuse * across * 1.6, 0.55);
  float spec = pow(max(dot(reflect(-l, n), vec3(0.0, 0.0, 1.0)), 0.0), mix(40.0, 10.0, s)) * (1.0 - s * 0.7);

  // Tom da pele vezes a luz (a cor pinta o que já existe), lado oposto mais escuro.
  vec3 lit = c.rgb * (1.0 - sombra * (1.0 - light)) + c.rgb * cor * light * intensidade * 0.8 + cor * spec * intensidade * 0.25;
  vec3 col = mix(c.rgb * (1.0 - fundo), lit, mask);
  if (soPessoa < 0.5) col = lit;
  return vec4(col, c.a);
}
