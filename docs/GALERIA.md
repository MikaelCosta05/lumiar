# Galeria da comunidade

A galeria é o lugar para achar efeitos (`.lumiarfx`) e pacotes de edição (`.lumiarpack`) feitos por outras pessoas e
instalar com um clique. Ela abre pelo ícone de loja no topo das abas **Efeitos** e **Pacotes**, ou em
**Ferramentas → Galeria da comunidade**.

Por trás, a galeria é só um repositório público no GitHub: uma pasta por item e um `index.json` com a lista de tudo.
O Lumiar baixa esse índice direto do `raw.githubusercontent.com`, sem servidor nosso no meio. Para entrar um item
novo, alguém abre um pull request; depois da revisão, ele aparece para todo mundo.

> Enquanto o repositório não for publicado, a galeria mostra "A galeria ainda não está no ar". É o esperado.

## Como funciona a instalação

1. O Lumiar baixa o `index.json` (de `https://raw.githubusercontent.com/MikaelCosta05/lumiar-galeria/main/index.json`).
2. Ao clicar em **Instalar**, baixa o arquivo do item e confere o **tamanho** e o **SHA-256** com o que está no índice.
   Se qualquer byte for diferente, nada é instalado.
3. O arquivo passa pela **mesma importação** dos botões de importar: os efeitos são conferidos e compilados (o que não
   compila fica de fora), nenhum efeito é sobrescrito (nome repetido vira "Nome (2)") e os pacotes entram em "Meus
   pacotes" (um pacote de mesmo id é trocado pelo novo, como na importação).
4. O item fica marcado como **Instalado**. Se o arquivo mudar na galeria (outro SHA-256), o botão vira **Atualizar**.

Algumas regras deixam isso seguro:

- **Só https.** O índice, os arquivos e as prévias precisam vir por https. Um efeito é código que roda na placa de
  vídeo: não pode ser trocado no caminho por alguém na mesma rede.
- **Tudo do mesmo repositório.** Os arquivos e as prévias precisam estar no mesmo servidor do índice e, no
  `raw.githubusercontent.com`, no mesmo repositório (`dono/repo`). Assim só aparece o que passou pela revisão do
  repositório, e abrir a galeria não faz o Lumiar buscar imagens em servidores de terceiros (que saberiam quem abriu
  e quando). Um item que aponta para fora é ignorado.
- **Tamanho e SHA-256 obrigatórios.** Item sem eles é ignorado. O limite é 4 MB por arquivo e 2 MB para o índice.
- **Sem cookies e sem referer.** Os downloads não levam nada que identifique a pessoa.

### Usar outro endereço

O ícone de engrenagem na janela da galeria troca o endereço do índice, para testar a sua cópia do repositório ou usar
um espelho (fica guardado neste computador; **Voltar ao padrão** desfaz). Vale qualquer endereço https; as mesmas
regras valem para os arquivos dele. Para testar um fork antes do pull request:

```
https://raw.githubusercontent.com/<seu-usuario>/lumiar-galeria/<sua-branch>/index.json
```

## Criando o repositório da galeria

Só precisa ser feito uma vez, por quem mantém o Lumiar.

1. No GitHub, crie o repositório público **`MikaelCosta05/lumiar-galeria`** (com a branch `main`). Se usar outro
   nome, troque `DEFAULT_INDEX_URL` em [`src/project/gallery.ts`](../src/project/gallery.ts).
2. Copie [`scripts/galeria-index.mjs`](../scripts/galeria-index.mjs) para `scripts/` do repositório da galeria.
3. Crie as pastas `efeitos/` e `pacotes/` (com um item de exemplo, ou um `.gitkeep`), um `README.md` explicando como
   enviar (pode apontar para este arquivo) e uma licença para os itens (sugestão: CC0 ou MIT, dita no README:
   "ao enviar, você concorda em publicar o item sob esta licença").
4. Gere o índice e faça o commit:

   ```bash
   node scripts/galeria-index.mjs .
   git add . && git commit -m "Galeria: primeiro índice" && git push
   ```

5. Abra o Lumiar → Ferramentas → Galeria da comunidade. O `raw.githubusercontent.com` guarda as respostas por
   uns 5 minutos, então um commit novo pode demorar um pouco para aparecer (o botão de recarregar busca de novo).
6. (Recomendado) Adicione a conferência automática dos pull requests, mais abaixo, e proteja a branch `main` para
   só entrar com revisão.

## Estrutura das pastas

