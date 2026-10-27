vec4 transition(vec2 uv) {
  vec2 dir = uv - 0.5;
  float dist = length(dir * vec2(ratio, 1.0));
  float s = sin(progress * PI);
  vec2 offset = dir * sin(dist * frequency - progress * 30.0) * amplitude * s;
  return mix(getFromColor(uv + offset), getToColor(uv + offset), smoothstep(0.3, 0.7, progress));
}
