-- BrasilDados — Schema PostgreSQL
-- Análise comparativa de governos brasileiros (1889–2026)

-- Tabela central de presidentes e mandatos
CREATE TABLE IF NOT EXISTS presidents (
  id           SERIAL PRIMARY KEY,
  slug         TEXT UNIQUE NOT NULL,        -- ex: "lula-1", "fhc-2"
  name         TEXT NOT NULL,
  full_name    TEXT,
  party        TEXT,
  coalition    TEXT,
  term_start   DATE NOT NULL,
  term_end     DATE,                        -- NULL = mandato em curso
  term_number  INT  NOT NULL DEFAULT 1,    -- 1º mandato, 2º mandato etc.
  took_office_how TEXT,                    -- 'eleicao_direta', 'eleicao_indireta', 'vice', 'golpe', 'interino'
  left_office_how TEXT,                    -- 'fim_mandato', 'renuncia', 'impeachment', 'morte', 'golpe'
  notes        TEXT
);

-- Séries temporais (uma linha por fonte/indicador/mês)
CREATE TABLE IF NOT EXISTS series (
  id           BIGSERIAL PRIMARY KEY,
  president_id INT REFERENCES presidents(id),
  category     TEXT NOT NULL,              -- 'economia', 'saude', 'educacao', 'seguranca', 'social'
  subcategory  TEXT NOT NULL,              -- 'inflacao', 'pib', 'desemprego', 'homicidios' ...
  indicator    TEXT NOT NULL,              -- nome técnico do indicador
  period_date  DATE NOT NULL,              -- sempre o 1º dia do mês ou ano
  period_type  TEXT NOT NULL DEFAULT 'monthly', -- 'monthly', 'annual', 'election'
  value        NUMERIC(20, 6) NOT NULL,
  unit         TEXT,                       -- '%', 'BRL', 'per_100k', 'anos' ...
  source       TEXT NOT NULL,              -- 'BCB', 'IBGE', 'IPEA', 'TSE', 'DATASUS', 'INEP'
  source_code  TEXT,                       -- código da série na fonte (ex: BCB série 433)
  source_url   TEXT,
  fetched_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_series_category    ON series(category, subcategory);
CREATE INDEX IF NOT EXISTS idx_series_period      ON series(period_date);
CREATE INDEX IF NOT EXISTS idx_series_president   ON series(president_id);
CREATE INDEX IF NOT EXISTS idx_series_indicator   ON series(indicator, period_date);

-- Dados eleitorais por presidente (1945–2022)
CREATE TABLE IF NOT EXISTS elections (
  id             SERIAL PRIMARY KEY,
  year           INT NOT NULL,
  round          INT NOT NULL,             -- 1 ou 2
  president_id   INT REFERENCES presidents(id),
  candidate_name TEXT NOT NULL,
  party          TEXT,
  votes          BIGINT,
  valid_votes    BIGINT,
  vote_pct       NUMERIC(6,3),
  opponent_name  TEXT,
  opponent_party TEXT,
  opponent_votes BIGINT,
  opponent_pct   NUMERIC(6,3),
  total_voters   BIGINT,
  turnout_pct    NUMERIC(6,3),
  result         TEXT,                     -- 'eleito', 'nao_eleito'
  source         TEXT DEFAULT 'TSE'
);

-- Contexto de época (preços e salários por período)
CREATE TABLE IF NOT EXISTS cost_of_living (
  id           BIGSERIAL PRIMARY KEY,
  president_id INT REFERENCES presidents(id),
  year         INT NOT NULL,
  min_wage_brl      NUMERIC(12,2),    -- salário mínimo nominal
  min_wage_real_brl NUMERIC(12,2),    -- salário mínimo real (corrigido pelo IPCA para R$ hoje)
  food_basket_brl   NUMERIC(12,2),    -- cesta básica média nacional
  avg_car_brl       NUMERIC(12,2),    -- automóvel popular médio
  avg_home_brl      NUMERIC(14,2),    -- imóvel residencial médio (capital)
  avg_private_school_monthly NUMERIC(10,2), -- mensalidade escola particular
  source       TEXT,
  notes        TEXT
);

-- Seed: presidentes do Brasil (República, 1889–2026)
INSERT INTO presidents (slug, name, full_name, party, term_start, term_end, term_number, took_office_how, left_office_how) VALUES
  ('deodoro',      'Deodoro da Fonseca',   'Manuel Deodoro da Fonseca',         NULL,   '1889-11-15', '1891-11-23', 1, 'golpe',           'renuncia'),
  ('floriano',     'Floriano Peixoto',     'Floriano Vieira Peixoto',           NULL,   '1891-11-23', '1894-11-15', 1, 'vice',            'fim_mandato'),
  ('prudente',     'Prudente de Morais',   'Prudente José de Morais e Barros',  NULL,   '1894-11-15', '1898-11-15', 1, 'eleicao_direta',  'fim_mandato'),
  ('campos-sales', 'Campos Sales',         'Manuel Ferraz de Campos Sales',     NULL,   '1898-11-15', '1902-11-15', 1, 'eleicao_direta',  'fim_mandato'),
  ('rodrigues-alves','Rodrigues Alves',    'Francisco de Paula Rodrigues Alves',NULL,   '1902-11-15', '1906-11-15', 1, 'eleicao_direta',  'fim_mandato'),
  ('afonso-pena',  'Afonso Pena',          'Afonso Augusto Moreira Pena',       NULL,   '1906-11-15', '1909-06-14', 1, 'eleicao_direta',  'morte'),
  ('nilo-pecanha', 'Nilo Peçanha',         'Nilo Procópio Peçanha',             NULL,   '1909-06-14', '1910-11-15', 1, 'vice',            'fim_mandato'),
  ('hermes',       'Hermes da Fonseca',    'Hermes Rodrigues da Fonseca',       NULL,   '1910-11-15', '1914-11-15', 1, 'eleicao_direta',  'fim_mandato'),
  ('venceslau',    'Venceslau Brás',       'Venceslau Brás Pereira Gomes',      NULL,   '1914-11-15', '1918-11-15', 1, 'eleicao_direta',  'fim_mandato'),
  ('delfim',       'Delfim Moreira',       'Delfim Moreira da Costa Ribeiro',   NULL,   '1918-11-15', '1919-07-28', 1, 'vice',            'fim_mandato'),
  ('epitacio',     'Epitácio Pessoa',      'Epitácio Lindolfo da Silva Pessoa', NULL,   '1919-07-28', '1922-11-15', 1, 'eleicao_direta',  'fim_mandato'),
  ('artur-bernardes','Artur Bernardes',    'Artur da Silva Bernardes',          NULL,   '1922-11-15', '1926-11-15', 1, 'eleicao_direta',  'fim_mandato'),
  ('washington-luis','Washington Luís',    'Washington Luís Pereira de Sousa',  NULL,   '1926-11-15', '1930-10-24', 1, 'eleicao_direta',  'golpe'),
  ('vargas-1',     'Getúlio Vargas',       'Getúlio Dornelles Vargas',          NULL,   '1930-11-03', '1945-10-29', 1, 'golpe',           'golpe'),
  ('dutra',        'Eurico Dutra',         'Eurico Gaspar Dutra',               'PSD',  '1946-01-31', '1951-01-31', 1, 'eleicao_direta',  'fim_mandato'),
  ('vargas-2',     'Getúlio Vargas',       'Getúlio Dornelles Vargas',          'PTB',  '1951-01-31', '1954-08-24', 2, 'eleicao_direta',  'morte'),
  ('cafe-filho',   'João Café Filho',      'João Fernandes Campos Café Filho',  'PSP',  '1954-08-24', '1955-11-08', 1, 'vice',            'fim_mandato'),
  ('carlos-luz',   'Carlos Luz',           'Carlos Luz',                        'PSD',  '1955-11-08', '1955-11-11', 1, 'interino',        'fim_mandato'),
  ('nereu-ramos',  'Nereu Ramos',          'Nereu de Oliveira Ramos',           'PSD',  '1955-11-11', '1956-01-31', 1, 'interino',        'fim_mandato'),
  ('jk',           'Juscelino Kubitschek', 'Juscelino Kubitschek de Oliveira',  'PSD',  '1956-01-31', '1961-01-31', 1, 'eleicao_direta',  'fim_mandato'),
  ('janio',        'Jânio Quadros',        'Jânio da Silva Quadros',            'PTN',  '1961-01-31', '1961-08-25', 1, 'eleicao_direta',  'renuncia'),
  ('ranieri',      'Ranieri Mazzilli',     'Pascoal Ranieri Mazzilli',          'PSD',  '1961-08-25', '1961-09-07', 1, 'interino',        'fim_mandato'),
  ('jango',        'João Goulart',         'João Belchior Marques Goulart',     'PTB',  '1961-09-07', '1964-04-01', 1, 'vice',            'golpe'),
  ('castelo-branco','Castelo Branco',      'Humberto de Alencar Castelo Branco',NULL,   '1964-04-15', '1967-03-15', 1, 'eleicao_indireta','fim_mandato'),
  ('costa-e-silva','Costa e Silva',        'Artur da Costa e Silva',            NULL,   '1967-03-15', '1969-08-31', 1, 'eleicao_indireta','morte'),
  ('medici',       'Emílio Médici',        'Emílio Garrastazu Médici',          NULL,   '1969-10-30', '1974-03-15', 1, 'eleicao_indireta','fim_mandato'),
  ('geisel',       'Ernesto Geisel',       'Ernesto Beckmann Geisel',           NULL,   '1974-03-15', '1979-03-15', 1, 'eleicao_indireta','fim_mandato'),
  ('figueiredo',   'João Figueiredo',      'João Baptista de Oliveira Figueiredo',NULL, '1979-03-15', '1985-03-15', 1, 'eleicao_indireta','fim_mandato'),
  ('sarney',       'José Sarney',          'José Ribamar Ferreira de Araújo Costa',NULL,'1985-03-15', '1990-03-15', 1, 'vice',            'fim_mandato'),
  ('collor',       'Fernando Collor',      'Fernando Affonso Collor de Mello',  'PRN',  '1990-03-15', '1992-12-29', 1, 'eleicao_direta',  'impeachment'),
  ('itamar',       'Itamar Franco',        'Itamar Augusto Cautiero Franco',    'PMDB', '1992-12-29', '1995-01-01', 1, 'vice',            'fim_mandato'),
  ('fhc-1',        'Fernando Henrique Cardoso','Fernando Henrique Cardoso',     'PSDB', '1995-01-01', '1999-01-01', 1, 'eleicao_direta',  'fim_mandato'),
  ('fhc-2',        'Fernando Henrique Cardoso','Fernando Henrique Cardoso',     'PSDB', '1999-01-01', '2003-01-01', 2, 'eleicao_direta',  'fim_mandato'),
  ('lula-1',       'Lula',                 'Luiz Inácio Lula da Silva',         'PT',   '2003-01-01', '2007-01-01', 1, 'eleicao_direta',  'fim_mandato'),
  ('lula-2',       'Lula',                 'Luiz Inácio Lula da Silva',         'PT',   '2007-01-01', '2011-01-01', 2, 'eleicao_direta',  'fim_mandato'),
  ('dilma-1',      'Dilma Rousseff',       'Dilma Vana Rousseff',               'PT',   '2011-01-01', '2015-01-01', 1, 'eleicao_direta',  'fim_mandato'),
  ('dilma-2',      'Dilma Rousseff',       'Dilma Vana Rousseff',               'PT',   '2015-01-01', '2016-08-31', 2, 'eleicao_direta',  'impeachment'),
  ('temer',        'Michel Temer',         'Michel Miguel Elias Temer Lulia',   'PMDB', '2016-08-31', '2019-01-01', 1, 'vice',            'fim_mandato'),
  ('bolsonaro',    'Jair Bolsonaro',       'Jair Messias Bolsonaro',            'PSL',  '2019-01-01', '2023-01-01', 1, 'eleicao_direta',  'fim_mandato'),
  ('lula-3',       'Lula',                 'Luiz Inácio Lula da Silva',         'PT',   '2023-01-01', NULL,          3, 'eleicao_direta',  NULL)
ON CONFLICT (slug) DO NOTHING;
