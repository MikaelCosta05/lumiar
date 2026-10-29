vec4 effect(vec2 uv) {
  vec4 base = getColor(uv);
  vec3 col = base.rgb;
  float me = getPerson(uv);
  float n = floor(quantidade + 0.5);
  // Da cópia mais antiga (mais apagada) para a mais nova; a pessoa de agora fica por cima.
  for (int i = 10; i >= 1; i--) {
    float k = float(i);
    if (k > n) continue;
    vec4 past = getPast(uv, espaco * k);
    float l = dot(past.rgb, vec3(0.299, 0.587, 0.114));
    vec3 tinted = mix(past.rgb, cor * (0.4 + l * 1.2), tingir * (0.4 + 0.6 * k / n));
    float fade = (1.0 - (k - 1.0) / n) * opacidade;
    col = mix(col, tinted, past.a * fade * (1.0 - me));
  }
  return vec4(col, base.a);
}
