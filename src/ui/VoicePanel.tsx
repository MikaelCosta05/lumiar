import { AudioLines, Clapperboard, Headphones, LoaderCircle, Mic, ScrollText, Sparkles, Square, Languages } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { VOICES } from '../media/speech';
import { findOverlayClip, getMedia, type AudioTrackKind, type Project } from '../project/model';
import { formatTime } from './format';
import { Button, cx, Segmented, Slider, Switch } from './kit';
import { MicPicker } from './MicPicker';
import { getVoicePrefs, setVoicePrefs, useVoicePrefs } from './voicePrefs';
import type { Selection } from './selection';
import { t } from '../i18n';

/** Gravação em andamento (contagem regressiva ou gravando). */
export interface VoiceSession {
  mode: 'narration' | 'dub';
  phase: 'countdown' | 'recording';
  countdown: number;
  elapsed: number;
  level: number;
}

export interface RecordOptions {
  deviceId?: string;
  countdown: boolean;
  muteProject: boolean;
  prompter: boolean;
  /** Palavras por minuto do teleprompter */
  prompterSpeed: number;
  /** O roteiro só rola enquanto a pessoa fala */
  prompterFollow: boolean;
  /** Dublagem: grava exatamente no trecho deste clipe */
  dub?: { kind: 'clip' | 'overlay'; id: string };
  muteOriginal: boolean;
}

export type VoicePanelProps = Omit<Props, 'project'>;

interface Props {
  project: Project;
  selection: Selection;
  session: VoiceSession | null;
  speaking: string | null;
  onRecord: (options: RecordOptions) => void;
  onStop: () => void;
  onSpeak: (text: string, voice: string) => void;
  onSpeakCaptions: (voice: string) => void;
  /** Traduz a fala para o inglês e dubla o vídeo com a voz sintética */
  onDubEnglish: () => void;
  onChange: (update: (project: Project) => Project) => void;
}

/** Opções salvas no painel, para gravar pelo botão da timeline (R) ou pelo menu do clipe. */
export function savedRecordOptions(): RecordOptions {
  const p = getVoicePrefs();
  return {
    deviceId: p.deviceId || undefined,
    countdown: p.countdown,
    muteProject: p.muteProject,
    prompter: p.prompter,
    prompterSpeed: p.prompterSpeed,
    prompterFollow: p.prompterFollow,
    muteOriginal: p.muteOriginal,
  };
}

