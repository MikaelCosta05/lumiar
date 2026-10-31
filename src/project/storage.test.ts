import { describe, expect, it } from 'vitest';
import { evaluate, type Keyframe } from '../engine/keyframes';
import type { EffectInstance } from '../engine/types';
import { ADJUSTMENT_TEMPLATE, createAdjustmentBlock, isAdjustmentBlock } from './adjustmentBlock';
import { copyLook, pasteLook } from './clipboard';
import { mirrorKeyframes } from './loops';
import { createProject, createVideoClip, layoutProject, resolveFrame, toFrameInput, type MediaItem, type Project } from './model';
import { applyPack, bakePack, createPackClip, findPackClip, placePackClip, templateFromClip, withTemplateLut } from './packs';
import { createGrade } from './grade';

// storage.ts prepara o salvamento automático (IndexedDB) ao carregar; no Node basta um substituto.
(globalThis as { IDBKeyRange?: unknown }).IDBKeyRange ??= { bound: () => null };
const { openProjectFile } = await import('./storage');

/** Monta um .lumiar como o saveProject grava (cabeçalho + JSON), sem mídias. */
function lumiarFile(project: object): File {
  const json = new TextEncoder().encode(JSON.stringify({ version: 1, project }));
  const bytes = new Uint8Array(12 + json.length);
  bytes.set(new TextEncoder().encode('LUMIAR01'), 0);
  new DataView(bytes.buffer).setUint32(8, json.length, true);
  bytes.set(json, 12);
  return new File([bytes], 'teste.lumiar');
}

const custom: Keyframe[] = [
  { time: 0, value: 1, easing: 'custom', bezier: [0.2, 1.6, 0.4, 0.9] },
  { time: 2, value: 2, easing: 'linear' },
];
const glow = (keyframes?: EffectInstance['keyframes']): EffectInstance => ({ uid: 'e1', pluginId: 'effects/brilho', enabled: true, params: { forca: 0.5 }, keyframes });

function saved(p: Project) {
  // O que o arquivo guarda: o projeto em JSON, com as mídias à parte (aqui, nenhuma).
  return { ...JSON.parse(JSON.stringify({ ...p, media: [] })), media: [] };
}

describe('salvar e abrir: curvas personalizadas', () => {
  it('as alças voltam iguais e a animação dá o mesmo valor', async () => {
    const base = createProject();
    const project: Project = { ...base, packTracks: [{ ...base.packTracks[0], clips: [{ ...createAdjustmentBlock(0, 4), effects: [glow({ forca: custom })] }] }] };
    const opened = await openProjectFile(lumiarFile(saved(project)));
    const keys = opened.packTracks[0].clips[0].effects[0].keyframes!.forca;
    expect(keys).toEqual(custom);
    for (const t of [0.3, 1, 1.7]) expect(evaluate(keys, t, 0)).toBeCloseTo(evaluate(custom, t, 0) as number, 12);
    // Passa do ponto: no meio do caminho já está acima do valor final.
    expect(evaluate(keys, 1, 0) as number).toBeGreaterThan(2);
  });

  it('projeto antigo (sem curva personalizada) abre e anima como antes', async () => {
    const old = { ...saved(createProject()), packTracks: [{ id: 'p', name: 'Pacotes', hidden: false, clips: [{ id: 'k', packId: 'packs/x', name: 'X', color: '#fff', start: 0, duration: 2, intensity: 1, fadeIn: 0, fadeOut: 0, timing: 'edges', filter: null, camera: null, effects: [glow({ forca: [{ time: 0, value: 0, easing: 'ease-in' }, { time: 2, value: 1, easing: 'linear' }] })] }] }] };
    const opened = await openProjectFile(lumiarFile(old));
    const keys = opened.packTracks[0].clips[0].effects[0].keyframes!.forca;
    expect(keys[0]).toEqual({ time: 0, value: 0, easing: 'ease-in' });
    expect(evaluate(keys, 1, 0)).toBeCloseTo(0.125);
  });

  it('copiar e colar o visual leva as alças junto', () => {
    const video: MediaItem = { id: 'v', kind: 'video', name: 'v.mp4', file: {} as File, url: '', thumbnail: null, duration: 4, width: 1920, height: 1080, hasAudio: false };
    const base = createProject();
    const project: Project = {
      ...base,
      media: [video],
      clips: [
        { ...createVideoClip(video), id: 'c1', effects: [glow({ forca: custom })] },
        { ...createVideoClip(video), id: 'c2' },
      ],
      transitions: [null],
    };
    const copied = copyLook(project, { kind: 'clip', id: 'c1' })!;
    const pasted = pasteLook(project, { kind: 'clip', id: 'c2' }, copied);
    expect(pasted.clips[1].effects[0].keyframes!.forca[0].bezier).toEqual([0.2, 1.6, 0.4, 0.9]);
  });

  it('inverter o clipe gira a curva personalizada', () => {
    const mirrored = mirrorKeyframes({ forca: custom }, 2)!.forca;
    expect(mirrored[0]).toMatchObject({ time: 0, value: 2, easing: 'custom' });
    expect(mirrored[0].bezier).toEqual([0.6, 0.1, 0.8, -0.6].map((v) => expect.closeTo(v, 9)));
    // Tocado ao contrário: o valor em t é o do original em (2 - t).
    for (const t of [0.4, 1, 1.5]) expect(evaluate(mirrored, t, 0)).toBeCloseTo(evaluate(custom, 2 - t, 0) as number, 6);
  });
});

