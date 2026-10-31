// Luz de estúdio: ilumina a pessoa de novo. O volume do rosto vem da profundidade (normal medida em três escalas, em
// px de 1080p), a luz é calculada em luz linear como uma luz de verdade (difusa "enrolada" para a luz suave, brilho
// especular estreito para a dura), pinta a pele multiplicando a cor que ela já tem (a textura e o tom continuam) e o
// que passaria do branco é comprimido devagar, sem chapar o rosto. O fundo escurece como luz que cai (multiplica).

/** Inclinação da superfície pela profundidade, medida a `r` px de 1080p (mais longe = superfície mais lisa). */
vec2 slope(vec2 uv, float r) {
  vec2 px = lmPxUv(r * 1.5);
  return vec2(getDepth(uv + vec2(px.x, 0.0)) - getDepth(uv - vec2(px.x, 0.0)),
              getDepth(uv + vec2(0.0, px.y)) - getDepth(uv - vec2(0.0, px.y)));
}

vec3 addLightSoft(vec3 base, vec3 light) {
  vec3 room = max(1.0 - base, 1e-4);
  return base + room * (1.0 - exp(-max(light, 0.0) / room));
}

vec4 effect(vec2 uv) {
  vec4 c = getColor(uv);
  vec3 albedo = lmToLinear(c.rgb);
  float mask = soPessoa > 0.5 ? getPerson(uv) : 1.0;

  // Normal: média de inclinações em três escalas; a suavidade pesa as largas (luz que "abraça").
  float s = suavidade;
  vec2 g = slope(uv, 4.0) * (1.0 - s) + slope(uv, 14.0) * 0.6 + slope(uv, 40.0) * s * 1.2;
  vec3 n = normalize(vec3(-g * 5.0, 1.0));

  // Direção da luz: o ângulo na tela (0° = da direita, 90° = de cima) e a altura (1 = de frente).
  float a = radians(angulo);
  vec2 side = vec2(cos(a), sin(a));
  vec3 l = normalize(vec3(side * (1.0 - altura * 0.85), 0.25 + altura));
  // Luz "enrolada": suave passa da metade do rosto; dura corta mais seco (mas sem serrilhar).
  float wrap = mix(0.05, 0.6, s);
  float diffuse = clamp((dot(n, l) + wrap) / (1.0 + wrap), 0.0, 1.0);
  diffuse = diffuse * diffuse * (3.0 - 2.0 * diffuse);
  // Queda de lado a lado do corpo, para a direção valer também onde o rosto é plano.
  float across = clamp(0.5 + dot(lmCentered(uv), side) * mix(2.4, 1.2, s), 0.0, 1.0);
  float light = mix(diffuse, diffuse * across * 1.6, 0.55);
  float spec = pow(max(dot(reflect(-l, n), vec3(0.0, 0.0, 1.0)), 0.0), mix(40.0, 10.0, s)) * (1.0 - s * 0.7);

  // Lado oposto mais escuro (multiplica a luz) e a luz nova somada pintando a pele com a cor dela.
  vec3 tint = lmToLinear(cor);
  vec3 lit = albedo * pow(1.0 - sombra * (1.0 - light), 2.2);
  lit = addLightSoft(lit, albedo * tint * light * intensidade * 1.1 + tint * spec * intensidade * 0.12);
  vec3 col = soPessoa > 0.5 ? mix(albedo * pow(1.0 - fundo, 2.2), lit, mask) : lit;
  return vec4(lmToSrgb(col), c.a);
}