export function VoicePanel({ project, selection, session, speaking, onRecord, onStop, onSpeak, onSpeakCaptions, onDubEnglish, onChange }: Props) {
  const prefs = useVoicePrefs();
  const set = setVoicePrefs;
  const [text, setText] = useState('');
  // Clipe de vídeo selecionado (para dublar).
  const dubTarget =
    selection?.kind === 'clip'
      ? project.clips.find((c) => c.id === selection.id)
      : selection?.kind === 'overlay'
        ? findOverlayClip(project, selection.id)?.clip
        : undefined;
  const dubMedia = dubTarget && getMedia(project, dubTarget.mediaId);
  const canDub = !!dubMedia && dubMedia.kind === 'video' && (selection?.kind === 'clip' || selection?.kind === 'overlay');

  const record = (dub: boolean) =>
    onRecord({
      deviceId: prefs.deviceId || undefined,
      countdown: prefs.countdown,
      muteProject: prefs.muteProject,
      prompter: prefs.prompter,
      prompterSpeed: prefs.prompterSpeed,
      prompterFollow: prefs.prompterFollow,
      dub: dub && canDub ? { kind: selection!.kind as 'clip' | 'overlay', id: selection!.id } : undefined,
      muteOriginal: prefs.muteOriginal,
    });

  const captions = project.captions?.captions ?? [];

  return (
    <>
      <div className="flex items-center gap-2 px-4 pb-3 pt-4">
        <h2 className="text-[15px] font-semibold">{t('Voz')}</h2>
        <span className="text-xs text-faint">{t('narração e dublagem')}</span>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4">
        {/* ---------------- Gravar */}
        <Card icon={<Mic size={13} className="text-danger" />} title={t('Gravar com o microfone')}>
          {session ? (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="size-2 animate-pulse rounded-full bg-danger" />
                <span className="text-xs font-medium">
                  {session.phase === 'countdown'
                    ? t('Começa em {n}…', { n: session.countdown })
                    : `${session.mode === 'dub' ? t('Dublando') : t('Gravando')} · ${formatTime(session.elapsed).replace(/\.\d+$/, '')}`}
                </span>
              </div>
              <LevelMeter level={session.level} />
              <Button variant="danger" icon={<Square size={12} fill="currentColor" />} className="w-full border border-danger/40" onClick={onStop}>
                {t('Parar e salvar')}
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-2 rounded-lg border border-line bg-panel/60 p-2">
                <MicPicker />
              </div>
              <Toggle label={t('Contagem regressiva (3 s)')} checked={prefs.countdown} onChange={(countdown) => set({ countdown })} />
              <Toggle label={t('Mostrar o roteiro na tela (teleprompter)')} checked={prefs.prompter} onChange={(prompter) => set({ prompter })} />
              <Toggle
                label={t('Silenciar o projeto enquanto grava')}
                hint={t('Evita que o som do vídeo vaze para o microfone (sem fones).')}
                checked={prefs.muteProject}
                onChange={(muteProject) => set({ muteProject })}
              />
              <Button variant="primary" icon={<Mic size={14} />} className="mt-2 w-full" onClick={() => record(false)}>
                {t('Gravar narração no cursor')}
              </Button>

              <div className="mt-3 rounded-lg border border-line bg-panel/60 p-2.5">
                <p className="flex items-center gap-1.5 text-xs font-medium">
                  <Clapperboard size={13} className="text-accent" /> {t('Dublar um clipe')}
                </p>
                <p className="mt-1 text-[11px] leading-snug text-faint">
                  {canDub
                    ? t('Grava exatamente durante "{name}" e para sozinho no fim.', { name: dubMedia!.name })
                    : t('Selecione um clipe de vídeo na timeline para gravar a voz em cima dele, no tempo certo.')}
                </p>
                <Toggle label={t('Silenciar o áudio original')} checked={prefs.muteOriginal} onChange={(muteOriginal) => set({ muteOriginal })} />
                <Button variant="secondary" icon={<Clapperboard size={14} />} className="mt-1.5 w-full" disabled={!canDub} onClick={() => record(true)}>
                  {t('Dublar o clipe selecionado')}
                </Button>
              </div>
            </>
          )}
        </Card>

        {/* ---------------- Roteiro */}
        <Card icon={<ScrollText size={13} className="text-amber" />} title={t('Roteiro (teleprompter)')}>
          <textarea
            className="field h-auto min-h-24 w-full resize-y py-2 text-xs leading-relaxed"
            placeholder={t('Escreva aqui o que vai falar. Ele rola na tela durante a gravação.')}
            value={project.script ?? ''}
            onChange={(e) => {
              const script = e.target.value;
              onChange((p) => ({ ...p, script }));
            }}
          />
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-dim">
            <span>{t('Velocidade da leitura')}</span>
            <span className="font-mono">{t('{n} palavras/min', { n: prefs.prompterSpeed })}</span>
          </div>
          <Slider label={t('Velocidade da leitura')} value={prefs.prompterSpeed} min={60} max={260} step={5} onChange={(prompterSpeed) => set({ prompterSpeed })} />
          <Toggle
            label={t('Acompanhar a minha voz')}
            hint={t('O texto só rola enquanto você fala: parou para respirar ou pensar, ele espera.')}
            checked={prefs.prompterFollow}
            onChange={(prompterFollow) => set({ prompterFollow })}
          />
          <Button
            variant="ghost"
            icon={<Sparkles size={13} />}
            className="mt-1 h-7 w-full text-xs"
            disabled={!project.script?.trim() || !!speaking}
            onClick={() => onSpeak(project.script, prefs.voice)}
          >
            {t('Ler o roteiro com voz sintética')}
          </Button>
        </Card>

        {/* ---------------- Voz sintética */}
        <Card icon={<Sparkles size={13} className="text-accent-2" />} title={t('Voz sintética (texto → fala)')}>
          <p className="mb-2 text-[11px] leading-snug text-faint">{t('Gerada no seu computador, sem internet. Boa para rascunhos, tutoriais e para dublar legendas.')}</p>
          <Segmented options={VOICES.map((v) => ({ value: v.id, label: v.label }))} value={prefs.voice} onChange={(voice) => set({ voice })} />
          <textarea
            className="field mt-2 h-auto min-h-20 w-full resize-y py-2 text-xs leading-relaxed"
            placeholder={t('Digite o texto que a voz vai falar…')}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {speaking ? (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-dim">
              <LoaderCircle size={12} className="animate-spin text-accent" />
              {speaking}
            </p>
          ) : (
            <div className="mt-2 grid gap-1.5">
              <Button variant="primary" icon={<AudioLines size={14} />} disabled={!text.trim()} onClick={() => onSpeak(text, prefs.voice)}>
                {t('Gerar e pôr no cursor')}
              </Button>
              <Button variant="secondary" icon={<Clapperboard size={14} />} disabled={captions.length === 0} onClick={() => onSpeakCaptions(prefs.voice)}>
                {captions.length ? t('Dublar as {n} legendas', { n: captions.length }) : t('Dublar as legendas (crie legendas antes)')}
              </Button>
              <Button
                variant="secondary"
                icon={<Languages size={14} />}
                onClick={onDubEnglish}
                title={t('Ouve a fala do vídeo (em qualquer idioma), traduz para o inglês e cria a dublagem com a voz sintética, no tempo de cada frase')}
              >
                {t('Dublar o vídeo em inglês')}
              </Button>
            </div>
          )}
        </Card>

        {/* ---------------- Música e voz */}
        <Card icon={<Headphones size={13} className="text-teal-300" />} title={t('Música abaixa durante a voz')}>
          <div className="flex items-center justify-between text-[11px] text-dim">
            <span>{t('Volume da música enquanto alguém fala')}</span>
            <span className="font-mono">{Math.round((project.duckLevel ?? 0.3) * 100)}%</span>
          </div>
          <Slider
            label={t('Volume da música durante a voz')}
            value={project.duckLevel ?? 0.3}
            min={0}
            max={1}
            step={0.01}
            onChange={(duckLevel) => onChange((p) => ({ ...p, duckLevel }))}
          />
          <p className="mb-1.5 mt-2 text-[11px] text-faint">{t('O que cada trilha de áudio tem:')}</p>
          <div className="space-y-1.5">
            {project.audioTracks.map((track) => (
              <div key={track.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs">{track.name}</span>
                <div className="w-40 shrink-0">
                  <Segmented
                    options={[
                      { value: 'other', label: t('Outro') },
                      { value: 'music', label: t('Música') },
                      { value: 'voice', label: t('Voz') },
                    ]}
                    value={track.kind ?? 'other'}
                    onChange={(kind) =>
                      onChange((p) => ({
                        ...p,
                        audioTracks: p.audioTracks.map((t) => (t.id === track.id ? { ...t, kind: kind as AudioTrackKind } : t)),
                      }))
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-panel-2/60 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
        {icon}
        {title}
      </p>
      {children}
    </section>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="py-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-dim">{label}</span>
        <Switch checked={checked} label={label} onChange={onChange} />
      </div>
      {hint && checked && <p className="text-[10px] leading-snug text-faint">{hint}</p>}
    </div>
  );
}

/** Barrinha do volume do microfone (verde → amarelo → vermelho). */
function LevelMeter({ level }: { level: number }) {
  return (
    <div className="relative h-2 overflow-hidden rounded-full bg-panel-3">
      <div
        className={cx(
          'h-full rounded-full transition-[width] duration-75',
          level > 0.85 ? 'bg-danger' : level > 0.6 ? 'bg-amber' : 'bg-success',
        )}
        style={{ width: `${Math.round(level * 100)}%` }}
      />
    </div>
  );
}
