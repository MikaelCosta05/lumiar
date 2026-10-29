import { describe, expect, it } from 'vitest';
import { lutInput, parseCube } from './lut';

/** LUT identidade 2×2×2 (vermelho varia primeiro, como no padrão .cube). */
const IDENTITY = `# Feito à mão
TITLE "Identidade"
LUT_3D_SIZE 2

0 0 0
1 0 0
0 1 0
1 1 0
0 0 1
1 0 1
0 1 1
1 1 1
`;

const bytesOf = (data: string) => Array.from(atob(data), (c) => c.charCodeAt(0));

describe('parseCube', () => {
  it('lê o tamanho e os valores, ignorando comentários e o título', () => {
    const lut = parseCube(IDENTITY, 'Minha LUT.CUBE');
    expect(lut.name).toBe('Minha LUT');
    expect(lut.size).toBe(2);
    expect(bytesOf(lut.data)).toEqual([0, 0, 0, 255, 0, 0, 0, 255, 0, 255, 255, 0, 0, 0, 255, 255, 0, 255, 0, 255, 255, 255, 255, 255]);
    expect(lut.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('aceita quebras de linha do Windows e valores fora de 0 a 1 (são limitados)', () => {
    const text = IDENTITY.replace('1 1 1', '1.5 -0.2 0.5').replace(/\n/g, '\r\n');
    const bytes = bytesOf(parseCube(text, 'x').data);
    expect(bytes.slice(-3)).toEqual([255, 0, 128]);
  });

  it('DOMAIN_MIN/DOMAIN_MAX reescalam os valores para 0 a 1', () => {
    const text = `LUT_3D_SIZE 2\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 2 2 2\n${'1 2 0\n'.repeat(8)}`;
    expect(bytesOf(parseCube(text, 'x').data).slice(0, 3)).toEqual([128, 255, 0]);
  });

  it('LUT 1D é recusada com uma mensagem clara', () => {
    expect(() => parseCube('LUT_1D_SIZE 4\n0 0 0\n', 'curva.cube')).toThrow(/LUT 1D/);
  });

  it('sem tamanho ou com tamanho absurdo não é uma LUT válida', () => {
    expect(() => parseCube('0 0 0\n1 1 1\n', 'a.cube')).toThrow(/não parece uma LUT/);
    expect(() => parseCube('LUT_3D_SIZE 1\n0 0 0\n', 'a.cube')).toThrow(/não parece uma LUT/);
    expect(() => parseCube('LUT_3D_SIZE 200\n', 'a.cube')).toThrow(/não parece uma LUT/);
  });

  it('arquivo com valores faltando é recusado', () => {
    const cut = IDENTITY.split('\n').slice(0, -3).join('\n');
    expect(() => parseCube(cut, 'cortada.cube')).toThrow(/incompleto/);
  });
});

describe('lutInput', () => {
  const lut = parseCube(IDENTITY, 'id');

  it('decodifica os bytes da LUT escolhida com a intensidade', () => {
    const input = lutInput([lut], { id: lut.id, amount: 0.6 })!;
    expect(input.size).toBe(2);
    expect(input.amount).toBe(0.6);
    expect(Array.from(input.data)).toEqual(bytesOf(lut.data));
  });

  it('sem referência, intensidade zero ou LUT apagada: nada', () => {
    expect(lutInput([lut], undefined)).toBeNull();
    expect(lutInput([lut], { id: lut.id, amount: 0 })).toBeNull();
    expect(lutInput([lut], { id: 'apagada', amount: 1 })).toBeNull();
    expect(lutInput(undefined, { id: lut.id, amount: 1 })).toBeNull();
  });
});
