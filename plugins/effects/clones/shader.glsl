// Clones: a mesma pessoa várias vezes, cada cópia um pouco atrasada.
// - O recorte de cada cópia é apertado de leve (smoothstep no alfa do passado): sem o contorno do fundo antigo
//   em volta do corpo.
// - A cópia que passa da borda do quadro some com uma borda de um pixel suavizada, sem corte serrilhado.
vec4 effect(vec2 uv) {
  vec4 base = getColor(uv);
  vec3 col = base.rgb;
  // A pessoa de agora fica na frente; as cópias, da mais distante para a mais perto.
  float me = getPerson(uv);
  float px = 1.0 / resolution.x;
  for (int i = 4; i >= 1; i--) {
    float k = float(i);
    if (k > copias + 0.5) continue;
    vec2 p = uv - vec2(distancia * k, 0.0);
    float inside = clamp(min(p.x, 1.0 - p.x) / px + 0.5, 0.0, 1.0);
    if (inside <= 0.0) continue;
    vec4 past = getPast(p, atraso * k);
    float a = smoothstep(0.2, 0.85, past.a) * inside;
    col = mix(col, past.rgb, a * opacidade * (1.0 - me));
  }
  return vec4(col, base.a);
}
