float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec4 effect(vec2 uv) {
  float frame = floor(time * 30.0);
  // A altura da faixa respira um pouco de quadro para quadro.
  float h = altura * (1.0 + (hash(vec2(frame, 9.1)) - 0.5) * 0.5 * tremor);
  if (uv.y > h) return getColor(uv);

  float k = 1.0 - uv.y / max(h, 1e-4); // 0 no topo da faixa, 1 na borda de baixo
  float row = floor(uv.y * 240.0);
  float shift = deslocamento * (0.015 + 0.09 * k * k);
  shift += (hash(vec2(row, frame)) - 0.5) * 0.02 * tremor;
  float x = uv.x - shift;
  vec3 col;
  if (x < 0.0) {
    // O que "entrou" pela esquerda: sem imagem, só chiado escuro.
    col = vec3(hash(vec2(floor(uv.x * resolution.x / 2.0), row + frame)) * 0.25);
  } else {
    col = getColor(vec2(x, uv.y)).rgb;
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, vec3(l), 0.5 * k);
  }
  float n = hash(floor(uv * resolution / vec2(3.0, 1.5)) + frame * 7.7);
  col = mix(col, vec3(n), ruido * (0.2 + 0.5 * k));
  // Linha clara onde a troca acontece.
  col += (1.0 - smoothstep(0.0, 0.004, abs(uv.y - h * 0.92))) * 0.25 * deslocamento;
  return vec4(clamp(col, 0.0, 1.0), 1.0);
}
