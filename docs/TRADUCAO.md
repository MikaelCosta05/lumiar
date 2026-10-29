# Traduzindo o Lumiar

A interface existe em português (o original), inglês e espanhol. O código fica em [`src/i18n/`](../src/i18n/).

## Como funciona

O texto em português é a própria chave:

```ts
import { t } from '../i18n';

t('Salvar projeto')                       // "Save project" em inglês
t('{n} clipe(s) excluído(s).', { n: 3 })  // os {nomes} são preenchidos depois de traduzir
```

Se uma tradução faltar, aparece o português, então nada some da tela.

Os dicionários ficam em `src/i18n/en/` e `src/i18n/es/`, um arquivo por área (o mesmo nome nas duas pastas):

```ts
export default {
  'Salvar projeto': 'Save project',
} satisfies Record<string, string>;
```

Só o dicionário do idioma escolhido é carregado, antes de abrir o editor (`loadLanguage` em `main.tsx`). Por isso
`t()` também funciona no topo de um módulo (nomes de pacotes, formatos…). Trocar o idioma recarrega a página.

## Regras

- **Só texto que a pessoa lê.** Não traduza ids, categorias usadas para agrupar ou comparar, chaves do `localStorage`,
  nomes de arquivo, valores salvos no projeto que o código compara depois. Categorias (de pacotes, efeitos, stickers,
  sons) continuam em português no código e são traduzidas **na hora de mostrar**: `t(categoria)`.
- **Texto com valores**: troque a template string por `{nomes}`: `` `${n} itens` `` vira `t('{n} itens', { n })`.
  A tradução usa os mesmos nomes, na ordem que o idioma pedir.
- **Frase com marcação no meio** (`<b>`, ícones): traduza cada pedaço que faz sentido sozinho, ou reescreva a frase
  para que os pedaços façam sentido. Não junte HTML dentro da chave.
- **Mesmo texto, sentidos diferentes** ("Recortar" um clipe × "Recortar" a pessoa do fundo): use
  `tc('contexto', 'Recortar')`. No dicionário a chave fica `'contexto|Recortar'`; em português aparece só "Recortar".
  O teste avisa quando o mesmo texto tem traduções diferentes em dois dicionários (só uma valeria).
- **Atalhos**: use `keys('Ctrl+S')` (de `src/i18n/keys.ts`), que mostra ⌘ no Mac: `t('Salvar ({keys})', { keys: keys('Ctrl+S') })`.
  Para uma ação que tem atalho no registro (`src/app/shortcuts.ts`, que a pessoa pode mudar), use o atalho atual:
  `shortcutLabel('save')` ou `withShortcut(t('Salvar projeto'), 'save')`.
- **Datas e números**: `toLocaleString(locale())` no lugar de `'pt-BR'`.
- **Workers** (`*.worker.ts`) não têm dicionário: traduza onde a mensagem aparece, não dentro do worker.
- **Lógica de idioma** (como as palavras de hesitação em `fillers.ts`, que reconhecem a fala em português) não é texto
  de interface: fica como está.
- O teste `npx vitest run src/i18n` mostra, arquivo por arquivo, os `t('…')` que ainda não estão nos dicionários.

## Glossário

| Português | English | Español |
|---|---|---|
| Projeto | Project | Proyecto |
| Linha do tempo / timeline | Timeline | Línea de tiempo |
| Trilha (principal) | (Main) track | Pista (principal) |
| Clipe | Clip | Clip |
| Clipe composto | Compound clip | Clip compuesto |
| Sobreposição / camada | Overlay / layer | Superposición / capa |
| Mídia(s) | Media | Medios |
| Filtro / Efeito / Transição | Filter / Effect / Transition | Filtro / Efecto / Transición |
| Pacote (de edição) | (Edit) pack | Paquete (de edición) |
| Meus pacotes / Meus efeitos | My packs / My effects | Mis paquetes / Mis efectos |
| Sticker | Sticker | Sticker |
| Legenda(s) | Caption(s) | Subtítulo(s) |
| Narração / Dublagem | Voiceover / Dubbing | Narración / Doblaje |
| Voz sintética | Synthetic voice | Voz sintética |
| Marcador | Marker | Marcador |
| Quadro | Frame | Fotograma |
| Câmera lenta | Slow motion | Cámara lenta |
| Keyframe | Keyframe | Fotograma clave |
| Prévia leve | Proxy preview | Vista previa ligera |
| Salvamento automático | Autosave | Guardado automático |
| Cópia de segurança | Backup | Copia de seguridad |
| Kit da marca | Brand kit | Kit de marca |
| Imagens de apoio | B-roll | Imágenes de apoyo |
| Gancho de abertura | Opening hook | Gancho de apertura |
| Ferramentas | Tools | Herramientas |
| Exportar | Export | Exportar |
| Gravar a tela | Record screen | Grabar la pantalla |
| Efeitos sonoros | Sound effects | Efectos de sonido |

Inglês americano, frases curtas e diretas, como no original. Espanhol neutro (sem voseo nem regionalismos), tratando
por "tú".
