// Espelha coordenadas fora da tela em vez de esticar a borda
vec2 mirror(vec2 x) { return 1.0 - abs(1.0 - mod(x, 2.0)); }

vec4 effect(vec2 uv) {
  vec2 p = (uv - 0.5) * vec2(ratio, 1.0);
  float r = length(p);
  float seg = 2.0 * PI / segments;
  float a = mod(atan(p.y, p.x) + time * speed, seg);
  a = abs(a - seg * 0.5);
  vec2 q = vec2(cos(a), sin(a)) * r / zoom;
  return getColor(mirror(q / vec2(ratio, 1.0) + 0.5));
}
