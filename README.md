# LUME

Copiloto de atendimento para cartão. Cada fala passa por um pipeline determinístico — produto, tema, intenção, sentimento e risco — e a base de conhecimento é recuperada com **Okapi BM25** em memória. O modelo de linguagem só reescreve o texto quando você pede; qual card aparece não depende dele.

## Como rodar

```bash
npm install
npm run dev
```

O app sobe em [http://localhost:8080](http://localhost:8080).

Três abordagens (A, B e C) na mesa do operador: conversa, copiloto e inspeção do turno. Dá para percorrer os cenários prontos ou digitar uma fala nova.

## Onde está o BM25

| Arquivo | Papel |
|---|---|
| `src/lib/lume/bm25.ts` | Okapi BM25 (`k1 = 1.2`, `b = 0.25`) |
| `src/lib/lume/retrieve.ts` | Recuperação da base a partir da consulta do turno |
| `src/lib/lume/knowledge.ts` | Corpus de conhecimento do produto |
| `src/lib/lume/pipeline.ts` | Sinais, recuperação e cards |
| `src/components/lume/` | Interface da mesa |

## Testes

```bash
npm test
```

A chave de modelo (`XAI_API_KEY` ou `OPENAI_API_KEY`) é opcional e fica só no servidor. Sem ela, a mesa continua no modo determinístico.
