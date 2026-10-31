// Datamosh: no corte, o quadro-chave do próximo clipe "se perde": a imagem do clipe atual fica e os pixels
// escorrem pelo movimento do próximo (vetores de movimento por blocos, como num arquivo de vídeo), até que um
// novo quadro-chave chega aos pedaços, macrobloco a macrobloco, e o próximo clipe aparece inteiro no fim.
// Tamanhos em pixels de 1080p.

vec2 blockUv(vec2 uv) {
  vec2 size = vec2(mix(1.0, 28.0, blocos) * 1.5 * resolution.y / 1080.0) / resolution;
  return (floor(uv / size) + 0.5) * size;
}

/** Antes do corte, guarda o clipe atual; depois, empurra o que ficou pelo movimento do próximo. */
vec4 state(vec2 uv) {
  if (progress < corte || firstFrame()) return getFromColor(uv);
  vec2 mv = getMotion(blocos > 0.01 ? blockUv(uv) : uv) * amplificar;
  // Pixel inteiro mais próximo: misturar vizinhos a cada quadro borraria a imagem aos poucos.
  vec4 moved = getPrevious((floor((uv - mv) * resolution) + 0.5) / resolution);
  return vec4(mix(moved.rgb, getToColor(uv).rgb, vazar), 1.0);
}

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  if (progress < corte) return getFromColor(uv);
  // O quadro-chave chega aos pedaços: cada macrobloco (16 px de 1080p) troca num instante entre 75% e 100%,
  // primeiro em manchas (ruído suave) e com um pouco de acaso por bloco.
  float blockPx = 16.0 * resolution.y / 1080.0;
  vec2 cell = floor(gl_FragCoord.xy / blockPx);
  float order = clamp(0.65 * (0.5 + 0.5 * lmNoise(cell * 0.09)) + 0.35 * lmHash(cell + 0.5), 0.0, 1.0);
  float start = max(0.75, corte + 0.05);
  float at = mix(start, 0.98, order);
  vec4 moshed = getPrevious(uv);
  vec4 next = getToColor(uv);
  // Um quadro de mistura em cada bloco, para a chegada não piscar.
  float k = smoothstep(at, at + 0.02, progress);
  return mix(moshed, next, k);
}
