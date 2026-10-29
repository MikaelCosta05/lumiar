import { describe, expect, it } from 'vitest';
import {
  anySolo,
  clearSolos,
  clipStrips,
  dbToFader,
  dbToGain,
  effectiveGains,
  faderToDb,
  formatDb,
  gainToDb,
  isAudible,
  masterGain,
  MIN_DB,
  mixerStrips,
  panGains,
  resetMix,
  setMasterGainDb,
  setStripMix,
  stripGain,
  stripSettings,
} from './mixer';
import { createProject, type MediaItem, type Project } from './model';

function media(id: string, hasAudio = true): MediaItem {
  return { id, kind: 'video', name: `${id}.mp4`, file: {} as File, url: '', thumbnail: null, duration: 10, width: 1920, height: 1080, hasAudio };
}

/** Projeto com um vídeo na principal, uma trilha de vídeo com som, uma sem som e duas de áudio. */
function project(): Project {
  const base = createProject();
  const clip = { id: 'c1', mediaId: 'v', trimIn: 0, trimOut: 5, effects: [], filter: null, volume: 1 } as unknown as Project['clips'][number];
  const overlay = (id: string, mediaId: string) => ({ ...clip, id, mediaId, start: 0, fadeIn: 0, fadeOut: 0 }) as unknown as Project['videoTracks'][number]['clips'][number];
  return {
    ...base,
    media: [media('v'), media('foto', false)],
    clips: [clip],
    videoTracks: [
      { id: 'vt1', name: 'Vídeo 2', hidden: false, muted: false, clips: [overlay('o1', 'v')] },
      { id: 'vt2', name: 'Vídeo 3', hidden: false, muted: false, clips: [overlay('o2', 'foto')] },
    ],
    audioTracks: [
      { id: 'a1', name: 'Música', muted: false, kind: 'music', clips: [{ id: 'm1', mediaId: 'v', start: 0, trimIn: 0, trimOut: 5, volume: 1, fadeIn: 0, fadeOut: 0 }] },
      { id: 'a2', name: 'Narração', muted: false, kind: 'voice', clips: [] },
    ],
  };
}

describe('dB e fader', () => {
  it('converte dB em ganho e volta', () => {
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(-6)).toBeCloseTo(0.501, 3);
    expect(dbToGain(6)).toBeCloseTo(1.995, 3);
    expect(dbToGain(12)).toBeCloseTo(dbToGain(6));
    expect(dbToGain(MIN_DB)).toBe(0);
    expect(dbToGain(-Infinity)).toBe(0);
    expect(gainToDb(1)).toBe(0);
    expect(gainToDb(0)).toBe(-Infinity);
    expect(gainToDb(dbToGain(-12))).toBeCloseTo(-12);
  });

  it('o fader tem −∞ embaixo, 0 dB em 3/4 e +6 em cima, e é inversível', () => {
    expect(faderToDb(0)).toBe(-Infinity);
    expect(faderToDb(0.75)).toBe(0);
    expect(faderToDb(1)).toBe(6);
    expect(dbToFader(-Infinity)).toBe(0);
    for (const db of [-48, -20, -6, -1, 0, 3, 6]) expect(faderToDb(dbToFader(db))).toBeCloseTo(db, 6);
    // Sempre subindo.
    let last = -Infinity;
    for (let p = 0.01; p <= 1; p += 0.01) {
      const db = faderToDb(p);
      expect(db).toBeGreaterThan(last);
      last = db;
    }
  });

  it('mostra o dB com sinal', () => {
    expect(formatDb(0)).toBe('0.0');
    expect(formatDb(-6)).toBe('−6.0');
    expect(formatDb(2.54)).toBe('+2.5');
    expect(formatDb(-Infinity)).toBe('−∞');
    expect(formatDb(MIN_DB)).toBe('−∞');
  });
});

describe('pan', () => {
  it('no centro os dois lados ficam inteiros', () => {
    expect(panGains(0)).toEqual([1, 1]);
  });

  it('para um lado, o outro cai até sumir com potência constante', () => {
    const [l, r] = panGains(1);
    expect(l).toBeCloseTo(0, 6);
    expect(r).toBe(1);
    expect(panGains(-1)[1]).toBeCloseTo(0, 6);
    expect(panGains(-1)[0]).toBe(1);
    expect(panGains(0.5)[0]).toBeCloseTo(Math.SQRT1_2, 6);
    expect(panGains(5)).toEqual(panGains(1));
    expect(panGains(Number.NaN)).toEqual([1, 1]);
  });
});

