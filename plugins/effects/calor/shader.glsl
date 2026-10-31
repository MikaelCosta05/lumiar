// Miragem de calor: o ar quente sobe em células de convecção e desvia a luz.
// - Ruído de gradiente 3D (tempo no eixo z): a textura evolui sem "pular" e sobe com a velocidade.
// - As células são mais largas que altas (faixas onduladas, como sobre o asfalto) e o desvio é sobretudo vertical.
// - Duas escalas de ar (correntes largas e tremor fino) e a leitura espelhada nas bordas (nada esticado).
vec2 mirrorUv(vec2 p) { return 1.0 - abs(1.0 - mod(p, 2.0)); }

vec4 effect(vec2 uv) {
  vec2 a = lmCentered(uv);
  float t = time * speed;
  vec3 q = vec3(a.x * 7.0, a.y * 18.0 - t * 2.4, t * 0.8);
  float big = lmNoise(q);
  float fine = lmNoise(q * vec3(2.3, 2.1, 1.4) + vec3(7.7, 3.1, 1.9));
  float side = lmNoise(q * vec3(1.1, 0.9, 1.0) + vec3(13.1, 5.3, 2.7));
  vec2 d = vec2(side * 0.45, big * 0.75 + fine * 0.35);
  float mask = mix(1.0, 1.0 - uv.y, bottom);
  vec2 offset = d * amount * lmPx(11.0) * mask;
  return getColor(mirrorUv(uv + offset / vec2(ratio, 1.0)));
}
