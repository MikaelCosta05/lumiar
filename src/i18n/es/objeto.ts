// Selecionar qualquer objeto com um clique (menu do clipe, painel "Recorte", efeitos e mensagens do worker de IA).
export default {
  'Selecionar objeto…': 'Seleccionar objeto…',
  'o modelo de seleção de objetos': 'el modelo de selección de objetos',
  'Analisando o quadro': 'Analizando el fotograma',
  'A imagem ainda não carregou. Tente de novo.': 'La imagen aún no se ha cargado. Inténtalo de nuevo.',
  'Cancelado.': 'Cancelado.',
  'Seguindo o objeto no clipe… {n}%': 'Siguiendo el objeto en el clip… {n}%',
  'Não foi possível ler esse quadro: {error}': 'No se pudo leer ese fotograma: {error}',
  'A IA não conseguiu selecionar: {error}': 'La IA no pudo hacer la selección: {error}',
  'Objeto selecionado ({n} quadro(s)). Os efeitos de pessoa deste clipe agora usam o objeto: fundo, contorno, recorte, texto atrás… Troque em Recorte, no painel do clipe.':
    'Objeto seleccionado ({n} fotograma(s)). Los efectos de persona de este clip ahora usan el objeto: fondo, contorno, recorte, texto detrás… Cámbialo en Recorte, en el panel del clip.',
  'Seleção de objeto cancelada.': 'Selección de objeto cancelada.',
  'Abrindo o quadro…': 'Abriendo el fotograma…',
  'Seguindo o objeto pelo clipe…': 'Siguiendo el objeto por el clip…',
  '{n} ponto(s) · clique marca o objeto, botão direito marca o que não é': '{n} punto(s) · el clic marca el objeto, el clic derecho marca lo que no es',
  'Clique no objeto que você quer selecionar': 'Haz clic en el objeto que quieres seleccionar',
  'Desfazer ponto': 'Deshacer punto',
  Aplicar: 'Aplicar',
  'recorte|Recorte': 'Recorte',
  'Pessoa (automático)': 'Persona (automático)',
  'A IA encontra a pessoa em cada quadro': 'La IA encuentra a la persona en cada fotograma',
  'Objeto selecionado': 'Objeto seleccionado',
  'Um objeto que você escolhe com cliques': 'Un objeto que eliges con clics',
  'Selecionar de novo…': 'Seleccionar de nuevo…',
  'Apagar a seleção': 'Borrar la selección',
  'Vale para tudo que usa a pessoa: o fundo acima, contorno, recortar, texto atrás e os efeitos "Desfocar o objeto" e "Apagar o objeto".':
    'Vale para todo lo que usa a la persona: el fondo de arriba, contorno, recortar, texto detrás y los efectos "Desenfocar el objeto" y "Borrar el objeto".',
  // Efeitos que usam o objeto selecionado
  'Desfocar o objeto': 'Desenfocar el objeto',
  'Desfoca ou pixela exatamente o objeto escolhido, seguindo ele pelo clipe: clique direito no clipe → Selecionar objeto…. Sem objeto selecionado, vale para a pessoa.':
    'Desenfoca o pixela exactamente el objeto elegido, siguiéndolo por el clip: clic derecho en el clip → Seleccionar objeto…. Sin objeto seleccionado, vale para la persona.',
  'Margem em volta do objeto': 'Margen alrededor del objeto',
  'Apagar o objeto': 'Borrar el objeto',
  'Some com o objeto escolhido (clique direito no clipe → Selecionar objeto…): o lugar dele é preenchido com as cores de volta, quadro a quadro, mesmo quando ele se mexe. Funciona melhor com objetos pequenos em fundo simples.':
    'Elimina el objeto elegido (clic derecho en el clip → Seleccionar objeto…): su lugar se rellena con los colores de alrededor, fotograma a fotograma, incluso cuando se mueve. Funciona mejor con objetos pequeños sobre un fondo simple.',
} satisfies Record<string, string>;