describe('canais', () => {
  it('lista a principal, só as trilhas de vídeo com som e todas as de áudio', () => {
    expect(mixerStrips(project()).map((s) => s.id)).toEqual(['main', 'video:vt1', 'audio:a1', 'audio:a2']);
  });

  it('cada clipe toca no canal da sua trilha', () => {
    const map = clipStrips(project());
    expect(map.get('c1')).toBe('main');
    expect(map.get('o1')).toBe('video:vt1');
    expect(map.get('m1')).toBe('audio:a1');
  });

  it('projeto antigo, sem ajustes: 0 dB, centro, sem solo', () => {
    const p = project();
    for (const s of mixerStrips(p)) {
      expect(stripSettings(p, s.id)).toEqual({ gainDb: 0, pan: 0, solo: false, muted: false });
      expect(stripGain(p, s.id)).toBe(1);
    }
    expect(masterGain(p)).toBe(1);
    expect(effectiveGains(p, 'audio:a1', 0.8)).toEqual([0.8, 0.8]);
  });
});

describe('mudo e solo', () => {
  it('o mudo das trilhas é o mesmo do cabeçalho da timeline', () => {
    let p = setStripMix(project(), 'audio:a1', { muted: true });
    expect(p.audioTracks[0].muted).toBe(true);
    expect(isAudible(p, 'audio:a1')).toBe(false);
    p = setStripMix(p, 'video:vt1', { muted: true });
    expect(p.videoTracks[0].muted).toBe(true);
    p = setStripMix(p, 'main', { muted: true });
    expect(p.mainMix?.muted).toBe(true);
    expect(stripGain(p, 'main')).toBe(0);
  });

  it('com algum solo, só os canais em solo tocam', () => {
    const p = setStripMix(setStripMix(project(), 'audio:a2', { solo: true }), 'main', { solo: true });
    expect(anySolo(p)).toBe(true);
    expect(isAudible(p, 'main')).toBe(true);
    expect(isAudible(p, 'audio:a2')).toBe(true);
    expect(isAudible(p, 'audio:a1')).toBe(false);
    expect(isAudible(p, 'video:vt1')).toBe(false);
    // O Master não entra no solo.
    expect(masterGain(p)).toBe(1);
    expect(anySolo(clearSolos(p))).toBe(false);
  });

  it('mudo vence o solo', () => {
    const p = setStripMix(project(), 'audio:a1', { solo: true, muted: true });
    expect(isAudible(p, 'audio:a1')).toBe(false);
    expect(isAudible(p, 'main')).toBe(false);
  });

  it('solo numa trilha que sumiu do mixer não silencia as outras', () => {
    const p = setStripMix(project(), 'video:vt2', { solo: true });
    expect(anySolo(p)).toBe(false);
    expect(isAudible(p, 'main')).toBe(true);
  });
});

describe('ganho final', () => {
  it('junta o clipe, o canal, o pan e o Master', () => {
    let p = setStripMix(project(), 'audio:a1', { gainDb: -6, pan: 1 });
    p = setMasterGainDb(p, 6);
    const [l, r] = effectiveGains(p, 'audio:a1', 0.5);
    expect(l).toBeCloseTo(0, 6);
    expect(r).toBeCloseTo(0.5 * dbToGain(-6) * dbToGain(6), 6);
  });

  it('limita os valores e não mexe nas outras trilhas', () => {
    const p = setStripMix(project(), 'audio:a1', { gainDb: 40, pan: -3 });
    expect(stripSettings(p, 'audio:a1')).toMatchObject({ gainDb: 6, pan: -1 });
    expect(p.audioTracks[1]).toEqual(project().audioTracks[1]);
    expect(stripSettings(p, 'audio:a2').gainDb).toBe(0);
  });

  it('zerar o mixer mantém o mudo das trilhas', () => {
    let p = setStripMix(project(), 'audio:a1', { gainDb: -10, solo: true, muted: true });
    p = setStripMix(setMasterGainDb(p, -3), 'main', { muted: true, pan: 0.4 });
    const reset = resetMix(p);
    expect(stripSettings(reset, 'audio:a1')).toEqual({ gainDb: 0, pan: 0, solo: false, muted: true });
    expect(stripSettings(reset, 'main')).toEqual({ gainDb: 0, pan: 0, solo: false, muted: true });
    expect(masterGain(reset)).toBe(1);
  });
});
