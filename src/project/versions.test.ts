import { describe, expect, it } from 'vitest';
import { createProject, createVideoClip, insertVideoClips, removeMedia, type MediaItem, type Project } from './model';
import {
  addVersion,
  allMedia,
  deleteVersion,
  duplicateVersion,
  nextVersionName,
  openVersion,
  overwriteVersion,
  packVersions,
  relinkMedia,
  renameVersion,
  unpackVersions,
  versionOnlyMedia,
} from './versions';

function media(id: string): MediaItem {
  return { id, kind: 'video', name: `${id}.mp4`, file: {} as File, url: `blob:${id}`, thumbnail: null, duration: 10, width: 1920, height: 1080, hasAudio: false };
}

function project(): Project {
  const a = media('a');
  const b = media('b');
  return insertVideoClips({ ...createProject(), name: 'Teste', media: [a, b] }, [createVideoClip(a), createVideoClip(b)]);
}

describe('versões nomeadas', () => {
  it('projetos antigos não têm versões; a primeira se chama "Versão 1"', () => {
    const p = project();
    expect(p.versions).toBeUndefined();
    expect(nextVersionName(p)).toBe('Versão 1');
  });

  it('guarda o projeto como está, sem as outras versões dentro, com data e resumo', () => {
    let p = addVersion(project(), 'Versão do cliente', 1000, 'v1');
    p = addVersion(p, '  ', 2000, 'v2');
    expect(p.versions!.map((v) => [v.id, v.name, v.savedAt])).toEqual([
      ['v1', 'Versão do cliente', 1000],
      ['v2', 'Versão 2', 2000],
    ]);
    expect('versions' in p.versions![1].project).toBe(false);
    expect(p.versions![0].summary).toBe('2 clipe(s) · 00:19') // a transição entre os dois sobrepõe 0,8 s;
  });

  it('abrir volta para o que foi guardado e mantém a lista e as mídias atuais', () => {
    const saved = addVersion(project(), 'Longa', 1, 'v1');
    // Depois de guardar: tira um clipe e importa outra mídia.
    const c = media('c');
    const edited: Project = { ...saved, clips: saved.clips.slice(0, 1), media: [...saved.media, c] };
    const opened = openVersion(edited, 'v1')!;
    expect(opened.clips).toHaveLength(2);
    expect(opened.versions).toBe(edited.versions);
    expect(opened.media.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(openVersion(edited, 'nenhuma')).toBeNull();
  });

  it('duplicar, renomear, atualizar e apagar', () => {
    let p = addVersion(project(), 'Curta', 1, 'v1');
    p = duplicateVersion(p, 'v1', 5, 'v2');
    expect(p.versions!.map((v) => v.name)).toEqual(['Curta', 'Curta (cópia)']);
    p = renameVersion(p, 'v2', 'Curta 15s');
    expect(p.versions![1].name).toBe('Curta 15s');
    expect(renameVersion(p, 'v2', '   ')).toBe(p);
    const shorter: Project = { ...p, clips: p.clips.slice(0, 1) };
    p = overwriteVersion(shorter, 'v2', 9);
    expect(p.versions![1].project.clips).toHaveLength(1);
    expect(p.versions![1].savedAt).toBe(9);
    expect(p.versions![0].project.clips).toHaveLength(2);
    p = deleteVersion(deleteVersion(p, 'v1'), 'v2');
    expect(p.versions).toBeUndefined();
  });

  it('mídia que só uma versão usa continua guardada no arquivo', () => {
    let p = addVersion(project(), 'Com a b', 1, 'v1');
    p = removeMedia(p, 'b');
    expect(p.media.map((m) => m.id)).toEqual(['a']);
    expect(versionOnlyMedia(p).map((m) => m.id)).toEqual(['b']);
    expect(allMedia(p).map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('vai para o arquivo com as mídias pelo id e volta igual', () => {
    const p = addVersion(project(), 'Cliente', 1, 'v1');
    const packed = packVersions(p.versions)!;
    expect(packed[0].project.media).toEqual(['a', 'b']);
    const json = JSON.parse(JSON.stringify(packed));
    const byId = new Map(p.media.map((m) => [m.id, m]));
    const back = unpackVersions(json, byId)!;
    expect(back[0].project.media.map((m) => m.id)).toEqual(['a', 'b']);
    expect(back[0].project.clips).toEqual(JSON.parse(JSON.stringify(p.versions![0].project.clips)));
    expect(packVersions(undefined)).toBeUndefined();
    expect(unpackVersions(undefined, byId)).toBeUndefined();
  });

  it('mídia que não voltou ao abrir: os clipes dela saem da versão', () => {
    const p = addVersion(project(), 'Cliente', 1, 'v1');
    const back = unpackVersions(packVersions(p.versions), new Map([['a', p.media[0]]]))!;
    expect(back[0].project.media.map((m) => m.id)).toEqual(['a']);
    expect(back[0].project.clips.map((c) => c.mediaId)).toEqual(['a']);
  });

  it('depois de salvar, as versões passam a usar as mídias do arquivo novo', () => {
    const p = addVersion(project(), 'Cliente', 1, 'v1');
    const fresh = new Map(p.media.map((m) => [m.id, { ...m, url: `novo:${m.id}` }]));
    const relinked = relinkMedia(p, fresh);
    expect(relinked.media.map((m) => m.url)).toEqual(['novo:a', 'novo:b']);
    expect(relinked.versions![0].project.media.map((m) => m.url)).toEqual(['novo:a', 'novo:b']);
  });
});
