// Opções de geração do Whisper (num arquivo só, para o worker e a avaliação de precisão usarem as mesmas).

export const WHISPER_OPTIONS = {
  return_timestamps: 'word' as const,
  // Contra o Whisper "travado" repetindo ("do do do do…" ou a mesma frase sem parar até o limite, o que
  // levava minutos por trecho): a mesma sequência de 6 pedaços de palavra não pode aparecer duas vezes,
  // e 30 s de fala rápida cabem com folga em 224.
  no_repeat_ngram_size: 6,
  max_new_tokens: 224,
};
