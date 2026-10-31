import { describe, expect, it } from 'vitest';
import {
  applyEasing,
  EASINGS,
  evaluate,
  evaluateNumber,
  keyframeAt,
  KEYFRAME_TOLERANCE,
  keyframeTimes,
  removeKeyframe,
  resolveParams,
  setKeyframe,
  shiftKeyframes,
  type Easing,
  type Keyframe,
} from './keyframes';

const kf = (time: number, value: Keyframe['value'], easing: Easing = 'linear'): Keyframe => ({ time, value, easing });

describe('applyEasing', () => {
  it('todas as curvas (menos o salto) começam em 0 e terminam em 1', () => {
    for (const { id } of EASINGS) {
      if (id === 'hold') continue;
      expect(applyEasing(id, 0), id).toBeCloseTo(0, 9);
      expect(applyEasing(id, 1), id).toBeCloseTo(1, 9);
    }
  });

  it('salto segura o valor até o próximo keyframe', () => {
    expect(applyEasing('hold', 0.99)).toBe(0);
  });

  it('valores conhecidos no meio do caminho', () => {
    expect(applyEasing('linear', 0.3)).toBeCloseTo(0.3);
    expect(applyEasing('ease', 0.5)).toBeCloseTo(0.5);
    expect(applyEasing('ease-in', 0.5)).toBeCloseTo(0.125);
    expect(applyEasing('ease-out', 0.5)).toBeCloseTo(0.875);
    expect(applyEasing('smooth', 0.5)).toBeCloseTo(0.5);
    expect(applyEasing('expo-in-out', 0.5)).toBeCloseTo(0.5);
    expect(applyEasing('expo-out', 0.3)).toBeGreaterThan(0.85);
    expect(applyEasing('expo-in', 0.3)).toBeLessThan(0.01);
  });

  it('as exponenciais sobem sempre (sem voltar) e são contínuas no meio', () => {
    for (const id of ['expo-in', 'expo-out', 'expo-in-out'] as const) {
      let last = -1;
      for (let i = 0; i <= 200; i++) {
        const v = applyEasing(id, i / 200);
        expect(v, `${id} ${i}`).toBeGreaterThanOrEqual(last);
        last = v;
      }
    }
    expect(applyEasing('expo-in-out', 0.4999)).toBeCloseTo(applyEasing('expo-in-out', 0.5001), 2);
  });

  it('"passa do ponto e volta" ultrapassa 1 antes do fim; elástico oscila', () => {
    const back = Array.from({ length: 99 }, (_, i) => applyEasing('back', (i + 1) / 100));
    expect(Math.max(...back)).toBeGreaterThan(1);
    const elastic = Array.from({ length: 99 }, (_, i) => applyEasing('elastic', (i + 1) / 100));
    expect(Math.max(...elastic)).toBeGreaterThan(1);
  });

  it('as curvas sem ultrapassar são crescentes', () => {
    for (const id of ['linear', 'ease', 'ease-in', 'ease-out', 'smooth'] as Easing[]) {
      let prev = -Infinity;
      for (let i = 0; i <= 100; i++) {
        const v = applyEasing(id, i / 100);
        expect(v, `${id} em ${i / 100}`).toBeGreaterThanOrEqual(prev - 1e-12);
        prev = v;
      }
    }
  });
});

describe('evaluate', () => {
  const keys = [kf(1, 0), kf(3, 10, 'hold'), kf(5, 20)];

  it('sem keyframes devolve o valor fixo', () => {
    expect(evaluate(undefined, 2, 7)).toBe(7);
    expect(evaluate([], 2, [1, 2])).toEqual([1, 2]);
  });

  it('antes do primeiro e depois do último seguram as pontas', () => {
    expect(evaluate(keys, 0, 99)).toBe(0);
    expect(evaluate(keys, 100, 99)).toBe(20);
  });

  it('interpola entre dois keyframes com a curva do primeiro', () => {
    expect(evaluate(keys, 2, 99)).toBeCloseTo(5);
    expect(evaluate(keys, 4.9, 99)).toBe(10); // "hold" até o próximo
    expect(evaluate(keys, 5, 99)).toBe(20);
  });

  it('interpola vetores (posição, cor) item a item', () => {
    const color = [kf(0, [0, 0, 0]), kf(2, [1, 0.5, 0])];
    expect(evaluate(color, 1, [0, 0, 0])).toEqual([0.5, 0.25, 0]);
  });

  it('vetores de tamanhos diferentes: o que falta fica parado', () => {
    expect(evaluate([kf(0, [0, 4]), kf(2, [2])], 1, 0)).toEqual([1, 4]);
  });

  it('dois keyframes no mesmo instante não dividem por zero', () => {
    const v = evaluate([kf(1, 0), kf(1, 10), kf(2, 20)], 1.5, 0);
    expect(Number.isFinite(v as number)).toBe(true);
    expect(v).toBeCloseTo(15);
  });

  it('evaluateNumber pega o primeiro item de um vetor', () => {
    expect(evaluateNumber([kf(0, [3, 4])], 0, 0)).toBe(3);
    expect(evaluateNumber(undefined, 0, 9)).toBe(9);
  });
});

describe('resolveParams', () => {
  it('só os parâmetros com keyframes mudam', () => {
    const values = { forca: 1, cor: [1, 1, 1], raio: 2 };
    const out = resolveParams(values, { forca: [kf(0, 0), kf(2, 4)], raio: [] }, 1);
    expect(out).toEqual({ forca: 2, cor: [1, 1, 1], raio: 2 });
    expect(values.forca).toBe(1); // não altera o original
    expect(resolveParams(values, undefined, 1)).toBe(values);
  });
});

describe('editar keyframes', () => {
  it('setKeyframe insere em ordem de tempo e usa "Suave" por padrão', () => {
    const list = setKeyframe(setKeyframe(undefined, 2, 5), 1, 3);
    expect(list.map((k) => k.time)).toEqual([1, 2]);
    expect(list[0].easing).toBe('ease');
  });

  it('setKeyframe perto de um que já existe atualiza em vez de criar', () => {
    const list = [kf(1, 0, 'bounce')];
    const next = setKeyframe(list, 1 + KEYFRAME_TOLERANCE / 2, 9);
    expect(next).toEqual([{ time: 1, value: 9, easing: 'bounce' }]);
    expect(setKeyframe(list, 1, 9, 'linear')[0].easing).toBe('linear');
  });

  it('setKeyframe não cria keyframe antes do começo do clipe', () => {
    expect(setKeyframe([], -3, 1)[0].time).toBe(0);
  });

  it('keyframeAt e removeKeyframe usam a mesma tolerância', () => {
    const list = [kf(1, 0), kf(2, 1)];
    expect(keyframeAt(list, 2.01)?.value).toBe(1);
    expect(keyframeAt(list, 2.1)).toBeUndefined();
    expect(removeKeyframe(list, 0.99).map((k) => k.time)).toEqual([2]);
    expect(removeKeyframe(undefined, 1)).toEqual([]);
  });

  it('keyframeTimes junta os instantes de vários mapas sem repetir', () => {
    expect(keyframeTimes({ a: [kf(1, 0), kf(2.0001, 0)] }, undefined, { b: [kf(2, 0), kf(0.5, 0)] })).toEqual([0.5, 1, 2]);
  });

  it('shiftKeyframes desloca e descarta o que ficou antes do zero', () => {
    expect(shiftKeyframes({ a: [kf(1, 0), kf(3, 1)] }, -2)).toEqual({ a: [kf(1, 1)] });
    expect(shiftKeyframes(undefined, 1)).toBeUndefined();
  });
});
