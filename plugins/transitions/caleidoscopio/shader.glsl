// Espelha coordenadas fora da tela em vez de esticar a borda
vec2 mirror(vec2 x) {
  return 1.0 - abs(1.0 - mod(x, 2.0));
}

vec4 transition(vec2 uv) {
  float s = sin(progress * PI);
  vec2 aspect = vec2(ratio, 1.0);
  vec2 p = (uv - 0.5) * aspect;
  float r = length(p);
  float seg = 2.0 * PI / segments;
  float ka = abs(mod(atan(p.y, p.x) + progress * 2.0, seg) - seg * 0.5);
  vec2 q = mirror(mix(p, vec2(cos(ka), sin(ka)) * r, s) / aspect + 0.5);
  return mix(getFromColor(q), getToColor(q), smoothstep(0.3, 0.7, progress));
}
