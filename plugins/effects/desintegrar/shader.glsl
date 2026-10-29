float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

/** Quando cada grão se solta (0 a 0,65): primeiro o lado de onde o vento vem, com falhas aleatórias. */
float releaseAt(vec2 cell, vec2 dir) {
  vec2 c = (cell + 0.5) * tamanho / resolution;
  float along = clamp(0.5 + dot(c - 0.5, dir) * 1.2, 0.0, 1.0);
  return (along * 0.6 + hash(cell) * 0.4) * 0.65;
}

/** Redemoinho suave do vento (o mesmo para grãos vizinhos). */
vec2 swirl(vec2 p, float age) {
  return vec2(sin(p.y * 7.0 + age * 9.0 + p.x * 3.0), cos(p.x * 6.0 - age * 7.0 + p.y * 2.0));
}

const int STEPS = 28;
const float FLIGHT = 0.35;

vec4 effect(vec2 uv) {
  vec4 base = getColor(uv);
  float p = clamp((time - inicio) / duracaoPo, 0.0, 1.0);
  if (inverter > 0.5) p = 1.0 - p;
  if (p <= 0.0) return base;
  float a = radians(angulo);
  vec2 dir = vec2(cos(a), sin(a));

  // A pessoa: o que já se soltou dá lugar ao fundo (o que estava atrás dela); a frente de quebra brilha.
  vec3 col = base.rgb;
  float me = getPerson(uv);
  vec2 cell = floor(uv * resolution / tamanho);
  float release = releaseAt(cell, dir);
  if (me > 0.01) {
    float intact = step(p, release);
    col = mix(base.rgb, getBackground(uv).rgb, me * (1.0 - intact));
    float front = 1.0 - smoothstep(0.0, 0.035, release - p);
    col += vec3(1.0, 0.45, 0.12) * front * intact * me * brasa;
  }

  // Grãos voando: para cada idade possível, de onde teria vindo o grão que está aqui agora.
  vec3 ash = vec3(0.32, 0.3, 0.28);
  for (int k = 0; k < STEPS; k++) {
    float age = (float(k) + 0.5) / float(STEPS) * FLIGHT;
    if (age > p) break;
    vec2 drift = dir * age * 1.1 + swirl(uv * 2.0, age) * age * 0.12;
    drift.y += age * age * 0.6;
    vec2 src = uv - drift;
    vec2 scell = floor(src * resolution / tamanho);
    vec2 center = (scell + 0.5) * tamanho / resolution;
    if (hash(scell + 7.0) > 0.62 || getPerson(center) < 0.5) continue;
    if (abs(p - releaseAt(scell, dir) - age) > FLIGHT / float(STEPS) * 0.6) continue;
    vec3 grain = mix(getColor(center).rgb, ash, cinza);
    float fade = 1.0 - age / FLIGHT;
    col = mix(col, grain, fade);
    break;
  }
  return vec4(col, base.a);
}
