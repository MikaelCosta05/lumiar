import { describe, expect, it } from 'vitest';
import { createCamera } from './camera';
import { createProject, createVideoClip, layoutProject, type MediaItem, type Project, type VideoClip } from './model';
import { cutsPerMinute, stillStretches } from './pacing';
import { createTextClip, TEXT_PRESETS } from './text';

const media: MediaItem = { id: 'v', kind: 'video', name: 'v.mp4', file: {} as File, url: '', thumbnail: null, duration: 120, width: 1920, height: 1080, hasAudio: true };

function build(lengths: number[], edit: (c: VideoClip, i: number) => VideoClip = (c) => c): Project {
  const clips = lengths.map((len, i) => edit({ ...createVideoClip(media), trimOut: len }, i));
  return { ...createProject(), media: [media], clips, transitions: clips.slice(1).map(() => null) };
}

describe('stillStretches', () => {
  it('projeto vazio não tem trechos parados', () => {
    const p = createProject();
    expect(stillStretches(p, layoutProject(p))).toEqual([]);
  });

  it('um clipe longo sem nada acontecendo é um trecho parado inteiro', () => {
    const p = build([20]);
    expect(stillStretches(p, layoutProject(p))).toEqual([[0, 20]]);
  });

  it('cortes quebram os trechos; só contam os de pelo menos `still` segundos', () => {
    const p = build([5, 10, 6.99]);
    expect(stillStretches(p, layoutProject(p), 7)).toEqual([[5, 15]]);
  });

  it('textos entrando e saindo contam como mudança na tela', () => {
    const base = build([20]);
    const text = createTextClip(TEXT_PRESETS[0], 8, 2);
    const p = { ...base, textTracks: [{ ...base.textTracks[0], clips: [text] }] };
    expect(stillStretches(p, layoutProject(p))).toEqual([
      [0, 8],
      [10, 20],
    ]);
  });

  it('keyframes de câmera dentro do clipe também contam', () => {
    const p = build([20], (c) => ({
      ...c,
      camera: { ...createCamera(), keyframes: { zoom: [{ time: 10, value: 1.5, easing: 'ease' }] } },
    }));
    expect(stillStretches(p, layoutProject(p))).toEqual([
      [0, 10],
      [10, 20],
    ]);
  });
});

describe('cutsPerMinute', () => {
  it('clipes por minuto do vídeo todo', () => {
    expect(cutsPerMinute(layoutProject(build([10, 10, 10])))).toBe(6);
    expect(cutsPerMinute(layoutProject(createProject()))).toBe(0);
  });
});
