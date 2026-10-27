vec4 effect(vec2 uv) {
  vec2 off = vec2(sin(time * speed), cos(time * speed * 0.7)) * amount * 0.03;
  vec3 a = getColor(uv + off).rgb;
  vec3 b = getColor(uv - off).rgb;
  return vec4((a * vec3(1.1, 0.75, 0.75) + b * vec3(0.75, 0.95, 1.15)) * 0.6, 1.0);
}