```
lumiar-galeria/
├── index.json                     gerado pelo script, não edite à mão
├── scripts/galeria-index.mjs
├── efeitos/
│   └── onda-colorida/             o nome da pasta é o id do item
│       ├── onda-colorida.lumiarfx
│       ├── item.json
│       └── preview.jpg            opcional (ou .png, .webp, .gif)
└── pacotes/
    └── trailer-epico/
        ├── trailer-epico.lumiarpack
        ├── item.json
        └── preview.jpg
```

- O **id** (nome da pasta) usa só letras minúsculas, números e `-`, e não muda depois de publicado: é por ele que o
  Lumiar sabe o que já está instalado.
- Cada pasta tem **exatamente um** `.lumiarfx` (em `efeitos/`) ou `.lumiarpack` (em `pacotes/`). Um arquivo pode
  trazer vários efeitos ou pacotes (uma coleção).
- A **prévia** é uma imagem 16:9, de preferência 480×270 e abaixo de 500 KB. Um GIF curto mostra bem um efeito.

### item.json

```json
{
  "name": "Onda colorida",
  "description": "A imagem ondula e ganha um brilho de cor que passa.",
  "author": "Fulana de Tal",
  "tags": ["distorção", "cor"],
  "language": "pt",
  "version": "1.0.0"
}
```

| Campo | Obrigatório | O que é |
|---|---|---|
| `name` | sim | nome que aparece no cartão |
| `author` | sim | quem fez (nome ou @usuario) |
| `description` | não | uma ou duas frases sobre o que faz |
| `tags` | não | etiquetas para o filtro (até 12; ficam em minúsculas) |
| `language` | não | idioma dos nomes e textos do item: `pt`, `en`, `es`… |
| `version` | não | texto livre, `"1.0.0"` se faltar; suba quando mudar o arquivo |
| `preview` | não | nome da imagem, se não for `preview.*` |
| `added` | não | data de entrada (AAAA-MM-DD); se faltar, o script usa a de hoje e depois mantém |

## Formato do index.json

O script escreve isto (os caminhos são relativos ao próprio `index.json`):

```json
{
  "format": "lumiar-galeria",
  "version": 1,
  "name": "Galeria da comunidade do Lumiar",
  "updated": "2026-10-28",
  "items": [
    {
      "id": "onda-colorida",
      "kind": "effect",
      "name": "Onda colorida",
      "description": "A imagem ondula e ganha um brilho de cor que passa.",
      "author": "Fulana de Tal",
      "tags": ["distorção", "cor"],
      "language": "pt",
      "file": "efeitos/onda-colorida/onda-colorida.lumiarfx",
      "preview": "efeitos/onda-colorida/preview.jpg",
      "size": 1834,
      "sha256": "9f2c…(64 caracteres hexadecimais)",
      "version": "1.0.0",
      "added": "2026-10-28",
      "contents": ["user/onda-colorida-1a2b3c"]
    }
  ]
}
```

| Campo | Tipo | O que é |
|---|---|---|
| `format` | `"lumiar-galeria"` | marca do formato; outro valor e o índice não abre |
| `version` | número | versão do formato (hoje `1`). Um Lumiar antigo diz para atualizar quando vê uma maior |
| `name`, `updated` | texto | nome da galeria e data da última geração |
| `items[].id` | texto | igual ao nome da pasta; único por tipo |
| `items[].kind` | `"effect"` ou `"pack"` | o tipo do arquivo; a extensão precisa combinar |
| `items[].file` | texto | caminho relativo (ou endereço https completo no mesmo repositório) |
| `items[].preview` | texto | opcional, mesma regra do `file` |
| `items[].size` | número | tamanho do arquivo em bytes (até 4 MB) |
| `items[].sha256` | texto | SHA-256 do arquivo, em hexadecimal |
| `items[].contents` | lista | ids dos efeitos ou pacotes dentro do arquivo (para mostrar "Instalado") |
| os outros | texto / lista | copiados do `item.json` |

Um item com campo errado (tipo errado, sem SHA-256, http, fora do repositório) é ignorado sozinho, sem derrubar a
galeria; o rodapé da janela avisa quantos ficaram de fora. A conferência fica em
[`src/project/gallery.ts`](../src/project/gallery.ts) (`parseIndex`).

## Enviando um item

1. Faça o efeito no **Editor de efeitos** (Ferramentas) ou ajuste e salve o pacote em "Meus pacotes".
2. Exporte: **Exportar** no editor de efeitos (um efeito só) ou o botão de baixar no topo da aba Pacotes. Dá para
   editar o `.lumiarpack` num editor de texto e deixar só os pacotes que quer enviar.
