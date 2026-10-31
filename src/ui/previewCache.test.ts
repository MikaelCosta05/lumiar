import { describe, expect, it } from 'vitest';
import { fingerprint } from './previewCache';

describe('impressão digital das miniaturas guardadas', () => {
  it('é sempre a mesma para o mesmo código e muda com qualquer mudança', () => {
    const shader = 'vec4 effect(vec2 uv) { return getColor(uv); }';
    expect(fingerprint(shader)).toBe(fingerprint(shader));
    expect(fingerprint(shader)).not.toBe(fingerprint(shader.replace('uv)', 'uv * 0.5)')));
    expect(fingerprint(shader)).not.toBe(fingerprint(`${shader} `));
    expect(fingerprint('')).toMatch(/^[0-9a-z]+\.0$/);
  });
});
