float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

float bayer4(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return m[int(q.y) * 4 + int(q.x)] / 16.0;
}

vec4 effect(vec2 uv) {
  float k = max(1.0, floor(pixel * resolution.y / 720.0 + 0.5));
  vec2 pix = floor(uv * resolution / k);
  vec3 c = getColor((pix + 0.5) * k / resolution).rgb;
  float on = step(bayer4(pix) + 0.03, luma(c));
  return vec4(mix(dark, light, on), 1.0);
}
