// Espelha coordenadas fora da tela em vez de esticar a borda
vec2 mirror(vec2 x) {
  return 1.0 - abs(1.0 - mod(x, 2.0));
}

vec4 effect(vec2 uv) {
  vec2 p = (uv - 0.5) * vec2(ratio, 1.0);
  float r = max(length(p), 0.001);
  float a = atan(p.y, p.x);
  vec2 t = vec2(a / (2.0 * PI) + time * twist * 0.05, depth / r + time * speed * 0.3);
  vec3 c = getColor(mirror(t * vec2(2.0, 1.0))).rgb;
  return vec4(c * smoothstep(0.0, 0.35, r), 1.0);
}
