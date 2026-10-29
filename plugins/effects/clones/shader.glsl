vec4 effect(vec2 uv) {
  vec4 base = getColor(uv);
  vec3 col = base.rgb;
  // A pessoa de agora fica na frente; as cópias, da mais distante para a mais perto.
  float me = getPerson(uv);
  for (int i = 4; i >= 1; i--) {
    float k = float(i);
    if (k > copias + 0.5) continue;
    vec2 p = uv - vec2(distancia * k, 0.0);
    if (p.x < 0.0 || p.x > 1.0) continue;
    vec4 past = getPast(p, atraso * k);
    col = mix(col, past.rgb, past.a * opacidade * (1.0 - me));
  }
  return vec4(col, base.a);
}
