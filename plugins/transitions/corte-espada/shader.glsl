vec4 transition(vec2 uv) {
  float side = uv.x - uv.y;
  float s = side >= 0.0 ? 1.0 : -1.0;
  float e = progress * progress;
  vec2 along = vec2(0.7071, 0.7071) * s * e * 1.2;
  vec2 apart = vec2(0.7071, -0.7071) * s * e * 0.3;
  vec2 q = uv - along - apart;
  bool sameSide = (q.x - q.y) * s >= 0.0;
  bool inside = q.x >= 0.0 && q.x <= 1.0 && q.y >= 0.0 && q.y <= 1.0;
  vec3 glow = tint * exp(-abs(side) * 120.0) * sin(progress * PI) * 1.5;
  vec3 col = (sameSide && inside) ? getFromColor(q).rgb : getToColor(uv).rgb;
  return vec4(col + glow, 1.0);
}
