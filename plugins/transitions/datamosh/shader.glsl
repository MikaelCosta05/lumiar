vec2 blockUv(vec2 uv) {
  vec2 size = vec2(mix(1.0, 28.0, blocos) * resolution.y / 720.0) / resolution;
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
  if (progress < corte) return getFromColor(uv);
  return mix(getPrevious(uv), getToColor(uv), smoothstep(0.75, 1.0, progress));
}