describe('salvar e abrir: bloco de ajuste', () => {
  it('o bloco vazio, depois de ajustado, volta igual', async () => {
    const block = { ...createAdjustmentBlock(1, 3), filter: { pluginId: 'filters/cinema', intensity: 0.6, params: {} } };
    const project = placePackClip(createProject(), block);
    const opened = await openProjectFile(lumiarFile(saved(project)));
    const back = findPackClip(opened, block.id)!.clip;
    expect(back).toEqual(block);
    expect(isAdjustmentBlock(back)).toBe(true);
  });

  it('"Salvar como meu pacote" guarda o que foi escolhido no bloco', () => {
    const block = { ...createAdjustmentBlock(0, 5), name: 'Meu ajuste', effects: [glow()] };
    const template = templateFromClip(block, 'cursor');
    expect(template).toMatchObject({ name: 'Meu ajuste', custom: true, category: 'Meus pacotes', duration: 5 });
    expect(template.effects).toEqual([{ pluginId: 'effects/brilho', params: { forca: 0.5 }, keyframes: undefined }]);
    const again = createPackClip(template, 2);
    expect(again.effects.map((e) => e.pluginId)).toEqual(['effects/brilho']);
    expect(again.duration).toBe(5);
  });

  it('vazio, o bloco não vai para o renderizador; com um efeito ligado, vai', () => {
    const empty = createAdjustmentBlock(0, 4);
    const input = (p: Project) => toFrameInput(resolveFrame(p, layoutProject(p), 1), () => ({ source: null }));
    expect(input(placePackClip(createProject(), empty)).adjust).toEqual([]);
    expect(input(placePackClip(createProject(), { ...empty, effects: [{ ...glow(), enabled: false }] })).adjust).toEqual([]);
    expect(input(placePackClip(createProject(), { ...empty, effects: [glow()] })).adjust).toHaveLength(1);
  });

  it('o modelo do bloco de ajuste não traz nada', () => {
    expect(ADJUSTMENT_TEMPLATE).toMatchObject({ effects: [], filter: null, camera: null });
    const clip = createPackClip(ADJUSTMENT_TEMPLATE, 2);
    expect(clip).toMatchObject({ start: 2, duration: ADJUSTMENT_TEMPLATE.duration, effects: [], filter: null, camera: null, intensity: 1 });
  });
});

