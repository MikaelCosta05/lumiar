import { describe, expect, it } from 'vitest';
import { importEdit, toEdl, toFcpXml } from './interchange';
import { createAudioClip, createOverlayClip, createProject, createVideoClip, DEFAULT_TRANSITION_ID, type MediaItem, type Project, type VideoClip } from './model';

function media(id: string, name: string, extra: Partial<MediaItem> = {}): MediaItem {
  return { id, kind: 'video', name, file: {} as File, url: '', thumbnail: null, duration: 10, width: 1920, height: 1080, hasAudio: true, ...extra };
}

const praia = media('m1', 'praia.mp4');
const mudo = media('m2', 'Drone & <Céu>.mov', { hasAudio: false });
const trilha = media('m3', 'trilha.mp3', { kind: 'audio', duration: 60, width: 0, height: 0 });

function build(clips: VideoClip[], transitions = clips.slice(1).map(() => null as Project['transitions'][number])): Project {
  return { ...createProject(), name: 'Viagem', fps: 30, media: [praia, mudo, trilha], clips, transitions };
}

const clip = (m: MediaItem, trimIn: number, trimOut: number): VideoClip => ({ ...createVideoClip(m), trimIn, trimOut });

describe('toEdl', () => {
  it('um evento por clipe da trilha principal, com timecodes de origem e de gravação', () => {
    const edl = toEdl(build([clip(praia, 1, 3), clip(mudo, 0, 2.5)]));
    const lines = edl.split('\n');
    expect(lines[0]).toBe('TITLE: Viagem');
    expect(lines[1]).toBe('FCM: NON-DROP FRAME');
    expect(lines[3]).toBe('001  AX       AA/V  C        00:00:01:00 00:00:03:00 00:00:00:00 00:00:02:00');
    expect(lines[4]).toBe('* FROM CLIP NAME: praia.mp4');
    // Sem som: só vídeo. 2,5 s a 30 fps = 2 s e 15 quadros.
    expect(lines[6]).toBe('002  AX       V     C        00:00:00:00 00:00:02:15 00:00:02:00 00:00:04:15');
  });

  it('a transição vira corte: o clipe termina onde o próximo começa', () => {
    const edl = toEdl(build([clip(praia, 0, 4), clip(praia, 5, 9)], [{ pluginId: DEFAULT_TRANSITION_ID, duration: 1, params: {} }]));
    const events = edl.split('\n').filter((l) => /^\d{3} /.test(l));
    expect(events[0]).toContain('00:00:00:00 00:00:03:00 00:00:00:00 00:00:03:00');
    expect(events[1]).toContain('00:00:05:00 00:00:09:00 00:00:03:00 00:00:07:00');
  });

  it('projeto vazio só tem o cabeçalho', () => {
    expect(toEdl(build([]))).toBe('TITLE: Viagem\nFCM: NON-DROP FRAME\n');
  });
});

describe('importEdit (EDL)', () => {
  it('ida e volta: a trilha principal volta com os mesmos cortes, sem transições', () => {
    const original = build([clip(praia, 1.5, 3), clip(mudo, 0, 2.5), clip(praia, 7, 10)]);
    const back = importEdit({ ...original, clips: [], transitions: [] }, toEdl(original));
    expect(back.missing).toEqual([]);
    expect(back.clips).toBe(3);
    expect(back.project.clips.map((c) => [c.mediaId, c.trimIn, c.trimOut])).toEqual([
      ['m1', 1.5, 3],
      ['m2', 0, 2.5],
      ['m1', 7, 10],
    ]);
    expect(back.project.transitions).toEqual([null, null]);
  });

  it('mídias que não estão no projeto são listadas como faltando', () => {
    const edl = toEdl(build([clip(praia, 0, 2), clip(mudo, 0, 2)]));
    const result = importEdit({ ...build([]), media: [praia] }, edl);
    expect(result.missing).toEqual(['Drone & <Céu>.mov']);
    expect(result.project.clips).toHaveLength(1);
  });

  it('o nome da mídia é comparado sem diferenciar maiúsculas', () => {
    const edl = '001  AX       V      C        00:00:01:00 00:00:02:00 00:00:00:00 00:00:01:00\n* FROM CLIP NAME: PRAIA.MP4\n';
    const result = importEdit(build([]), edl);
    expect(result.project.clips.map((c) => [c.mediaId, c.trimIn, c.trimOut])).toEqual([['m1', 1, 2]]);
  });

  it('o corte não passa da duração da mídia', () => {
    const edl = '001  AX       V      C        00:00:05:00 00:01:00:00 00:00:00:00 00:00:55:00\n* FROM CLIP NAME: praia.mp4\n';
    expect(importEdit(build([]), edl).project.clips[0].trimOut).toBe(10);
  });

  it('texto que não é EDL nem XML não cria nada', () => {
    const result = importEdit(build([clip(praia, 0, 2)]), 'isto não é uma EDL');
    expect(result.clips).toBe(0);
    expect(result.project.clips).toEqual([]);
  });
});

describe('toFcpXml', () => {
  it('gera xmeml com todas as trilhas, escapando os nomes', () => {
    let p = build([clip(praia, 0, 2), clip(mudo, 1, 3), clip(praia, 4, 6)]);
    p = { ...p, audioTracks: [{ ...p.audioTracks[0], clips: [{ ...createAudioClip(trilha, 1), trimOut: 5 }] }] };
    p = { ...p, videoTracks: [{ id: 'vt', name: 'Vídeo 2', hidden: false, muted: false, clips: [{ ...createOverlayClip(praia, 2), trimOut: 1 }] }] };
    const xml = toFcpXml(p);
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<!DOCTYPE xmeml>/);
    expect(xml).toContain('<name>Viagem</name>');
    expect(xml).toContain('<timebase>30</timebase>');
    expect(xml).toContain('Drone &amp; &lt;Céu&gt;.mov');
    expect(xml).not.toContain('<Céu>');
    // 3 clipes principais + 1 sobreposição no vídeo; 2 com som na trilha principal + 1 de música.
    expect(xml.match(/<clipitem /g)).toHaveLength(7);
    // Cada arquivo é descrito uma vez só; as outras vezes só apontam para ele.
    expect(xml.match(/<file id="file-m1">/g)).toHaveLength(1);
    expect(xml.match(/<file id="file-m1"\/>/g)!.length).toBeGreaterThan(0);
    // Duração da sequência: 6 s de vídeo = 180 quadros.
    expect(xml).toContain('<duration>180</duration>');
  });

  it('clipe da trilha principal em quadros (início, fim, entrada e saída)', () => {
    const xml = toFcpXml(build([clip(praia, 1, 3)]));
    expect(xml).toContain('<start>0</start><end>60</end><in>30</in><out>90</out>');
  });
});
