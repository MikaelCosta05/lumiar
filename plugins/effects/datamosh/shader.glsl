/** Centro do bloco (como nos vídeos comprimidos, o movimento anda em quadradinhos). */
vec2 blockUv(vec2 uv) {
  vec2 size = vec2(mix(1.0, 28.0, blocos) * resolution.y / 720.0) / resolution;
  return (floor(uv / size) + 0.5) * size;
}

vec2 motionAt(vec2 uv) {
  return getMotion(blocos > 0.01 ? blockUv(uv) : uv) * amplificar;
}

/** A imagem anterior empurrada pelo movimento de agora; a nova só aparece aos poucos. */
vec4 state(vec2 uv) {
  vec4 now = getColor(uv);
  if (firstFrame()) return now;
  // Lê o pixel inteiro mais próximo: misturar vizinhos a cada quadro borraria a imagem aos poucos.
  vec3 moved = getPrevious((floor((uv - motionAt(uv)) * resolution) + 0.5) / resolution).rgb;
  return vec4(mix(now.rgb, moved, forca), 1.0);
}

vec4 effect(vec2 uv) {
  // As cores estouram só na imagem mostrada (no estado, o reforço se acumularia a cada quadro).
  vec3 c = getPrevious(uv).rgb;
  float moving = clamp(length(motionAt(uv) * resolution) / resolution.y * 60.0, 0.0, 1.0);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, 1.0 + cores * 1.2 * moving);
  return vec4(clamp(c, 0.0, 1.0), getColor(uv).a);
}
