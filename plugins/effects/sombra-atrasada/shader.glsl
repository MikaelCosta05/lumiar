/** Onde a pessoa estava `atraso` segundos atrás (o alfa do quadro passado), espalhado pela difusão. */
float shadowAt(vec2 uv) {
  float sum = getPast(uv, atraso).a;
  float r = difusa * 14.0 * resolution.y / 720.0;
  if (r < 0.5) return sum;
  vec2 px = r / resolution;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7854 + 0.39;
    sum += getPast(uv + vec2(cos(a), sin(a)) * px, atraso).a;
  }
  return sum / 9.0;
}

vec4 effect(vec2 uv) {
  vec4 c = getColor(uv);
  // A sombra é a pessoa do passado empurrada para o lado: só aparece onde a pessoa de agora não está.
  float shadow = shadowAt(uv - vec2(ladoX, ladoY));
  float me = getPerson(uv);
  // Escurece multiplicando (a textura da parede continua aparecendo por baixo).
  vec3 col = mix(c.rgb, c.rgb * cor * 4.0 + cor, shadow * escuridao * (1.0 - me));
  return vec4(col, c.a);
}
