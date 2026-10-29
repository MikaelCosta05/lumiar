import { History, LoaderCircle, RotateCcw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type Project } from '../project/model';
import { listVersions, type VersionInfo } from '../project/storage';
import { locale, t } from '../i18n';
import { keys } from '../i18n/keys';
import { Button, cx, IconButton, Segmented } from './kit';

/** O que mudou de um estado do projeto para o seguinte, em poucas palavras. */
export function describeChange(before: Project, after: Project): string {
  const count = (p: Project) => ({
    clips: p.clips.length,
    texts: p.textTracks.reduce((n, track) => n + track.clips.length, 0),
    audio: p.audioTracks.reduce((n, track) => n + track.clips.length, 0),
    overlays: p.videoTracks.reduce((n, track) => n + track.clips.length, 0),
    packs: (p.packTracks ?? []).reduce((n, track) => n + track.clips.length, 0),
    markers: p.markers.length,
    media: p.media.length,
  });
  const a = count(before);
  const b = count(after);
  // [um adicionado, vários adicionados, um removido, vários removidos]
  const verb = (x: number, y: number, texts: [string, string, string, string]) => {
    const n = Math.abs(y - x);
    return (y > x ? (n > 1 ? texts[1] : texts[0]) : n > 1 ? texts[3] : texts[2]).replace('{n}', String(n));
  };
  if (a.media !== b.media) return verb(a.media, b.media, [t('Mídia adicionada'), t('{n} mídias adicionadas'), t('Mídia removida'), t('{n} mídias removidas')]);
  if (a.clips !== b.clips)
    return b.clips > a.clips && a.clips > 0 && b.clips - a.clips < 20 && before.clips.every((c) => after.clips.some((d) => d.id === c.id))
      ? t('Clipe dividido ou adicionado')
      : verb(a.clips, b.clips, [t('Clipe adicionado'), t('{n} clipes adicionados'), t('Clipe removido'), t('{n} clipes removidos')]);
  if (a.packs !== b.packs) return verb(a.packs, b.packs, [t('Pacote adicionado'), t('{n} pacotes adicionados'), t('Pacote removido'), t('{n} pacotes removidos')]);
  if (a.texts !== b.texts) return verb(a.texts, b.texts, [t('Texto adicionado'), t('{n} textos adicionados'), t('Texto removido'), t('{n} textos removidos')]);
  if (a.audio !== b.audio) return verb(a.audio, b.audio, [t('Áudio adicionado'), t('{n} áudios adicionados'), t('Áudio removido'), t('{n} áudios removidos')]);
  if (a.overlays !== b.overlays)
    return verb(a.overlays, b.overlays, [t('Sobreposição adicionada'), t('{n} sobreposições adicionadas'), t('Sobreposição removida'), t('{n} sobreposições removidas')]);
  if (a.markers !== b.markers) return verb(a.markers, b.markers, [t('Marcador adicionado'), t('{n} marcadores adicionados'), t('Marcador removido'), t('{n} marcadores removidos')]);
  if (before.width !== after.width || before.height !== after.height) return t('Formato do projeto');
  if (before.name !== after.name) return t('Nome do projeto');
  if (before.clips !== after.clips) {
    const changed = after.clips.find((c, i) => c !== before.clips[i]);
    const prev = changed && before.clips.find((c) => c.id === changed.id);
    if (changed && prev) {
      // O corte vem antes: cortar também desloca os keyframes dos efeitos.
      if (changed.trimIn !== prev.trimIn || changed.trimOut !== prev.trimOut) return t('Corte do clipe');
      if (changed.speed !== prev.speed) return t('Velocidade do clipe');
      if (changed.filter !== prev.filter) return t('Filtro do clipe');
      if (changed.effects !== prev.effects) return t('Efeitos do clipe');
      if (changed.camera !== prev.camera) return t('Câmera do clipe');
      if (changed.grade !== prev.grade || changed.lut !== prev.lut) return t('Cor do clipe');
    }
    return t('Clipe editado');
  }
  if (before.transitions !== after.transitions) return t('Transição');
  if (before.textTracks !== after.textTracks) return t('Texto editado');
  if (before.audioTracks !== after.audioTracks) return t('Áudio editado');
  if (before.videoTracks !== after.videoTracks) return t('Sobreposição editada');
  if (before.packTracks !== after.packTracks) return t('Pacote editado');
  if (before.captions !== after.captions) return t('Legendas');
  if (before.beats !== after.beats) return t('Batidas da música');
  return t('Ajuste');
}

