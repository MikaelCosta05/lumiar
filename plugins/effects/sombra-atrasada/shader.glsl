// Sombra atrasada: a sombra da pessoa na parede, um pouco atrás no tempo.
// - A penumbra é um desfoque gaussiano de verdade do recorte do passado (32 amostras fixas numa espiral áurea,
//   pesos de sino), sem as 8 cópias em anel que apareciam como contornos repetidos.
// - Fica só onde a pessoa de agora não está (com a borda suave da máscara) e escurece multiplicando, para a
//   textura da parede continuar por baixo.
float shadowAt(vec2 uv) {
  float r = difusa * 21.0;                            // σ em px de 1080p
  if (r < 0.75) return getPast(uv, atraso).a;
  vec2 toUv = vec2(1.0 / ratio, 1.0) / 1080.0;
  float sum = 0.0, wsum = 0.0;
  for (int i = 0; i < 32; i++) {
    float rr = sqrt((float(i) + 0.5) / 32.0) * 2.2;
    float a = float(i) * 2.39996323;
    float w = exp(-0.5 * rr * rr);
    sum += getPast(uv + vec2(cos(a), sin(a)) * rr * r * 0.5 * toUv, atraso).a * w;
    wsum += w;
  }
  return sum / wsum;
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
