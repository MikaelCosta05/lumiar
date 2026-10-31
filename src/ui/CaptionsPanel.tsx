import { Download, FileUp, Gauge, LoaderCircle, Mic, Plus, Trash, Users, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { loadFonts } from '../media/fonts';
import { CAPTION_LANGUAGES, CAPTION_MODELS, cancelTranscription, DEFAULT_CAPTION_MODEL, transcribeProject, TranscriptionCancelled } from '../media/captioning';
import { separateSpeakers } from '../media/speakers';
import { TRANSLATE_LANGUAGES, translateTexts } from '../media/ai';
import { drawCaption } from '../media/textRender';
import {
  CAPTION_PRESETS,
  assignSpeakers,
  captionAt,
  captionStyle,
  getCaptions,
  giveAllReadingTime,
  giveReadingTime,
  parseSubtitles,
  READING_LIMIT,
  readingSpeed,
  regroup,
  retext,
  toSrt,
  toVtt,
  updateCaptions,
  type Caption,
  type CaptionStyle,
  type CaptionTrack,
} from '../project/captions';
import { uid, type Project } from '../project/model';
import { formatTime } from './format';
import { SpeakerNames } from './SpeakerNames';
import { Button, cx, IconButton, SectionTitle, Segmented, Slider, Switch, SwitchRow } from './kit';
import { previewStore, sampleImage } from './previews';
import { lang as uiLang, t } from '../i18n';
import { keys } from '../i18n/keys';

interface Props {
  project: Project;
  time: number;
  onChange: (update: (project: Project) => Project) => void;
  onSeek: (time: number) => void;
  notify: (text: string, error?: boolean) => void;
  /** Legenda para abrir no texto (dois cliques nela na timeline) */
  focus?: { id: string; n: number } | null;
}

const POSITIONS = [
  { label: t('Em cima'), y: 0.15 },
  { label: t('No meio'), y: 0.5 },
  { label: t('Embaixo'), y: 0.85 },
];

export function CaptionsPanel({ project, time, onChange, onSeek, notify, focus }: Props) {
  const track = getCaptions(project);
  const style = track.style;
  const [language, setLanguage] = useState<string | null>('portuguese');
  const [model, setModel] = useState(DEFAULT_CAPTION_MODEL);
  const [translate, setTranslate] = useState(false);
  /** Andamento; `left` = minutos que ainda faltam (estimados pelo ritmo até agora). */
  const [progress, setProgress] = useState<{ stage: string; fraction: number | null; left?: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const active = captionAt(track, time);
  const fast = track.captions.filter((c) => readingSpeed(c) > READING_LIMIT).length;
  const listRef = useRef<HTMLDivElement>(null);

  const setTrack = (update: (t: CaptionTrack) => CaptionTrack) => onChange((p) => updateCaptions(p, update));
  const setStyle = (patch: Partial<CaptionStyle>) => setTrack((t) => ({ ...t, style: { ...t.style, ...patch } }));
  const [people, setPeople] = useState<number | null>(null);
  const [separating, setSeparating] = useState<string | null>(null);
  const separate = async () => {
    try {
      const result = await separateSpeakers(project, track.captions, people, setSeparating);
      setTrack((t) => assignSpeakers(t, result.speakerOf, result.count));
      notify(
        result.count > 1
          ? t('Achei {n} vozes diferentes. Dê um nome a cada uma; se alguma legenda ficou com a pessoa errada, clique na bolinha dela.', { n: result.count })
          : t('Pelo som, parece que só uma pessoa fala. Se forem mais, escolha quantas e tente de novo.'),
        result.count === 1,
      );
    } catch (error) {
      notify(t('Não foi possível separar as vozes: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
    } finally {
      setSeparating(null);
    }
  };
  const speakers = track.speakers ?? [];

  // Legendas em outros idiomas: arquivos .srt separados (para o YouTube) ou trocar as da tela.
  const [source, setSource] = useState('pt');
  const [targets, setTargets] = useState<Set<string>>(new Set(['en', 'es']));
  const [translating, setTranslating] = useState<string | null>(null);
  const translateAll = async (mode: 'files' | 'screen') => {
    const langs = mode === 'screen' ? [[...targets][0]] : [...targets];
    try {
      for (const lang of langs) {
        const label = t(TRANSLATE_LANGUAGES.find((l) => l.id === lang)?.label ?? lang);
        const texts = await translateTexts(
          track.captions.map((c) => c.text),
          source,
          lang,
          (stage, f) => setTranslating(`${label}: ${stage}${f === null ? '' : ` ${Math.round(f * 100)}%`}`),
        );
        const translated = track.captions.map((c, i) => ({ ...c, text: texts[i], words: undefined }));
        if (mode === 'screen') {
          setTrack((t) => ({ ...t, captions: translated }));
          // Em inglês os nomes de idioma ficam com maiúscula.
          notify(t('Legendas da tela agora em {language} ({keys} volta).', { language: uiLang === 'en' ? label : label.toLowerCase(), keys: keys('Ctrl+Z') }));
        } else {
          const link = document.createElement('a');
          link.href = URL.createObjectURL(new Blob([toSrt(translated)], { type: 'text/plain;charset=utf-8' }));
          link.download = `${project.name || 'legendas'}.${lang}.srt`;
          link.click();
        }
      }
      if (mode === 'files') notify(t('{n} arquivo(s) .srt baixado(s). No YouTube: Legendas → Adicionar idioma → Enviar arquivo.', { n: langs.length }));
    } catch (error) {
      notify(t('Não foi possível traduzir: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
    } finally {
      setTranslating(null);
    }
  };

  const setCaption = (id: string, patch: Partial<Caption>) =>
    setTrack((t) => ({ ...t, captions: t.captions.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));

  // A legenda que está tocando fica visível na lista.
  useEffect(() => {
    if (!active) return;
    listRef.current?.querySelector(`[data-caption="${active.id}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active?.id]);

  // Dois cliques na timeline: rola até a legenda e põe o cursor no fim do texto dela.
  useEffect(() => {
    if (!focus) return;
    const area = listRef.current?.querySelector<HTMLTextAreaElement>(`[data-caption="${focus.id}"] textarea`);
    if (!area) return;
    area.scrollIntoView({ block: 'center' });
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
  }, [focus?.n]);

  const generate = async () => {
    if (track.captions.length && !confirm(t('Substituir as legendas atuais pelas novas?'))) return;
    try {
      setProgress({ stage: t('Preparando'), fraction: null });
      // Começo da etapa atual, para estimar quanto falta (vídeos longos levam vários minutos).
      let since = { stage: '', at: 0, fraction: 0 };
      const captions = await transcribeProject(project, { model, language, maxWords: track.maxWords, translate }, (stage, fraction) => {
        if (stage !== since.stage) since = { stage, at: performance.now(), fraction: fraction ?? 0 };
        const done = (fraction ?? 0) - since.fraction;
        const minutes = done > 0.02 ? ((performance.now() - since.at) / done) * (1 - (fraction ?? 0)) / 60000 : undefined;
        setProgress({ stage, fraction, left: minutes });
      });
      setTrack((t) => ({ ...t, enabled: true, captions }));
      notify(captions.length ? t('{n} legendas criadas. Confira e corrija o texto na lista.', { n: captions.length }) : t('Nenhuma fala reconhecida.'), !captions.length);
    } catch (error) {
      if (error instanceof TranscriptionCancelled) notify(t('Geração de legendas cancelada.'));
      else notify(t('Não foi possível gerar as legendas: {error}', { error: error instanceof Error ? error.message : String(error) }), true);
    } finally {
      setProgress(null);
    }
  };

  const importFile = async (file: File) => {
    const captions = parseSubtitles(await file.text());
    if (captions.length === 0) {
      notify(t('Nenhuma legenda encontrada em "{name}".', { name: file.name }), true);
      return;
    }
    setTrack((t) => ({ ...t, enabled: true, captions }));
    notify(t('{n} legendas importadas.', { n: captions.length }));
  };

  const exportFile = (format: 'srt' | 'vtt') => {
    const content = format === 'srt' ? toSrt(track.captions) : toVtt(track.captions);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
    link.download = `${project.name || 'legendas'}.${format}`;
    link.click();
  };

  const addAtCursor = () => {
    const caption: Caption = { id: uid(), start: time, end: time + 2.5, text: t('Nova legenda') };
    setTrack((t) => ({ ...t, enabled: true, captions: [...t.captions, caption].sort((a, b) => a.start - b.start) }));
  };

  return (
    <>
      <div className="flex items-center gap-2 px-4 pb-3 pt-4">
        <h2 className="text-[15px] font-semibold">{t('Legendas')}</h2>
        <span className="text-xs text-faint">{track.captions.length}</span>
        <span className="flex-1" />
        <Switch checked={track.enabled} label={t('Mostrar legendas')} onChange={(enabled) => setTrack((t) => ({ ...t, enabled }))} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {/* Automático */}
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold">
            <Mic size={13} className="text-accent" /> {t('Legendas automáticas')}
          </p>
          <p className="mt-1 text-[11px] leading-snug text-faint">
            {t('Reconhece a fala de todo o áudio do projeto, no seu computador (nada é enviado). Cada palavra ganha seu tempo.')}
          </p>
          <p className="mb-1 mt-3 text-[11px] text-faint">{t('Idioma falado')}</p>
          <select className="field h-8 w-full text-xs" value={language ?? ''} onChange={(e) => setLanguage(e.target.value || null)} disabled={!!progress}>
            {CAPTION_LANGUAGES.map((l) => (
              <option key={l.label} value={l.id ?? ''}>
                {t(l.label)}
              </option>
            ))}
          </select>
          {language !== 'english' && (
            <div className="mt-2.5">
              <SwitchRow checked={translate} onChange={setTranslate} label={t('Traduzir as legendas para o inglês')} />
              {translate && (
                <p className="mt-1 text-[11px] leading-snug text-faint">
                  {t('O Whisper ouve no idioma escolhido e escreve em inglês. Ele só sabe traduzir para o inglês; a qualidade "Precisa" traduz melhor.')}
                </p>
              )}
            </div>
          )}
          <p className="mb-1 mt-2.5 text-[11px] text-faint">{t('Qualidade (mais precisa = mais lenta)')}</p>
          <Segmented
            options={CAPTION_MODELS.map((m) => ({ value: m.id, label: t(m.label), title: t('{label} · modelo de {size}', { label: t(m.label), size: m.size }) }))}
            value={model}
            onChange={(id) => !progress && setModel(id)}
          />
          {progress ? (
            <div className="mt-2.5">
              <p className="flex items-center gap-1.5 text-[11px] text-dim">
                <LoaderCircle size={12} className="animate-spin text-accent" />
                {progress.stage}
                {progress.fraction !== null && ` · ${Math.round(progress.fraction * 100)}%`}
                {progress.left !== undefined && progress.left >= 1 && ` · ${t('faltam uns {n} min', { n: Math.ceil(progress.left) })}`}
              </p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-panel-3">
                <div
                  className={cx('h-full rounded-full bg-gradient-to-r from-accent to-accent-2', progress.fraction === null && 'w-1/3 animate-pulse')}
                  style={progress.fraction !== null ? { width: `${progress.fraction * 100}%` } : undefined}
                />
              </div>
              <Button variant="ghost" className="mt-1.5 h-7 w-full text-[11px]" icon={<X size={12} />} onClick={cancelTranscription}>
                {t('Cancelar')}
              </Button>
            </div>
          ) : (
            <Button variant="primary" icon={<Mic size={14} />} className="mt-2.5 w-full" onClick={() => void generate()}>
              {t('Gerar legendas')}
            </Button>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <Button variant="secondary" className="h-8 text-xs" icon={<Plus size={13} />} onClick={addAtCursor}>
            {t('Nova')}
          </Button>
          <Button variant="secondary" className="h-8 text-xs" icon={<FileUp size={13} />} onClick={() => fileRef.current?.click()}>
            {t('Importar')}
          </Button>
        </div>
        <div className="mt-1.5 flex items-center gap-1">
          <span className="flex-1 text-[11px] text-faint">{t('Exportar legendas')}</span>
          <Button
            variant="ghost"
            className="h-7 px-2 text-xs"
            icon={<Download size={12} />}
            disabled={!track.captions.length}
            onClick={() => exportFile('srt')}
            title={t('Baixar as legendas em .srt')}
          >
            .srt
          </Button>
          <Button
            variant="ghost"
            className="h-7 px-2 text-xs"
            icon={<Download size={12} />}
            disabled={!track.captions.length}
            onClick={() => exportFile('vtt')}
            title={t('Baixar as legendas em .vtt')}
          >
            .vtt
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".srt,.vtt,text/vtt"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importFile(file);
            e.target.value = '';
          }}
        />

        {/* Estilo */}
        <SectionTitle>{t('Estilo')}</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          {CAPTION_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => setTrack((t) => ({ ...t, style: captionStyle(preset.id, { y: t.style.y }) }))}
              className="group text-left"
            >
              <div
                className={cx(
                  'aspect-video overflow-hidden rounded-lg ring-2 transition-all',
                  style.preset === preset.id ? 'ring-accent' : 'ring-transparent group-hover:ring-line-strong',
                )}
              >
                <CaptionThumb presetId={preset.id} />
              </div>
              <p className={cx('mt-1 truncate text-[11px]', style.preset === preset.id ? 'text-fg' : 'text-dim')}>{preset.name}</p>
            </button>
          ))}
        </div>

        <div className="mt-3 flex gap-1.5">
          {POSITIONS.map((p) => (
            <button
              key={p.label}
              onClick={() => setStyle({ y: p.y })}
              className={cx(
                'flex-1 rounded-lg border px-2 py-1 text-[11px] transition-colors',
                Math.abs(style.y - p.y) < 0.05 ? 'border-accent bg-accent/15 text-fg' : 'border-line text-dim hover:border-line-strong',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <Range label={t('Tamanho')} value={style.size} display={`${Math.round(style.size * 100)}%`} min={0.025} max={0.18} step={0.005} onChange={(size) => setStyle({ size })} />
        <Range label={t('Altura')} value={style.y} display={`${Math.round(style.y * 100)}%`} min={0.05} max={0.95} step={0.01} onChange={(y) => setStyle({ y })} />
        <Range
          label={t('Palavras por legenda')}
          value={track.maxWords}
          display={String(track.maxWords)}
          min={1}
          max={12}
          step={1}
          onChange={(maxWords) => setTrack((t) => regroup(t, maxWords))}
        />
        <div className="flex items-center justify-between py-1.5">
          <span className="text-xs text-dim">{t('Maiúsculas')}</span>
          <Switch checked={style.uppercase} label={t('Maiúsculas')} onChange={(uppercase) => setStyle({ uppercase })} />
        </div>
        <div className="flex items-center justify-between py-1.5">
          <span className="text-xs text-dim">{t('Cor / destaque')}</span>
          <span className="flex gap-1.5">
            <ColorDot value={style.color} onChange={(color) => setStyle({ color })} />
            <ColorDot value={style.highlight} onChange={(highlight) => setStyle({ highlight })} />
          </span>
        </div>

        {/* Outros idiomas */}
        {track.captions.length > 0 && (
          <>
            <SectionTitle>{t('Outros idiomas')}</SectionTitle>
            <div className="space-y-2 rounded-lg border border-line bg-panel-2 p-2.5">
              <div className="flex items-center gap-1.5 text-[11px] text-dim">
                {t('Legendas em')}
                <select className="field h-7 flex-1 text-[11px]" value={source} onChange={(e) => setSource(e.target.value)} disabled={!!translating}>
                  {TRANSLATE_LANGUAGES.map((l) => (
                    <option key={l.id} value={l.id}>
                      {t(l.label)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-1">
                {TRANSLATE_LANGUAGES.filter((l) => l.id !== source).map((l) => (
                  <button
                    key={l.id}
                    disabled={!!translating}
                    onClick={() =>
                      setTargets((t) => {
                        const next = new Set(t);
                        if (next.has(l.id)) next.delete(l.id);
                        else next.add(l.id);
                        return next;
                      })
                    }
                    className={cx('rounded-full border px-2 py-0.5 text-[11px]', targets.has(l.id) ? 'border-accent bg-accent/20 text-fg' : 'border-line text-faint hover:text-dim')}
                  >
                    {t(l.label)}
                  </button>
                ))}
              </div>
              {translating ? (
                <p className="flex items-center gap-1.5 text-[11px] text-dim">
                  <LoaderCircle size={12} className="animate-spin text-accent" /> {translating}
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-1.5">
                  <Button className="h-8 text-[11px]" icon={<Download size={12} />} disabled={![...targets].some((t) => t !== source)} onClick={() => void translateAll('files')}>
                    {t('Baixar .srt')}
                  </Button>
                  <Button
                    className="h-8 text-[11px]"
                    disabled={![...targets].some((t) => t !== source)}
                    title={t('Troca o texto das legendas da tela pelo primeiro idioma marcado')}
                    onClick={() => void translateAll('screen')}
                  >
                    {t('Mostrar na tela')}
                  </Button>
                </div>
              )}
              <p className="text-[11px] leading-snug text-faint">{t('O tradutor é baixado na primeira vez (cerca de 120 MB por direção) e roda no seu computador.')}</p>
            </div>
          </>
        )}

        {/* Quem fala */}
        <SectionTitle>{t('Quem fala')}</SectionTitle>
        <div className="space-y-2 rounded-lg border border-line bg-panel-2 p-2.5">
          <p className="text-[11px] leading-snug text-faint">
            {t('Entrevista ou podcast? O Lumiar separa as vozes e dá uma cor a cada pessoa (e o nome, se quiser).')}
          </p>
          <div className="space-y-1.5">
            <select
              className="field h-8 w-full text-xs"
              value={people ?? ''}
              onChange={(e) => setPeople(e.target.value ? Number(e.target.value) : null)}
              disabled={!!separating}
              title={t('Quantas pessoas falam no vídeo')}
            >
              <option value="">{t('Descobrir quantas pessoas')}</option>
              {[2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {t('{n} pessoas', { n })}
                </option>
              ))}
            </select>
            <Button
              variant="secondary"
              className="h-8 w-full text-xs"
              icon={separating ? <LoaderCircle size={13} className="animate-spin" /> : <Users size={13} />}
              disabled={!!separating || track.captions.length < 2}
              onClick={() => void separate()}
            >
              {separating ?? t('Separar as vozes')}
            </Button>
          </div>
          {speakers.length > 0 && (
            <>
              {speakers.map((sp, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <ColorDot
                    value={sp.color}
                    onChange={(color) => setTrack((t) => ({ ...t, speakers: t.speakers?.map((x, j) => (j === i ? { ...x, color } : x)) }))}
                  />
                  <input
                    className="field h-7 min-w-0 flex-1 text-xs"
                    value={sp.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      setTrack((t) => ({ ...t, speakers: t.speakers?.map((x, j) => (j === i ? { ...x, name } : x)) }));
                    }}
                  />
                  <span className="w-10 text-right text-[10px] text-faint">{t('{n} leg.', { n: track.captions.filter((c) => c.speaker === i).length })}</span>
                </div>
              ))}
              <SwitchRow
                checked={!!style.speakerNames}
                onChange={(speakerNames) => setStyle({ speakerNames })}
                label={t('Mostrar o nome acima da legenda')}
              />
              <SpeakerNames project={project} track={track} onChange={onChange} notify={notify} />
              <button
                className="text-[11px] text-faint hover:text-danger"
                onClick={() =>
                  setTrack((t) => ({
                    ...t,
                    speakers: undefined,
                    captions: t.captions.map(({ speaker: _s, ...c }) => ({ ...c, words: c.words?.map(({ speaker: _w, ...w }) => w) })),
                  }))
                }
              >
                {t('Voltar a uma cor só')}
              </button>
            </>
          )}
        </div>

        {/* Lista */}
        <SectionTitle extra={<span className="text-[11px] text-faint">{track.captions.length}</span>}>{t('Texto')}</SectionTitle>
        {fast > 0 && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-amber/40 bg-amber/10 px-2 py-1.5 text-[11px] text-amber">
            <Gauge size={13} className="shrink-0" />
            <span className="flex-1">{t('{n} legenda(s) rápida(s) demais para ler.', { n: fast })}</span>
            <button className="rounded px-1.5 py-0.5 font-medium hover:bg-amber/20" onClick={() => setTrack(giveAllReadingTime)}>
              {t('Ajustar todas')}
            </button>
          </div>
        )}
        {track.captions.length === 0 && (
          <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-xs text-faint">
            {t('Gere automaticamente, importe um .srt ou crie uma nova no cursor.')}
          </p>
        )}
        <div ref={listRef} className="space-y-1.5">
          {track.captions.map((c) => (
            <div
              key={c.id}
              data-caption={c.id}
              className={cx('rounded-lg border p-2 transition-colors', active?.id === c.id ? 'border-accent bg-accent/10' : 'border-line bg-panel-2')}
            >
              <div className="mb-1 flex items-center gap-1">
                {speakers.length > 0 && (
                  <button
                    title={t('{name} · clique para trocar a pessoa', { name: speakers[c.speaker ?? 0]?.name ?? '' })}
                    className="size-3 shrink-0 rounded-full ring-1 ring-white/30"
                    style={{ background: speakers[c.speaker ?? 0]?.color }}
                    onClick={() => {
                      const speaker = ((c.speaker ?? 0) + 1) % speakers.length;
                      setCaption(c.id, { speaker, words: c.words?.map((w) => ({ ...w, speaker })) });
                    }}
                  />
                )}
                <button onClick={() => onSeek(c.start + 0.01)} className="font-mono text-[10px] text-faint hover:text-accent" title={t('Ir para esta legenda')}>
                  {formatTime(c.start)} → {formatTime(c.end)}
                </button>
                <span className="flex-1" />
                {readingSpeed(c) > READING_LIMIT && (
                  <button
                    title={t('Rápida demais para ler ({n} caracteres por segundo; o confortável é até {limit}). Clique para dar mais tempo de tela, pela pausa antes ou depois da fala. Se não houver pausa, encurte o texto.', { n: Math.round(readingSpeed(c)), limit: READING_LIMIT })}
                    onClick={() => setTrack((t) => giveReadingTime(t, c.id))}
                    className="flex items-center gap-0.5 rounded px-1 text-[10px] text-amber hover:bg-amber/15"
                  >
                    <Gauge size={11} />
                    {t('{n} car/s', { n: Math.round(readingSpeed(c)) })}
                  </button>
                )}
                <button
                  title={t('Começar no cursor')}
                  onClick={() => setCaption(c.id, { start: Math.min(time, c.end - 0.1), words: undefined })}
                  className="rounded px-1 text-[10px] text-faint hover:bg-panel-3 hover:text-fg"
                >
                  ⇤
                </button>
                <button
                  title={t('Terminar no cursor')}
                  onClick={() => setCaption(c.id, { end: Math.max(time, c.start + 0.1), words: undefined })}
                  className="rounded px-1 text-[10px] text-faint hover:bg-panel-3 hover:text-fg"
                >
                  ⇥
                </button>
                <IconButton
                  label={t('Apagar legenda')}
                  className="size-5 hover:!text-danger"
                  onClick={() => setTrack((t) => ({ ...t, captions: t.captions.filter((x) => x.id !== c.id) }))}
                >
                  <X size={12} />
                </IconButton>
              </div>
              <textarea
                value={c.text}
                rows={Math.min(3, Math.ceil(c.text.length / 34) || 1)}
                onChange={(e) => {
                  // As palavras que não mudaram continuam no tempo em que são faladas.
                  const next = retext(c, e.target.value);
                  setCaption(c.id, { text: next.text, words: next.words });
                }}
                className="w-full resize-none bg-transparent text-xs leading-snug outline-none"
              />
            </div>
          ))}
        </div>
        {track.captions.length > 0 && (
          <Button
            variant="danger"
            icon={<Trash size={13} />}
            className="mt-3 w-full text-xs"
            onClick={() => confirm(t('Apagar todas as legendas?')) && setTrack((t) => ({ ...t, captions: [] }))}
          >
            {t('Apagar todas')}
          </Button>
        )}
      </div>
    </>
  );
}

function Range(props: { label: string; value: number; display: string; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-dim">{props.label}</span>
        <span className="font-mono text-[11px]">{props.display}</span>
      </div>
      <Slider label={props.label} value={props.value} min={props.min} max={props.max} step={props.step} onChange={props.onChange} />
    </div>
  );
}

function ColorDot({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="relative size-6 cursor-pointer rounded-md ring-1 ring-white/20" style={{ background: value }}>
      <input type="color" className="sr-only" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** Miniatura do estilo: uma legenda de exemplo com a 2ª palavra "sendo falada". */
function CaptionThumb({ presetId }: { presetId: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const version = useSyncExternalStore(previewStore.subscribe, previewStore.getVersion);
  const style = useMemo(() => captionStyle(presetId), [presetId]);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    let cancelled = false;
    void loadFonts().then(() => {
      if (cancelled) return;
      ctx.drawImage(sampleImage('pessoa'), 0, 0, 256, 144);
      const text = t('sua legenda aqui');
      const times = [[0, 0.5], [0.5, 1.2], [1.2, 2]];
      const caption: Caption = {
        id: 'x',
        start: 0,
        end: 3,
        text,
        words: text.split(' ').map((word, i) => ({ text: word, start: times[i]?.[0] ?? 2, end: times[i]?.[1] ?? 2 })),
      };
      drawCaption(ctx, { ...style, size: Math.max(style.size, 0.07) }, caption, 0.9, 256, 144);
    });
    return () => {
      cancelled = true;
    };
  }, [style, version]);
  return <canvas ref={ref} width={256} height={144} className="size-full" />;
}