3. Faça um fork do `lumiar-galeria`, crie a pasta `efeitos/<id>/` ou `pacotes/<id>/` com o arquivo, o `item.json` e
   a prévia.
4. Rode `node scripts/galeria-index.mjs .` e confira os avisos.
5. Teste no Lumiar com o endereço do seu fork (engrenagem da galeria, acima): instale e use num clipe.
6. Abra o pull request contando o que o item faz. Para mudar um item seu, mande o arquivo novo e suba a `version`.

## Revisão (checklist)

Um pacote é uma lista de efeitos, filtro, câmera e velocidade; um efeito é um **shader**, código que roda na placa de
vídeo para cada pixel de cada quadro. O shader roda na caixa de areia do WebGL2: não lê arquivos, não acessa a
internet e não vê nada além da imagem do clipe. O risco real é outro: travar a placa de vídeo, deixar o editor lento,
ou mostrar algo que a pessoa não esperava. Antes de aprovar:

**O arquivo**

- [ ] O `index.json` foi regerado e a conferência automática passou (tamanho e SHA-256 batem).
- [ ] O arquivo tem só o que o item diz (um efeito, ou a coleção descrita), sem efeitos de outras pessoas sem crédito.
- [ ] Nome, descrição, etiquetas e prévia são honestos, sem dados pessoais, links ou propaganda.
- [ ] A prévia mostra o efeito de verdade e é pequena (abaixo de 500 KB).

**O shader** (abra o `.lumiarfx` e leia o `glsl`)

- [ ] **Laços com limite fixo e pequeno**: `for (int i = 0; i < 32; i++)` sim; laço que depende de um parâmetro sem
      teto, `while`, ou laços aninhados que somam milhares de leituras por pixel, não. Um shader pesado demais faz o
      sistema reiniciar a placa de vídeo (o Lumiar mostra "A placa de vídeo parou de responder") e pode congelar a tela por segundos.
- [ ] **Leituras de imagem por pixel**: cada `getColor`, `getPast`, `getBackground` conta. Desfoques com 100+
      amostras por pixel deixam o preview lento em 4K.
- [ ] **Sem "surpresa" escondida**: nada que muda depois de um tempo (`if (time > 60.0)`), em datas, ou só com um
      valor exato de parâmetro; nenhuma imagem desenhada com fórmulas (texto, símbolo, logo) que a descrição não conta.
- [ ] **Sem piscar forte**: flashes ou alternância de claro/escuro mais de 3 vezes por segundo em tela cheia podem
      causar crises em pessoas fotossensíveis. Se for a ideia do efeito (estrobo), a descrição precisa avisar.
- [ ] **Funções pesadas só quando precisa**: `getPerson`, `getDepth` e `getBackground` ligam modelos de IA; tudo bem
      usar, desde que o efeito seja sobre isso e a descrição diga.
- [ ] **Parâmetros com limites** (`min`/`max`) que não levam o efeito a dividir por zero ou a laços maiores.

**Testar no Lumiar** (com o endereço do fork na engrenagem da galeria)

- [ ] Instala sem aviso de erro e aparece em "Meus efeitos" ou "Meus pacotes".
- [ ] Aplicado num vídeo 1080p, o preview continua fluido; mexer nos controles até os extremos não trava nem fica preto.
- [ ] Exporta um trecho curto sem erro.
- [ ] Pacotes: os efeitos que ele usa existem no Lumiar. Um pacote que depende de um efeito da galeria (`user/…`) só
      funciona com o efeito instalado: o ideal é usar efeitos que vêm com o Lumiar ou dizer na descrição qual instalar.

## Regerando o índice

Sempre que um item entra, sai ou muda:

```bash
node scripts/galeria-index.mjs .            # escreve o index.json
node scripts/galeria-index.mjs . --check    # só confere (falha se o index.json está desatualizado)
```

O script percorre `efeitos/` e `pacotes/`, confere cada pasta (id, `item.json`, o formato do arquivo, os limites),
calcula o tamanho e o SHA-256 e escreve o `index.json` com os mais novos primeiro. Com algum erro, ele não escreve
nada e mostra o que corrigir. A data de entrada (`added`) de quem já estava no índice é mantida.

Para conferir cada pull request sozinho, crie `.github/workflows/indice.yml` no repositório da galeria:

```yaml
name: Índice
on: [pull_request, push]
jobs:
  conferir:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: node scripts/galeria-index.mjs . --check
```
