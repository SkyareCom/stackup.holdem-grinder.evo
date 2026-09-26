# Padrão GRINDER

Regras visuais obrigatórias do app GRINDER. Toda tela nova ou alteração segue este documento.

## 1. Fontes
- Bebrush em todo o app. Road Rage somente na palavra "GRINDER".
- Todo texto em 12px: botões, cards, abas, seções, descrições, avisos e faixas de título. Única exceção: o bloco da marca (logo + STACKUP HOLD'EM + GRINDER).
- Peso sempre normal (400), nunca bold.
- Espaço entre letras: títulos/rótulos 1px, descrições 0.5px, faixas de título 2px.
- Título e descrição se diferenciam só pela cor, nunca pelo tamanho.
- Nomes longos quebram uma palavra por linha dentro do card; nunca cortar texto.

## 2. Cores (nenhuma outra cor de destaque é permitida)
- Fundo: degradê vertical do preto #000000 (topo) ao azul-noite #040e2a (base), com o par de ases em relevo ao fundo, bem transparente.
- Texto e ícones: #ffffff
- Texto secundário: #a8a49e
- Azul GRINDER: #155bbd
- Texto ativo: #6fa4ff

## 3. Cards e botões — sempre vidro, só dois estados
NORMAL (não clicado):
- fundo rgba(255,255,255,.06) + backdrop-filter: blur(14px) saturate(140%)
- borda 1px rgba(255,255,255,.38)
- brilho interno: inset 0 1px 0 rgba(255,255,255,.22), inset 0 -1px 0 rgba(255,255,255,.06)
- título e ícone brancos; descrição #a8a49e

CLICADO / ATIVO:
- fundo rgba(21,91,189,.32) + backdrop-filter: blur(14px) saturate(150%)
- borda 1px #155bbd + halo: inset 0 1px 0 rgba(140,185,255,.35), 0 0 14px rgba(21,91,189,.35)
- título e ícone #6fa4ff; descrição branca

Formas:
- Cantos de 16px em todo botão, card, aba, cabeçalho de seção e caixa de conteúdo.
- Formatos regulares (retângulos arredondados); nada orgânico.
- Card de torre: ícone de 40px em cima, título embaixo, centralizados; grade de 3 colunas com espaço de 8px.
- Botão de linha (login, cabeçalho de seção): ícone à esquerda, título + descrição, seta à direita.
- Faixa de título das telas (HOME, TREINO…): fundo rgba(255,255,255,.08), borda de vidro 1px, cantos retos, girada -1.5°.
- Seções expansíveis (gavetas): só o cabeçalho é botão; o conteúdo aberto aparece direto sobre o fundo, sem borda envolvendo.

## 4. Ícones
- Material Symbols Outlined (peso 400), na cor do texto. No rodapé, ícones de traço 2px.
- Todo card interno tem ícone + título.
- O mesmo conceito usa sempre o mesmo ícone.

## 5. Estrutura de toda tela interna
1. Cabeçalho: logo StackUp (sempre quadrado, sem distorcer) + STACKUP HOLD'EM + GRINDER (Road Rage, azul GRINDER com efeito vidro)
2. Botões "Voltar" e "Menu principal", com linha divisória 1px rgba(255,255,255,.16) embaixo
3. Faixa de título da tela
4. Conteúdo (grade de cards de torre ou seções expansíveis), margem lateral de 22px
5. Rodapé com 5 abas: Home · Perfil · Spots · Treino · Run (fundo rgba(0,0,0,.35) com blur 16px; aba ativa no estado clicado)

## 6. Comportamento
- Todo grupo de opções tem sempre uma opção ativa; nos grupos de múltipla escolha, "Todas" cobre o caso vazio. Exceção: seção inativa (ex.: no modo Cash, Tipo de torneio, Informações do field e Fase do torneio ficam inativas).
- Voltar: subtela → tela principal da seção → Home → sai do app (volta ao login).
- Menu principal: vai direto para Home.
- Toda tela nova já nasce traduzida em Português, Inglês e Espanhol, trocando pelo seletor de idioma.

## 7. Código
Use estes tokens e nunca valores soltos:

```css
:root{
  --font-ui:'Bebrush',sans-serif; --font-brand:'Road Rage',sans-serif;
  --fs:12px; --ls-label:1px; --ls-desc:.5px; --ls-faixa:2px;
  --bg-top:#000; --bg-bottom:#040e2a;
  --ink:#fff; --ink-muted:#a8a49e; --accent:#155bbd; --accent-text:#6fa4ff;
  --glass-fill:rgba(255,255,255,.06); --glass-fill-strong:rgba(255,255,255,.08);
  --glass-border:1px solid rgba(255,255,255,.38);
  --glass-blur:blur(14px) saturate(140%);
  --glass-highlight:inset 0 1px 0 rgba(255,255,255,.22),inset 0 -1px 0 rgba(255,255,255,.06);
  --on-fill:rgba(21,91,189,.32); --on-border:1px solid #155bbd; --on-blur:blur(14px) saturate(150%);
  --on-glow:inset 0 1px 0 rgba(140,185,255,.35),0 0 14px rgba(21,91,189,.35);
  --radius-card:16px; --gap:8px; --icon:40px; --gutter:22px;
}
```

Antes de entregar, confira: todo texto em 12px; nenhuma cor fora da lista; todo botão/card em vidro com borda 1px; clique em vidro azul; cantos de 16px; 3 idiomas; Voltar seguindo a regra.
