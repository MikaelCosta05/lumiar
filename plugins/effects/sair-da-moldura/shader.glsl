vec3 blurred(vec2 uv) {
  vec3 sum = getColor(uv).rgb;
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 0.5236;
    sum += getColor(clamp(uv + vec2(cos(a), sin(a)) * vec2(1.0 / ratio, 1.0) * 0.035, 0.0, 1.0)).rgb;
  }
  return sum / 13.0;
}

vec4 effect(vec2 uv) {
  vec4 base = getColor(uv);
  vec2 center = vec2(posicao.x, 1.0 - posicao.y);
  vec2 half_ = vec2(tamanho * 0.5);
  vec2 q = (uv - center) / half_;
  // Quadro inclinado para trás: a borda de cima fica mais estreita (perspectiva).
  float squeeze = 1.0 - (q.y * 0.5 + 0.5) * inclinacao * 0.3;
  vec2 plane = vec2(q.x / squeeze, q.y);
  vec2 content = 0.5 + plane * 0.5 * recorte;

  vec3 col = mix(fundo, blurred(uv) * 0.45, fundoVideo);
  // Sombra suave embaixo e à direita do quadro.
  vec2 shadowPlane = abs(plane - vec2(0.04, -0.06)) - 1.0;
  float shadowDist = length(max(shadowPlane, 0.0));
  col *= 1.0 - sombra * 0.7 * (1.0 - smoothstep(0.0, 0.18, shadowDist));

  float border = borda * 0.05;
  float box = max(abs(plane.x), abs(plane.y));
  bool inside = box <= 1.0;
  if (box <= 1.0 + border) col = vec3(0.96);
  if (inside) col = getColor(content).rgb;

  // A pessoa passa por cima da borda (menos embaixo, para não ficar com as pernas soltas).
  if (!inside && plane.y > -1.0 && content.x >= 0.0 && content.x <= 1.0 && content.y >= 0.0 && content.y <= 1.0) {
    float p = getPerson(content);
    col = mix(col, getColor(content).rgb, p);
  }
  return vec4(col, base.a);
}
