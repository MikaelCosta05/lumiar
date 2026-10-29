// Estabilizar vídeo tremido (menu do clique direito num clipe de vídeo).
export default {
  'Estabilizar vídeo (tirar o tremido)': 'Stabilize video (remove shake)',
  'estabilizar|Suave': 'Light',
  'estabilizar|Média': 'Medium',
  'estabilizar|Forte': 'Strong',
  'Remover estabilização': 'Remove stabilization',
  'Estabilização removida.': 'Stabilization removed.',
  'Medindo o tremido da câmera… {n}%': 'Measuring camera shake… {n}%',
  'Não foi possível ler os quadros deste vídeo.': 'Couldn\'t read the frames of this video.',
  'A imagem tem poucos detalhes para medir o movimento (muito escura, lisa ou mudando de cena). A estabilização não foi aplicada.':
    'The image has too little detail to measure the motion (too dark, too plain or changing scenes). Stabilization was not applied.',
  'Vídeo estabilizado. O tremido é forte: o zoom ficou no máximo ({zoom}×) e parte dele continua.':
    'Video stabilized. The shake is strong: the zoom is at its maximum ({zoom}×) and some of it remains.',
  'Vídeo estabilizado, com zoom de {zoom}× para esconder as bordas.': 'Video stabilized, with a {zoom}× zoom to hide the edges.',
} satisfies Record<string, string>;
