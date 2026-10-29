// Galeria da comunidade: procurar e instalar efeitos e pacotes compartilhados por outras pessoas.
export default {
  // Abrir
  'Galeria da comunidade': 'Community gallery',
  'Galeria da comunidade (efeitos e pacotes)…': 'Community gallery (effects and packs)…',
  'Galeria da comunidade: pacotes de outras pessoas': 'Community gallery: packs from other people',
  'Galeria da comunidade: efeitos de outras pessoas': 'Community gallery: effects from other people',

  // Janela
  'Recarregar a galeria': 'Reload the gallery',
  'Endereço da galeria': 'Gallery address',
  'Efeitos e pacotes que outras pessoas compartilharam. Ao instalar, o arquivo é conferido (tamanho e SHA-256) e entra em "Meus efeitos" ou "Meus pacotes", como no botão de importar.':
    'Effects and packs shared by other people. When you install one, the file is checked (size and SHA-256) and goes into "My effects" or "My packs", just like the import button.',
  'Abrindo a galeria…': 'Opening the gallery…',
  'Buscar por nome, autor ou etiqueta…': 'Search by name, author or tag…',
  'Todas as etiquetas': 'All tags',
  'Nada encontrado com esses filtros.': 'Nothing found with these filters.',
  'A galeria ainda está vazia.': 'The gallery is still empty.',
  'Os efeitos são código que roda na placa de vídeo: os da galeria são revisados antes de entrar, e o Lumiar compila cada shader antes de instalar.':
    'Effects are code that runs on the graphics card: the ones in the gallery are reviewed before they get in, and Lumiar compiles each shader before installing it.',
  '{n} item(ns) do índice ficaram de fora por estarem no formato errado.': '{n} item(s) in the index were left out because they are in the wrong format.',
  'por {author}': 'by {author}',
  Instalado: 'Installed',
  'Instalando…': 'Installing…',
  Atualizar: 'Update',
  Instalar: 'Install',

  // Quando não abre
  'A galeria ainda não está no ar': "The gallery isn't online yet",
  'A galeria ainda não está no ar.': "The gallery isn't online yet.",
  'Não há um índice da galeria neste endereço. Confira o endereço nas configurações ou volte para o padrão.':
    "There's no gallery index at this address. Check the address in the settings or go back to the default.",
  'O repositório da comunidade ainda vai ser publicado. Quando estiver no ar, os efeitos e pacotes aparecem aqui. Enquanto isso, dá para ver como ele funciona e como enviar o seu.':
    "The community repository hasn't been published yet. Once it's online, effects and packs will show up here. Meanwhile, you can see how it works and how to submit yours.",
  'A galeria precisa de internet só para abrir e baixar; o que já foi instalado continua funcionando sem ela.':
    'The gallery only needs the internet to open and download; what you already installed keeps working without it.',
  'Tente de novo daqui a pouco. Se estiver usando outro endereço, confira nas configurações.': "Try again in a moment. If you're using another address, check it in the settings.",
  'Tentar de novo': 'Try again',
  'Como funciona a galeria': 'How the gallery works',
  'Sem conexão com a galeria. Confira a internet e tente de novo.': "Can't reach the gallery. Check your internet connection and try again.",
  'A galeria respondeu com erro ({status}). Tente mais tarde.': 'The gallery responded with an error ({status}). Try again later.',
  'O índice da galeria não está no formato do Lumiar.': "The gallery index isn't in Lumiar's format.",
  'A galeria usa um formato mais novo que esta versão do Lumiar. Atualize para ver os itens.': 'The gallery uses a newer format than this version of Lumiar. Update to see the items.',
  'O índice da galeria é grande demais.': 'The gallery index is too large.',

  // Endereço
  'Endereço do índice (index.json)': 'Index address (index.json)',
  'Usar este': 'Use this one',
  'Voltar ao padrão': 'Back to default',
  'Só endereços https. Os arquivos e as prévias precisam estar no mesmo servidor (e, no GitHub, no mesmo repositório) do índice.':
    'Only https addresses. Files and previews must be on the same server (and, on GitHub, in the same repository) as the index.',
  'Endereço inválido.': 'Invalid address.',
  'O endereço precisa começar com https://': 'The address must start with https://',
  'O endereço não pode ter usuário e senha.': "The address can't contain a username and password.",

  // Instalar
  '"{name}" veio com um tamanho diferente do publicado. Tente de novo.': '"{name}" arrived with a different size than the published one. Try again.',
  '"{name}" não confere com o publicado na galeria (SHA-256 diferente). Nada foi instalado.':
    '"{name}" doesn\'t match what was published in the gallery (different SHA-256). Nothing was installed.',
  'O arquivo de "{name}" está fora da galeria.': 'The file for "{name}" is outside the gallery.',
  '"{name}" não está mais na galeria.': '"{name}" is no longer in the gallery.',

  // Itens do índice que ficam de fora
  'item inválido.': 'invalid item.',
  'item sem id (letras minúsculas, números e -).': 'item without an id (lowercase letters, numbers and -).',
  'o tipo precisa ser "effect" ou "pack".': 'the kind must be "effect" or "pack".',
  'falta o nome.': 'the name is missing.',
  'falta o autor.': 'the author is missing.',
  'o idioma não é um texto.': "the language isn't text.",
  'a data não é um texto.': "the date isn't text.",
  'as etiquetas precisam ser uma lista de textos.': 'the tags must be a list of texts.',
  '"contents" precisa ser uma lista de ids.': '"contents" must be a list of ids.',
  'a versão não é um texto.': "the version isn't text.",
  'falta o SHA-256 do arquivo.': "the file's SHA-256 is missing.",
  'falta o tamanho do arquivo.': "the file's size is missing.",
  'o arquivo é grande demais.': 'the file is too large.',
  'falta o arquivo.': 'the file is missing.',
  'o arquivo precisa estar no mesmo repositório do índice (e em https).': 'the file must be in the same repository as the index (and on https).',
  'o arquivo precisa terminar em {ext}.': 'the file must end in {ext}.',
  'a prévia não é um endereço.': "the preview isn't an address.",
  'a prévia precisa estar no mesmo repositório do índice (e em https).': 'the preview must be in the same repository as the index (and on https).',
  'id repetido.': 'repeated id.',
} satisfies Record<string, string>;