const time = (ms: number | undefined) => (ms ? new Date(ms).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '');

/**
 * Histórico: os passos desta sessão (clique para voltar direto a um ponto) e as cópias de segurança
 * guardadas automaticamente (para abrir uma versão anterior, mesmo de outro dia).
 */
export function HistoryDialog({
  entries,
  onJump,
  onRestore,
  onClose,
}: {
  entries: { past: Project[]; current: Project; future: Project[]; timeOf: (p: Project) => number | undefined };
  onJump: (steps: number) => void;
  onRestore: (key: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'session' | 'versions'>('session');
  const [versions, setVersions] = useState<VersionInfo[] | null>(null);
  useEffect(() => {
    if (tab === 'versions') void listVersions().then(setVersions).catch(() => setVersions([]));
  }, [tab]);

  const all = [...entries.past, entries.current, ...entries.future];
  const currentIndex = entries.past.length;
  // Do mais recente para o mais antigo.
  const rows = all.map((state, i) => ({ state, i, label: i === 0 ? t('Começo') : describeChange(all[i - 1], state) })).reverse();

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[80vh] w-[440px] animate-pop-in flex-col rounded-2xl border border-line bg-panel p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <History size={18} className="text-accent" />
          <h2 className="flex-1 text-[15px] font-semibold">{t('Histórico')}</h2>
          <IconButton label={t('Fechar')} onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'session', label: t('Nesta sessão') },
            { value: 'versions', label: t('Cópias de segurança') },
          ]}
        />
        {tab === 'session' ? (
          <>
            <p className="my-2 text-[11px] leading-snug text-faint">
              {t('Clique num passo para voltar até ele (dá para refazer depois). {undo} e {redo} continuam valendo.', { undo: keys('Ctrl+Z'), redo: keys('Ctrl+Y') })}
            </p>
            <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
              {rows.map(({ state, i, label }) => (
                <button
                  key={i}
                  onClick={() => onJump(i - currentIndex)}
                  className={cx(
                    'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors',
                    i === currentIndex ? 'bg-accent/20 text-fg' : i > currentIndex ? 'text-faint hover:bg-panel-2' : 'text-dim hover:bg-panel-2 hover:text-fg',
                  )}
                >
                  <span className={cx('size-1.5 shrink-0 rounded-full', i === currentIndex ? 'bg-accent' : i > currentIndex ? 'bg-line-strong' : 'bg-dim')} />
                  <span className="flex-1 truncate">{label}</span>
                  <span className="font-mono text-[10px] text-faint">{time(entries.timeOf(state))}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="my-2 text-[11px] leading-snug text-faint">
              {t('O Lumiar guarda uma cópia do projeto a cada 5 minutos de edição (as 15 mais recentes), mesmo sem você salvar.')}
            </p>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
              {!versions ? (
                <p className="flex items-center gap-2 text-xs text-dim">
                  <LoaderCircle size={13} className="animate-spin" /> {t('Carregando…')}
                </p>
              ) : versions.length === 0 ? (
                <p className="text-xs text-dim">{t('Nenhuma cópia ainda. A primeira é feita depois de alguns minutos de edição.')}</p>
              ) : (
                versions.map((v) => (
                  <div key={v.key} className="flex items-center gap-2 rounded-lg border border-line bg-panel-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{v.name}</p>
                      <p className="text-[11px] text-faint">
                        {new Date(v.savedAt).toLocaleString(locale())} · {v.summary}
                      </p>
                    </div>
                    <Button className="h-7 text-xs" icon={<RotateCcw size={12} />} onClick={() => onRestore(v.key)}>
                      {t('Abrir')}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
