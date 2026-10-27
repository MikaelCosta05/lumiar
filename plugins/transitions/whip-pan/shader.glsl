vec4 scene(vec2 q) {
  vec2 f = fract(q);
  bool inFrom = q.x >= 0.0 && q.x <= 1.0 && q.y >= 0.0 && q.y <= 1.0;
  return inFrom ? getFromColor(f) : getToColor(f);
}

vec4 transition(vec2 uv) {
  vec2 dir = sign(direction);
  if (dir == vec2(0.0)) dir = vec2(1.0, 0.0);
  // Começa devagar, acelera no meio e freia no fim.
  float e = progress < 0.5 ? 4.0 * progress * progress * progress
                           : 1.0 - pow(-2.0 * progress + 2.0, 3.0) / 2.0;
  float speed = blur * 0.35 * sin(progress * PI);
  vec4 sum = vec4(0.0);
  for (int i = 0; i < 16; i++) {
    float k = float(i) / 15.0 - 0.5;
    sum += scene(uv + (e + k * speed) * dir);
  }
  return sum / 16.0;
}
