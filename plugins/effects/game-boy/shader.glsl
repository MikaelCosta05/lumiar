float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

float bayer4(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return m[int(q.y) * 4 + int(q.x)] / 16.0;
}

vec4 effect(vec2 uv) {
  vec2 grid = vec2(floor(pixels * ratio), pixels);
  vec2 cell = floor(uv * grid);
  vec3 c = getColor((cell + 0.5) / grid).rgb;
  float l = luma(c) + (bayer4(cell) - 0.5) * 0.25;
  vec3 pal[4] = vec3[4](vec3(0.06, 0.22, 0.06), vec3(0.19, 0.38, 0.19), vec3(0.55, 0.67, 0.06), vec3(0.61, 0.74, 0.06));
  int i = int(clamp(floor(l * 4.0), 0.0, 3.0));
  return vec4(pal[i], 1.0);
}
