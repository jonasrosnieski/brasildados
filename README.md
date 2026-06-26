# BrasilDados

Ingestão e API de dados públicos brasileiros para análise comparativa de governos (1889–2026).

## Estrutura

| Caminho | Conteúdo |
|---------|----------|
| `data/` | Séries temporais curadas (JSON) — BCB, IPEA, IBGE, CT&I |
| `api/` | API HTTP local (porta 3737) |
| `ingest/` | Scripts de coleta de fontes oficiais |
| `D:\brasildados\` | Downloads volumosos (TSE, INEP, PNADC) — **não versionados** |

O dashboard Next.js vive no hub [AETHER](https://github.com/jonasrosnieski/aether) em `/apps/brasildados`.

## Quick start

```bash
npm install
npm run presidents          # regenera data/presidents.json
npm run ingest:all          # BCB + IPEA + IBGE + TSE (metadados)
npm run ingest:cti          # ciência, tecnologia e investimento público
npm run api                 # http://localhost:3737
```

## Fontes de dados

- **BCB/SGS** — inflação, SELIC, PIB, câmbio, desemprego
- **IPEADATA** — salário mínimo, CT&I, pesquisadores, patentes
- **IBGE/SIDRA** — Gini, pobreza, analfabetismo, mortalidade infantil
- **TSE** — eleições (microdados em `D:\brasildados\tse\`)
- **Wikipedia/Wikimedia** — retratos oficiais dos presidentes (domínio público)

## API

| Endpoint | Descrição |
|----------|-----------|
| `GET /health` | Status |
| `GET /presidents` | Lista presidentes |
| `GET /presidents/:slug` | Cartão + scorecard |
| `GET /rankings/:id` | Ranking por indicador |
| `GET /compare?slugs=a,b&indicator=...` | Comparação |
| `GET /series/:name?from=&to=` | Série temporal anotada |

## Licença

Dados públicos das fontes oficiais citadas. Código MIT.
