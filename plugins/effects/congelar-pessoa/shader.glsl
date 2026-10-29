bool frozen() {
  return time >= momento && (duracaoGelo <= 0.0 || time < momento + duracaoGelo);
}

/** Até o momento, guarda o quadro (com a pessoa no alfa); depois, segura o que ficou guardado. */
vec4 state(vec2 uv) {
  if (frozen() && !firstFrame()) return getPrevious(uv);
  if (modo < 0.5) return vec4(getColor(uv).rgb, getPerson(uv));
  return vec4(getBackground(uv).rgb, 1.0);
}

vec3 desaturate(vec3 c) {
  return mix(c, vec3(dot(c, vec3(0.299, 0.587, 0.114))), dessaturar);
}

/** Linha branca do lado de fora da forma (alfa do quadro guardado ou a pessoa de agora). */
float outline(vec2 uv, bool snapshot) {
  float here = snapshot ? getPrevious(uv).a : getPerson(uv);
  float around = 0.0;
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 0.5236;
    vec2 o = vec2(cos(a), sin(a)) * 3.0 * resolution.y / 720.0 / resolution;
    around = max(around, snapshot ? getPrevious(uv + o).a : getPerson(uv + o));
  }
  return around * (1.0 - here);
}

vec4 effect(vec2 uv) {
  vec4 base = getColor(uv);
  if (!frozen()) return base;
  vec4 snap = getPrevious(uv);
  float me = getPerson(uv);
  vec3 col;
  if (modo < 0.5) {
    // A pessoa de agora some (fica o fundo) e a guardada aparece parada no lugar.
    vec3 world = mix(base.rgb, getBackground(uv).rgb, me);
    col = mix(world, desaturate(snap.rgb), snap.a);
    col = mix(col, vec3(1.0), outline(uv, true) * contorno);
  } else {
    col = mix(desaturate(snap.rgb), base.rgb, me);
    col = mix(col, vec3(1.0), outline(uv, false) * contorno);
  }
  return vec4(col, base.a);
}
