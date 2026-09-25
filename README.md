# GRINDER — Tela de entrada (v1.0, congelada)

Tela de login do app **GRINDER** (ecossistema StackUp Hold'em).

- `index.html` — tela completa, autossuficiente (fontes, logo e cartas embutidos em base64). Abre direto no navegador.
- `assets/` — arquivos-fonte originais (fontes, logo, cartas) para uso no app nativo.

## Especificação
- Fundo: concreto de obra, cinza elefante (`#86827d`), juntas de fôrma; cartas (ás de paus + ás de ouros) a 12% de opacidade, giradas −20°.
- Topo: logo StackUp Hold'em → "STACKUP HOLD'EM" (Bebrush, 1 linha) → "GRINDER" (Road Rage, contorno para efeito ~700) → faixa "Decisões consistentes. Poker lucrativo." (Bebrush 14px, 1 linha, borda branca 1px).
- Botões (mesma largura/altura, ~9% da altura da tela, máx. 74px): Idioma (PT/EN/ES), Biometria, WhatsApp ("Código de acesso"), Google.
  - Não clicado: fundo preto, borda branca 1px, texto branco / cinza, 12px.
  - Clicado (alterna ao tocar; um ativo por vez): vidro branco 70%, borda preta 2px, título preto, subtítulo cinza elefante escuro.
- Rodapé: 12px, peso 400 — frase em preto, "Termos de Uso" / "Política de Privacidade" em branco.
- Layout proporcional à altura da tela; testado de 520 a 844 px de altura sem rolagem.

## Licenças de fontes
- **Bebrush** (Garisman Studio) — versão DEMO, apenas uso pessoal. **Comprar licença comercial antes de publicar o app.**
- **Road Rage** (Typodermic, via Google Fonts / Fontsource) — SIL Open Font License, uso comercial liberado.
