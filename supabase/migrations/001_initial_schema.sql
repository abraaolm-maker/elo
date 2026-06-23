-- ════════════════════════════════════════
-- COMPANIES
-- ════════════════════════════════════════
create table companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  plan        text not null default 'starter', -- 'starter' | 'pro' | 'enterprise'
  created_at  timestamptz not null default now()
);

-- ════════════════════════════════════════
-- MANAGERS (usuários gestores — via Supabase Auth)
-- ════════════════════════════════════════
create table managers (
  id          uuid primary key references auth.users(id) on delete cascade,
  company_id  uuid not null references companies(id) on delete cascade,
  name        text not null,
  email       text not null,
  created_at  timestamptz not null default now()
);

-- ════════════════════════════════════════
-- WORKERS (trabalhadores — NÃO têm login no sistema)
-- ════════════════════════════════════════
create table workers (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  role              text not null,         -- nome do cargo em texto livre (ex: "Mestre de Obras", "Supervisor de Linha")
  role_description  text,                  -- descrição livre das responsabilidades — alimenta a IA para formular perguntas
  whatsapp_number   text not null,         -- formato: 5511999999999 (sem + e sem espaços)
  anonymous_alias   text not null,         -- ex: 'Colaborador A', gerado automaticamente por ordem de cadastro
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  unique(company_id, whatsapp_number)
);

-- ════════════════════════════════════════
-- INVESTIGATIONS
-- ════════════════════════════════════════
create table investigations (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references companies(id) on delete cascade,
  manager_id           uuid not null references managers(id),
  title                text not null,
  problem_description  text not null,
  ishikawa_category    text,               -- 'mao_de_obra' | 'maquina' | 'metodo' | 'material' | 'meio_ambiente' | 'medicao' | null (IA decide)
  status               text not null default 'pending',
                                           -- 'pending' | 'active' | 'saturated' | 'completed' | 'cancelled'
  created_at           timestamptz not null default now(),
  completed_at         timestamptz
);

-- ════════════════════════════════════════
-- INVESTIGATION_WORKERS (quais workers participam de qual investigação)
-- ════════════════════════════════════════
create table investigation_workers (
  id                uuid primary key default gen_random_uuid(),
  investigation_id  uuid not null references investigations(id) on delete cascade,
  worker_id         uuid not null references workers(id),
  status            text not null default 'pending',
                                  -- 'pending' | 'active' | 'saturated' | 'unresponsive'
  saturation_score  integer not null default 0, -- 0-100, IA atualiza a cada resposta
  created_at        timestamptz not null default now(),
  unique(investigation_id, worker_id)
);

-- ════════════════════════════════════════
-- MESSAGES (todas as mensagens trocadas via WhatsApp)
-- ════════════════════════════════════════
create table messages (
  id                    uuid primary key default gen_random_uuid(),
  investigation_id      uuid not null references investigations(id) on delete cascade,
  worker_id             uuid not null references workers(id),
  direction             text not null,              -- 'outbound' (sistema → worker) | 'inbound' (worker → sistema)
  content_type          text not null default 'text', -- 'text' | 'audio'
  content               text,                        -- texto da mensagem ou transcrição do áudio
  audio_url             text,                        -- URL do áudio no Supabase Storage (se for áudio)
  raw_whatsapp_id       text unique,                 -- ID da mensagem no WhatsApp (deduplicação — deve ser único)
  transcription_status  text not null default 'not_applicable',
                                                     -- 'success' | 'failed' | 'permanently_failed' | 'not_applicable'
  retry_count           integer not null default 0,  -- número de tentativas de transcrição (máx 2)
  key_points_extracted  jsonb,                       -- pontos extraídos pela IA desta mensagem (array de strings, apenas inbound)
  created_at            timestamptz not null default now()
);

-- ════════════════════════════════════════
-- REPORTS
-- ════════════════════════════════════════
create table reports (
  id                       uuid primary key default gen_random_uuid(),
  investigation_id         uuid not null references investigations(id) on delete cascade unique,
  root_cause               text not null,
  confidence_score         integer not null,          -- 0-100
  confidence_justification text,                      -- justificativa textual do nível de confiança
  ishikawa_breakdown       jsonb,                     -- { mao_de_obra: "...", maquina: "...", ... }
  sources_summary          jsonb,                     -- array de { alias: "Colaborador A", role: "...", key_points: [...] }
  recommendations          text[],                    -- array de ações sugeridas
  generated_at             timestamptz not null default now()
);

-- ════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ════════════════════════════════════════
alter table companies             enable row level security;
alter table managers              enable row level security;
alter table workers               enable row level security;
alter table investigations        enable row level security;
alter table investigation_workers enable row level security;
alter table messages              enable row level security;
alter table reports               enable row level security;

-- Companies: manager pode ver apenas a própria empresa
create policy "companies_own" on companies
  for all using (
    id = (select company_id from managers where id = auth.uid())
  );

-- Managers: cada manager vê apenas a si mesmo
create policy "managers_own" on managers
  for all using (id = auth.uid());

-- Workers: apenas da própria company
create policy "workers_own_company" on workers
  for all using (
    company_id = (select company_id from managers where id = auth.uid())
  );

-- Investigations: apenas da própria company
create policy "investigations_own_company" on investigations
  for all using (
    company_id = (select company_id from managers where id = auth.uid())
  );

-- Investigation_workers: apenas investigações da própria company
create policy "investigation_workers_own_company" on investigation_workers
  for all using (
    investigation_id in (
      select id from investigations
      where company_id = (select company_id from managers where id = auth.uid())
    )
  );

-- Messages: apenas de investigações da própria company
create policy "messages_own_company" on messages
  for all using (
    investigation_id in (
      select id from investigations
      where company_id = (select company_id from managers where id = auth.uid())
    )
  );

-- Reports: apenas de investigações da própria company
create policy "reports_own_company" on reports
  for all using (
    investigation_id in (
      select id from investigations
      where company_id = (select company_id from managers where id = auth.uid())
    )
  );
