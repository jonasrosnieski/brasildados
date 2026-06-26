# BrasilDados



Ingestão e API de dados públicos brasileiros para análise comparativa de governos (1889–2026).



## Links públicos



| Recurso | URL |

|---------|-----|

| **Site (link permanente)** | https://brasildados-8o0.pages.dev |

| **Dashboard** | https://aether.jonasponcianor.workers.dev/apps/brasildados |

| **API JSON** | https://brasildados-api.jonasponcianor.workers.dev |

| **Short link (hub)** | https://aether.jonasponcianor.workers.dev/go/brasildados |



O dashboard Next.js vive no hub [AETHER](https://github.com/jonasrosnieski/aether) em `/apps/brasildados`. O domínio `brasildados-8o0.pages.dev` redireciona para o dashboard com paths preservados.



## Estrutura



| Caminho | Conteúdo |

|---------|----------|

| `data/` | Séries temporais curadas (JSON) — BCB, IPEA, IBGE, CT&I, social, empresas |

| `api/` | API HTTP (local + lógica compartilhada com Worker) |

| `worker/` | Cloudflare Worker de produção |

| `site/` | Site estático (redirects → hub) |

| `ingest/` | Scripts de coleta de fontes oficiais |

| `D:\brasildados\` | Downloads volumosos (TSE, INEP, PNADC) — **não versionados** |



## Quick start (local)



```bash

npm install

npm run presidents          # regenera data/presidents.json

npm run ingest:all          # BCB + IPEA + IBGE + TSE (metadados)

npm run ingest:social       # PNAD renda + profissões

npm run ingest:empresas     # CVM DFP

npm run api                 # http://localhost:3737

```



Dashboard local: `http://localhost:3000/apps/brasildados` (hub Aether com `npm run dev`).



## Deploy



Push em `main` dispara `.github/workflows/deploy.yml`:



1. **API** → Cloudflare Worker `brasildados-api`

2. **Site** → Cloudflare Pages `brasildados`

3. **Sync** → atualiza URLs no hub Aether



Manual:



```bash

npm run bundle              # gera worker/data-bundle.json

npm run deploy:api          # Worker

npm run deploy:site         # Pages

```



## Fontes de dados



- **BCB/SGS** — inflação, SELIC, PIB, câmbio, desemprego

- **IPEADATA** — salário mínimo, CT&I, pesquisadores, patentes

- **IBGE/SIDRA** — Gini, pobreza, analfabetismo, mortalidade infantil

- **CVM** — companhias abertas (receita, lucro, DVA)

- **PNAD** — renda por classe e profissões

- **TSE** — eleições (microdados em `D:\brasildados\tse\`)

- **Wikipedia/Wikimedia** — retratos oficiais dos presidentes (domínio público)



## API



| Endpoint | Descrição |

|----------|-----------|

| `GET /health` | Status |

| `GET /presidents` | Lista presidentes |

| `GET /presidents/:slug` | Cartão + scorecard + legado |

| `GET /rankings/:id` | Ranking por indicador |

| `GET /compare?slugs=a,b&indicator=...` | Comparação |

| `GET /series/:name?from=&to=` | Série temporal anotada |

| `GET /social/renda-classes` | Renda por classe IBGE |

| `GET /social/renda-distribuicao` | Faixas de renda alternativas |

| `GET /social/profissoes` | Profissões PNAD |

| `GET /empresas` | Ranking CVM |



## Licença



Dados públicos das fontes oficiais citadas. Código MIT.

