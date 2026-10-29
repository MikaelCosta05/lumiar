import {
  addAudioTrack,
  clipLength,
  createAudioClip,
  createOverlayClip,
  createVideoClip,
  insertVideoClips,
  layoutProject,
  placeOverlayClip,
  speedOf,
  updateAudioTrack,
  type MediaItem,
  type Project,
} from './model';

/**
 * Levar a edição para o Premiere, o DaVinci Resolve ou o Final Cut (e trazer de volta):
 * - XML no formato do Final Cut Pro 7 ("xmeml"), que os três importam, com todas as trilhas;
 * - EDL (CMX 3600), a lista de cortes mais antiga e universal, só com a trilha principal.
 * Efeitos, filtros, textos e transições do Lumiar não vão junto: só os cortes e as posições.
 */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function toFcpXml(project: Project): string {
  const fps = project.fps;
  const f = (seconds: number) => Math.round(seconds * fps);
  const tl = layoutProject(project);
  const rate = `<rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>`;
  const files = new Set<string>();
  let n = 0;
  const fileTag = (m: MediaItem) => {
    const id = `file-${m.id}`;
    if (files.has(id)) return `<file id="${id}"/>`;
    files.add(id);
    const visual = m.kind !== 'audio' ? `<video><samplecharacteristics><width>${m.width}</width><height>${m.height}</height></samplecharacteristics></video>` : '';
    const audio = m.hasAudio || m.kind === 'audio' ? '<audio><channelcount>2</channelcount></audio>' : '';
    return `<file id="${id}"><name>${esc(m.name)}</name><pathurl>file://localhost/${encodeURIComponent(m.name)}</pathurl>${rate}<duration>${f(m.kind === 'image' ? 3600 : m.duration)}</duration><media>${visual}${audio}</media></file>`;
  };
  const item = (m: MediaItem, start: number, end: number, inS: number, outS: number, extra = '') =>
    `<clipitem id="clip-${++n}"><name>${esc(m.name)}</name><enabled>TRUE</enabled><duration>${f(m.kind === 'image' ? 3600 : m.duration)}</duration>${rate}<start>${f(start)}</start><end>${f(end)}</end><in>${f(inS)}</in><out>${f(outS)}</out>${fileTag(m)}${extra}</clipitem>`;

  // Trilha principal: cada clipe começa onde o anterior termina (as transições do Lumiar viram cortes).
  const main = tl.clips.map((l, i) => {
    const next = tl.clips[i + 1];
    const end = next ? Math.min(l.start + l.length, next.start) : l.start + l.length;
    const speed = speedOf(l.clip);
    return { l, end, outS: l.clip.trimIn + (end - l.start) * speed };
  });
  const videoTracks = [
    `<track>${main.map(({ l, end, outS }) => item(l.media, l.start, end, l.clip.trimIn, outS)).join('')}</track>`,
    ...project.videoTracks.map(
      (t) =>
        `<track>${t.clips
          .map((c) => {
            const m = project.media.find((x) => x.id === c.mediaId);
            return m ? item(m, c.start, c.start + clipLength(c), c.trimIn, c.trimOut) : '';
          })
          .join('')}</track>`,
    ),
  ];
  const audioTracks = [
    `<track>${main
      .filter(({ l }) => l.media.hasAudio && !l.clip.audioDetached)
      .map(({ l, end, outS }) => item(l.media, l.start, end, l.clip.trimIn, outS))
      .join('')}</track>`,
    ...project.audioTracks.map(
      (t) =>
        `<track>${t.clips
          .map((c) => {
            const m = project.media.find((x) => x.id === c.mediaId);
            return m ? item(m, c.start, c.start + clipLength(c), c.trimIn, c.trimOut) : '';
          })
          .join('')}</track>`,
    ),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">
<sequence id="lumiar-sequence">
<name>${esc(project.name)}</name>
<duration>${f(tl.duration)}</duration>
${rate}
<media>
<video><format><samplecharacteristics><width>${project.width}</width><height>${project.height}</height>${rate}</samplecharacteristics></format>
${videoTracks.join('\n')}
</video>
<audio>
${audioTracks.join('\n')}
</audio>
</media>
</sequence>
</xmeml>
`;
}

/** Tempo no formato da EDL (hh:mm:ss:quadro). */
function timecode(seconds: number, fps: number): string {
  const total = Math.round(seconds * fps);
  const pad = (v: number) => String(v).padStart(2, '0');
  const fr = total % fps;
  const s = Math.floor(total / fps);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}:${pad(fr)}`;
}

export function toEdl(project: Project): string {
  const fps = project.fps;
  const tl = layoutProject(project);
  const lines = [`TITLE: ${project.name}`, 'FCM: NON-DROP FRAME', ''];
  tl.clips.forEach((l, i) => {
    const next = tl.clips[i + 1];
    const end = next ? Math.min(l.start + l.length, next.start) : l.start + l.length;
    const outS = l.clip.trimIn + (end - l.start) * speedOf(l.clip);
    const reel = `AX`.padEnd(8);
    const tracks = l.media.hasAudio && !l.clip.audioDetached ? 'AA/V ' : 'V    ';
    lines.push(
      `${String(i + 1).padStart(3, '0')}  ${reel} ${tracks} C        ${timecode(l.clip.trimIn, fps)} ${timecode(outS, fps)} ${timecode(l.start, fps)} ${timecode(end, fps)}`,
    );
    lines.push(`* FROM CLIP NAME: ${l.media.name}`);
    lines.push('');
  });
  return lines.join('\n');
}

// ---------------------------------------------------------------- Importar

interface Placed {
  name: string;
  start: number;
  inS: number;
  outS: number;
}

function parseTimecode(tc: string, fps: number): number {
  const [h, m, s, fr] = tc.split(/[:;]/).map(Number);
  return h * 3600 + m * 60 + s + fr / fps;
}

/** Monta o projeto a partir de um XML (xmeml) ou EDL, usando as mídias que já estão no projeto (pelo nome). */
export function importEdit(project: Project, text: string): { project: Project; missing: string[]; clips: number } {
  const byName = new Map(project.media.map((m) => [m.name.toLowerCase(), m]));
  const missing = new Set<string>();
  const find = (name: string) => {
    const m = byName.get(name.toLowerCase());
    if (!m) missing.add(name);
    return m;
  };
  let video: Placed[][] = [];
  let audio: Placed[][] = [];
  if (/<xmeml/i.test(text)) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const fps = Number(doc.querySelector('sequence > rate > timebase')?.textContent) || project.fps;
    const files = new Map<string, string>();
    doc.querySelectorAll('file[id]').forEach((el) => {
      const name = el.querySelector(':scope > name')?.textContent;
      if (name) files.set(el.getAttribute('id')!, name);
    });
    const read = (track: Element): Placed[] =>
      [...track.querySelectorAll(':scope > clipitem')].map((c) => {
        const fileId = c.querySelector(':scope > file')?.getAttribute('id') ?? '';
        const num = (tag: string) => Number(c.querySelector(`:scope > ${tag}`)?.textContent ?? 0) / fps;
        return { name: files.get(fileId) ?? c.querySelector(':scope > name')?.textContent ?? '', start: num('start'), inS: num('in'), outS: num('out') };
      });
    video = [...doc.querySelectorAll('sequence > media > video > track')].map(read);
    audio = [...doc.querySelectorAll('sequence > media > audio > track')].map(read);
  } else {
    // EDL: cada evento + a linha "* FROM CLIP NAME" logo abaixo.
    const fps = project.fps;
    const events: Placed[] = [];
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      const m = line.match(/^\d{3,}\s+\S+\s+\S+\s+C\s+(\d\d[:;]\d\d[:;]\d\d[:;]\d\d)\s+(\d\d[:;]\d\d[:;]\d\d[:;]\d\d)\s+(\d\d[:;]\d\d[:;]\d\d[:;]\d\d)/);
      if (!m) return;
      const name = lines.slice(i + 1, i + 4).find((l) => /FROM CLIP NAME:/i.test(l))?.replace(/.*FROM CLIP NAME:\s*/i, '').trim() ?? '';
      events.push({ name, inS: parseTimecode(m[1], fps), outS: parseTimecode(m[2], fps), start: parseTimecode(m[3], fps) });
    });
    video = [events];
  }

  let next: Project = { ...project, clips: [], transitions: [], videoTracks: [], audioTracks: project.audioTracks.map((t) => ({ ...t, clips: [] })) };
  let count = 0;
  // Primeira trilha de vídeo: trilha principal (na ordem); as outras viram sobreposições.
  const mainClips = [...(video[0] ?? [])]
    .sort((a, b) => a.start - b.start)
    .flatMap((p) => {
      const m = find(p.name);
      return m && m.kind !== 'audio' ? [{ ...createVideoClip(m), trimIn: p.inS, trimOut: m.kind === 'image' ? p.outS : Math.min(m.duration, p.outS) }] : [];
    });
  next = insertVideoClips(next, mainClips);
  next = { ...next, transitions: next.transitions.map(() => null) };
  count += mainClips.length;
  video.slice(1).forEach((track) => {
    for (const p of track) {
      const m = find(p.name);
      if (!m || m.kind === 'audio') continue;
      next = placeOverlayClip(next, { ...createOverlayClip(m, p.start, { x: 0.5, y: 0.5, scale: 1, radius: 0 }), trimIn: p.inS, trimOut: p.outS });
      count++;
    }
  });
  // Áudio: as trilhas que só repetem o som dos vídeos já estão nos clipes; o resto vira trilha de áudio.
  const mainNames = new Set((video[0] ?? []).map((p) => `${p.name}|${p.start.toFixed(2)}`));
  audio.forEach((track) => {
    const own = track.filter((p) => !mainNames.has(`${p.name}|${p.start.toFixed(2)}`));
    if (!own.length) return;
    next = addAudioTrack(next);
    const id = next.audioTracks[next.audioTracks.length - 1].id;
    const clips = own.flatMap((p) => {
      const m = find(p.name);
      return m ? [{ ...createAudioClip(m, p.start), trimIn: p.inS, trimOut: p.outS }] : [];
    });
    next = updateAudioTrack(next, id, (t) => ({ ...t, clips }));
    count += clips.length;
  });
  return { project: next, missing: [...missing], clips: count };
}
