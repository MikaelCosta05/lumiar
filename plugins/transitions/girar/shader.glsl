// Espelha coordenadas fora da tela em vez de esticar a borda
vec2 mirror(vec2 x) { return 1.0 - abs(1.0 - mod(x, 2.0)); }

vec4 transition(vec2 uv) {
  float e = progress * progress * (3.0 - 2.0 * progress);
  float angle = e * PI * 2.0 * turns;
  float zoom = 1.0 + sin(progress * PI) * 1.5;
  vec2 p = (uv - 0.5) * vec2(ratio, 1.0);
  p = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * p * zoom;
  vec2 q = mirror(p / vec2(ratio, 1.0) + 0.5);
  return mix(getFromColor(q), getToColor(q), smoothstep(0.4, 0.6, progress));
}
