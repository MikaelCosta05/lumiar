// Vento, a partir do "wind" do gl-transitions (MIT): o clipe é levado em fiapos da esquerda para a direita. Os
// fiapos agora são ruído de gradiente em duas escalas medidas na altura da tela (finos de ~4 e grossos de ~20 px
// de 1080p, levemente inclinados), não linhas de acaso por pixel; a frente avança com aceleração suave e, logo à
// frente dela, o clipe atual é arrastado e borrado na direção do vento antes de sumir. Mistura em luz linear.

vec4 transition(vec2 uv) {
  if (progress <= 0.0) return getFromColor(uv);
  if (progress >= 1.0) return getToColor(uv);
  float y = uv.y + uv.x * 0.03;
  float fibers = 0.6 * lmNoise(vec2(y * 260.0, 1.7)) + 0.4 * lmNoise(vec2(y * 55.0, 4.1));
  float r = clamp(0.5 + 0.6 * fibers, 0.0, 1.0);
  float e = lmEaseInOutCubic(progress);
  float x = uv.x * (1.0 - size) + size * r - e * (1.0 + size);
  float m = 1.0 - smoothstep(-size, 0.0, x);

  // À frente da linha, o clipe atual é puxado e borrado pelo vento.
  float blow = (1.0 - smoothstep(0.0, size * 1.2 + 0.05, x)) * smoothstep(0.0, 0.12, progress);
  blow *= blow;
  vec2 drag = vec2(blow * 0.05 * (0.6 + 0.4 * r), 0.0);
  vec2 trail = vec2(blow * 0.09, 0.0);
  int n = int(clamp(ceil(trail.x * resolution.x / 2.5), 1.0, 24.0));
  vec3 a = lmToLinear(lmMotionBlurFrom(clamp(uv - drag, 0.0, 1.0), trail, n).rgb);
  vec3 b = lmToLinear(getToColor(uv).rgb);
  return vec4(lmToSrgb(mix(a, b, m)), 1.0);
}