describe('cor manual nos pacotes e no bloco de ajuste', () => {
  // LUT 2×2×2 que troca vermelho e azul (os dados como o parseCube guarda: base64 de RGB em bytes).
  const bytes = [0, 0, 0, 0, 0, 255, 0, 255, 0, 0, 255, 255, 255, 0, 0, 255, 0, 255, 255, 255, 0, 255, 255, 255];
  const lut = { id: 'lut-troca', name: 'Troca', size: 2, data: btoa(String.fromCharCode(...bytes)) };
  const warm = { ...createGrade(), saturation: 1.4, highlights: { x: 0.3, y: -0.2, level: 0.1 } };
  const input = (p: Project, t = 1) => toFrameInput(resolveFrame(p, layoutProject(p), t), () => ({ source: null }), null, p.luts);

  it('sem cor manual: o quadro do pacote fica exatamente como antes (sem passada de cor)', () => {
    const plain = { ...createAdjustmentBlock(0, 4), effects: [glow()] };
    const neutral = { ...plain, grade: createGrade(), lut: { id: lut.id, amount: 0 } };
    const a = input(placePackClip({ ...createProject(), luts: [lut] }, plain)).adjust!;
    const b = input(placePackClip({ ...createProject(), luts: [lut] }, neutral)).adjust!;
    expect(a).toHaveLength(1);
    expect('color' in a[0]).toBe(false);
    expect(b).toEqual(a);
    // Bloco vazio com cor neutra continua de fora.
    expect(input(placePackClip(createProject(), { ...createAdjustmentBlock(0, 4), grade: createGrade() })).adjust).toEqual([]);
  });

  it('com rodas, curvas ou LUT, o bloco (mesmo vazio de efeitos) leva a cor para o renderizador', () => {
    const block = { ...createAdjustmentBlock(0, 4), grade: warm, lut: { id: lut.id, amount: 0.7 } };
    const [adjust] = input(placePackClip({ ...createProject(), luts: [lut] }, block)).adjust!;
    expect(adjust.effects).toEqual([]);
    expect(adjust.color!.grade!.saturation).toBeCloseTo(1.4);
    expect(adjust.color!.curves).toBeNull();
    expect(adjust.color!.lut).toMatchObject({ key: lut.id, size: 2, amount: 0.7 });
    expect([...adjust.color!.lut!.data]).toEqual(bytes);
    // Só a curva: também vale.
    const curved = { ...createAdjustmentBlock(0, 4), grade: { ...createGrade(), curves: { ...createGrade().curves, master: [[0, 0.1], [1, 1]] as [number, number][] } } };
    expect(input(placePackClip(createProject(), curved)).adjust![0].color!.curves).not.toBeNull();
    // LUT que não está no projeto: sem cor (e sem erro).
    expect(input(placePackClip(createProject(), { ...createAdjustmentBlock(0, 4), lut: { id: 'sumiu', amount: 1 } })).adjust).toEqual([]);
  });

  it('salvar e abrir o projeto leva a cor do bloco', async () => {
    const block = { ...createAdjustmentBlock(1, 3), grade: warm, lut: { id: lut.id, amount: 0.5 } };
    const project = placePackClip({ ...createProject(), luts: [lut] }, block);
    const opened = await openProjectFile(lumiarFile(saved(project)));
    expect(findPackClip(opened, block.id)!.clip).toEqual(block);
    expect(input(opened, 2).adjust).toEqual(input(project, 2).adjust);
  });

  it('"Salvar como meu pacote" leva a cor e a LUT (com os dados) para outro projeto', () => {
    const block = { ...createAdjustmentBlock(0, 4), name: 'Quente', grade: warm, lut: { id: lut.id, amount: 0.6 } };
    const template = JSON.parse(JSON.stringify(templateFromClip(block, 'cursor', [lut])));
    expect(template.grade).toEqual(warm);
    expect(template.lut).toEqual({ amount: 0.6, data: lut });
    // Num projeto novo, sem a LUT: aplicar põe a LUT no projeto e o bloco usa ela.
    const other = createProject();
    const { project, id } = applyPack(other, layoutProject(other), template, 0);
    expect(project.luts).toEqual([lut]);
    const clip = findPackClip(project, id)!.clip;
    expect(clip.grade).toEqual(warm);
    expect(clip.lut).toEqual({ id: lut.id, amount: 0.6 });
    expect(input(project).adjust![0].color!.lut).toMatchObject({ key: lut.id, amount: 0.6 });
    // De novo no mesmo projeto: a LUT não se repete.
    expect(withTemplateLut(project, template).luts).toHaveLength(1);
    // Fixar no clipe também leva a cor.
    const video: MediaItem = { id: 'v', kind: 'video', name: 'v.mp4', file: {} as File, url: '', thumbnail: null, duration: 4, width: 1920, height: 1080, hasAudio: false };
    const baked = bakePack(template, createVideoClip(video), 4);
    expect(baked.grade).toEqual(warm);
    expect(baked.lut).toEqual({ id: lut.id, amount: 0.6 });
  });

  it('pacote pronto, sem cor manual, cria o bloco igual a antes (sem campos de cor)', () => {
    const clip = createPackClip(ADJUSTMENT_TEMPLATE, 0);
    expect('grade' in clip || 'lut' in clip).toBe(false);
    expect('grade' in templateFromClip(clip, 'cursor') || 'lut' in templateFromClip(clip, 'cursor')).toBe(false);
  });
});
