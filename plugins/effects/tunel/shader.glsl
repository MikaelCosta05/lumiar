// Túnel infinito: a imagem vira as paredes de um túnel que gira.
// - A parede é lida espelhada (a emenda da volta não aparece) e com o nível de detalhe calculado pela própria
//   projeção: perto do fundo a imagem se repete cada vez mais miúda e, sem isso, vira chuvisco e moiré.
// - O fundo do túnel some numa névoa escura suave.
vec2 mirror(vec2 x) { return 1.0 - abs(1.0 - mod(x, 2.0)); }

vec4 effect(vec2 uv) {
  vec2 p = lmCentered(uv);
  float r = max(length(p), 1e-3);
  float a = atan(p.y, p.x);
  vec2 t = vec2(a / (2.0 * PI) + time * twist * 0.05, depth / r + time * speed * 0.3);
  // Quanto a coordenada da parede anda por pixel da tela (em texels da imagem).
  float px = 1.0 / resolution.y;
  float around = px / (2.0 * PI * r) * 2.0 * resolution.x;
  float along = px * depth / (r * r) * resolution.y;
  float lod = max(log2(max(around, along)), 0.0);
  vec3 c = getColorLod(mirror(t * vec2(2.0, 1.0)), lod).rgb;
  float fog = smoothstep(0.0, 0.35, r);
  return vec4(c * fog * fog * (3.0 - 2.0 * fog), 1.0);
}
