// Efectos y transiciones con la persona, la profundidad y el terror analógico: nombre, descripción y controles.
// (Las etiquetas que ya existen en otros archivos, como "Brilho da borda" y "Suavidade", quedan allí.)
export default {
  // pessoa-invisivel
  'Pessoa invisível': 'Persona invisible',
  'O corpo vira vidro: dá para ver o fundo através da pessoa, torto como numa lente, com a borda cintilando de leve (a IA encontra a pessoa e o que está atrás dela).':
    'El cuerpo se vuelve de vidrio: se ve el fondo a través de la persona, torcido como en una lente, con el borde centelleando apenas (la IA encuentra a la persona y lo que hay detrás).',
  'Invisibilidade': 'Invisibilidad',
  'Distorção do vidro': 'Distorsión del vidrio',
  'Cintilação': 'Centelleo',
  // olhos-brilhando
  'Olhos brilhando': 'Ojos brillantes',
  'Os olhos acendem como os de um bicho no escuro, ou ficam totalmente pretos. Marque onde estão os dois olhos (os pacotes usam o seguir rosto, que deixa o rosto no centro).':
    'Los ojos se encienden como los de un animal en la oscuridad, o se vuelven totalmente negros. Marca dónde están los dos ojos (los paquetes usan el seguimiento de rostro, que deja la cara en el centro).',
  'Modo (0 = brilhando, 1 = totalmente pretos)': 'Modo (0 = brillantes, 1 = totalmente negros)',
  'Olho da esquerda': 'Ojo de la izquierda',
  'Olho da direita': 'Ojo de la derecha',
  'Tamanho dos olhos': 'Tamaño de los ojos',
  'Brilho em volta': 'Brillo alrededor',
  // quadro-subliminar
  'Quadro subliminar': 'Fotograma subliminal',
  'De vez em quando, um quadro diferente pisca por um instante: negativo, contraste estourado, imagem de cabeça para baixo ou o rosto bem de perto. Quase não dá para ver, mas dá para sentir.':
    'De vez en cuando, un fotograma distinto parpadea por un instante: negativo, contraste quemado, la imagen al revés o la cara muy de cerca. Casi no se ve, pero se siente.',
  'Piscadas por segundo': 'Parpadeos por segundo',
  'Primeira piscada (s)': 'Primer parpadeo (s)',
  'Irregularidade': 'Irregularidad',
  'Duração (quadros)': 'Duración (fotogramas)',
  'Tipo (0 = sorteado · 1 negativo · 2 contraste · 3 de cabeça para baixo · 4 de perto)':
    'Tipo (0 = al azar · 1 negativo · 2 contraste · 3 al revés · 4 de cerca)',
  'Onde aproximar (rosto)': 'Dónde acercar (cara)',
  'Quanto aproximar': 'Cuánto acercar',
  'Chiado no quadro': 'Ruido en el fotograma',
  // sombra-atrasada
  'Sombra atrasada': 'Sombra retrasada',
  'A sombra da pessoa aparece na parede atrás dela, mas não acompanha direito: se mexe um pouco depois, como se tivesse vontade própria. Funciona tocando.':
    'La sombra de la persona aparece en la pared detrás de ella, pero no la sigue bien: se mueve un poco después, como si tuviera voluntad propia. Funciona al reproducir.',
  'Atraso (s)': 'Retraso (s)',
  'Deslocar para o lado': 'Desplazar hacia el lado',
  'Deslocar para cima': 'Desplazar hacia arriba',
  'Escuridão': 'Oscuridad',
  'Sombra difusa': 'Sombra difusa',
  'Cor da sombra': 'Color de la sombra',
  // tela-de-teste
  'Tela de teste da TV': 'Carta de ajuste de la TV',
  'As barras coloridas de fim de transmissão e a tela de "sem sinal" com chiado entram e saem por cima da imagem, como TV trocando de canal sozinha.':
    'Las barras de colores del fin de emisión y la pantalla de "sin señal" con ruido entran y salen sobre la imagen, como una TV que cambia de canal sola.',
  'Mistura': 'Mezcla',
  'Interferência': 'Interferencia',
  'Entrar e sair sozinho (0 = sempre na tela)': 'Entrar y salir solo (0 = siempre en pantalla)',
  'Trocas por segundo': 'Cambios por segundo',
  'Quanto tempo no chiado': 'Tiempo en el ruido',
  // pintura-que-se-mexe
  'Pintura que se mexe': 'Pintura que se mueve',
  'O vídeo vira uma pintura de pinceladas grossas e redemoinhos, à moda dos pós-impressionistas. As pinceladas seguem o movimento da cena e a tinta parece viva.':
    'El video se vuelve una pintura de pinceladas gruesas y remolinos, al estilo de los posimpresionistas. Las pinceladas siguen el movimiento de la escena y la pintura parece viva.',
  'Tamanho da pincelada': 'Tamaño de la pincelada',
  'Seguir o movimento': 'Seguir el movimiento',
  'Redemoinhos': 'Remolinos',
  'Cores vivas': 'Colores vivos',
  'Relevo da tinta': 'Relieve de la pintura',
  // luz-de-estudio
  'Luz de estúdio': 'Luz de estudio',
  'Ilumina a pessoa de novo, depois de gravado: escolha de que lado vem a luz, a cor, a força e se ela é dura ou suave. A IA estima o volume do rosto pela profundidade.':
    'Vuelve a iluminar a la persona después de grabar: elige de qué lado viene la luz, el color, la fuerza y si es dura o suave. La IA estima el volumen de la cara por la profundidad.',
  'De onde vem a luz (graus)': 'De dónde viene la luz (grados)',
  'Altura da luz': 'Altura de la luz',
  'Força da luz': 'Fuerza de la luz',
  'Escurecer o outro lado': 'Oscurecer el otro lado',
  'Escurecer o fundo': 'Oscurecer el fondo',
  'Só na pessoa': 'Solo en la persona',
  // passar-pela-pessoa
  'Passar pela pessoa': 'A través de la persona',
  'A pessoa do clipe atual vira uma janela para o próximo: o corpo dela varre a tela e deixa o próximo clipe por onde passa (a IA encontra a pessoa).':
    'La persona del clip actual se vuelve una ventana al siguiente: su cuerpo barre la pantalla y deja el siguiente clip por donde pasa (la IA encuentra a la persona).',
  'Direção (0 = para a direita, 1 = para a esquerda)': 'Dirección (0 = hacia la derecha, 1 = hacia la izquierda)',
  'Abrir para cima e para baixo': 'Abrir hacia arriba y hacia abajo',
  // por-profundidade
  'Por profundidade': 'Por profundidad',
  'O próximo clipe aparece primeiro no fundo, no que está mais longe, e vem avançando até a frente, como uma névoa que atravessa a cena (a IA calcula a profundidade).':
    'El siguiente clip aparece primero en el fondo, en lo que está más lejos, y va avanzando hasta el frente, como una niebla que atraviesa la escena (la IA calcula la profundidad).',
  'Sentido (0 = do fundo para a frente, 1 = da frente para o fundo)': 'Sentido (0 = del fondo al frente, 1 = del frente al fondo)',
  'Cor da frente': 'Color del frente',
  'Brilho da frente': 'Brillo del frente',
  // fita-rebobinando
  'Fita rebobinando': 'Cinta rebobinando',
  'O videocassete volta a fita cada vez mais rápido: a imagem rola, treme e se rasga em faixas de tracking, e no meio do chiado já entra o próximo clipe.':
    'El video rebobina la cinta cada vez más rápido: la imagen se desliza, tiembla y se rasga en franjas de tracking, y en medio del ruido ya entra el siguiente clip.',
  'Faixas de tracking': 'Franjas de tracking',
  'Mostrar o ◀◀ na tela': 'Mostrar ◀◀ en pantalla',
  // queda-de-sinal
  'Queda de sinal': 'Caída de señal',
  'Como TV digital com sinal fraco: a imagem trava, se desmancha em quadradinhos borrados e de cor errada, e quando o sinal volta já está no próximo clipe.':
    'Como la TV digital con señal débil: la imagen se congela, se deshace en cuadraditos borrosos y de color equivocado, y cuando vuelve la señal ya está en el siguiente clip.',
  'Tamanho dos blocos (px)': 'Tamaño de los bloques (px)',
  'Quantidade de defeitos': 'Cantidad de fallos',
  'Blocos de cor errada': 'Bloques de color equivocado',
  'Travar a imagem antes': 'Congelar la imagen antes',
  // entrar-pelo-olho
  'Entrar pelo olho': 'Entrar por el ojo',
  'A câmera mergulha num olho até a pupila escura tomar a tela, e o próximo clipe se abre de dentro dela, como uma íris. Marque o olho (os pacotes usam o seguir rosto).':
    'La cámara se zambulle en un ojo hasta que la pupila oscura llena la pantalla, y el siguiente clip se abre desde dentro, como un iris. Marca el ojo (los paquetes usan el seguimiento de rostro).',
  'Onde está o olho': 'Dónde está el ojo',
  'Cor da íris': 'Color del iris',
  'Íris na abertura': 'Iris en la apertura',
} satisfies Record<string, string>;
