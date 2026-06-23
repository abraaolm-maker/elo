# CLAUDE.md — Projeto Elo

> Este arquivo é a fonte da verdade do projeto. Leia-o integralmente antes de qualquer tarefa.
> Toda decisão de arquitetura, nomenclatura e regra de negócio está documentada aqui.

---

## 1. O que é o Elo

**Elo** é um SaaS B2B de inteligência operacional para empresas industriais brasileiras (construção civil, manufatura, logística).

O produto resolve o seguinte problema: gestores não conseguem descobrir a causa raiz de problemas operacionais porque o conhecimento real está com quem está no chão — operadores, mestres de obras, encarregados — e a comunicação entre esses níveis hierárquicos é falha, lenta ou politicamente contaminada.

**Como funciona em uma frase:** O gestor descreve um problema no dashboard → a IA formula perguntas adaptadas por cargo → envia via WhatsApp para os trabalhadores cadastrados → recebe respostas (texto ou áudio) → faz perguntas de aprofundamento até saturação → valida cruzando fontes anonimamente → entrega um relatório de causa raiz.

### O que o MVP faz

- Gestor cria uma investigação no dashboard (título + descrição do problema + seleção de workers por cargo)
- IA formula perguntas baseadas no cargo do worker e nas categorias de Ishikawa
- Sistema envia perguntas por WhatsApp para os workers selecionados
- Workers respondem por texto ou áudio (sem instalar nada)
- Áudios são transcritos automaticamente via Whisper
- IA analisa respostas e decide: fazer nova pergunta ou marcar worker como saturado
- Quando uma fonte aponta causa X, IA pergunta indiretamente sobre X para outras fontes (validação cruzada, sem revelar quem disse)
- Quando todas as fontes atingem saturação, IA gera relatório final com causa raiz, nível de confiança e evidências anonimizadas
- Gestor vê o relatório no dashboard

### O que o MVP NÃO faz (não implementar agora)

- Onboarding automatizado (feito manualmente pelo fundador)
- Multi-tenant isolamento completo (uma company no banco resolve por enquanto)
- Dashboard analítico com gráficos e histórico
- Notificações por e-mail
- Integração com ERP ou outros sistemas
- Aplicativo mobile
- Design system elaborado (Tailwind + shadcn/ui resolvem)
- Múltiplos idiomas

---

## 2. Tech Stack

| Camada | Tecnologia | Justificativa |
|---|---|---|
| Framework | Next.js 16 (App Router) | Frontend + API routes no mesmo projeto |
| Linguagem | TypeScript (strict mode) | Obrigatório em todo o projeto |
| Banco de dados | Supabase (PostgreSQL) | Auth + DB + Storage para áudios |
| WhatsApp | Evolution API (self-hosted) ou Z-API | Provedores BR, mais baratos que Twilio |
| IA / LLM | Anthropic Claude API (`claude-sonnet-4-6`) | Engine de investigação e geração de relatório |
| Transcrição | OpenAI Whisper API | Melhor qualidade PT-BR, barato |
| Estilização | Tailwind CSS + shadcn/ui | Rápido, sem design system próprio |
| Deploy | Vercel | Zero config para Next.js |
| Gerenciador de pacotes | pnpm | Mais rápido que npm |

### Versões fixas (não atualizar sem decisão explícita)

```json
{
  "next": "16.x (instalado: 16.2.9 — decisão consciente)",
  "typescript": "5.x",
  "@supabase/supabase-js": "2.x",
  "@anthropic-ai/sdk": "0.x",
  "openai": "4.x"
}
```

---

## 3. Estrutura de pastas

```
elo/
├── CLAUDE.md                          ← este arquivo
├── .env.local                         ← variáveis de ambiente (não commitar)
├── .env.example                       ← template das variáveis
├── package.json
├── tsconfig.json
│
├── app/                               ← Next.js App Router
│   ├── (auth)/                        ← rotas públicas (login, signup)
│   │   ├── login/page.tsx
│   │   └── layout.tsx
│   ├── (dashboard)/                   ← rotas protegidas do gestor
│   │   ├── layout.tsx                 ← verifica auth, sidebar
│   │   ├── page.tsx                   ← home: lista de investigações
│   │   ├── investigations/
│   │   │   ├── new/page.tsx           ← criar nova investigação
│   │   │   └── [id]/page.tsx         ← detalhe da investigação + mensagens
│   │   ├── workers/page.tsx           ← cadastro de workers
│   │   └── reports/[id]/page.tsx     ← relatório final
│   └── api/
│       ├── whatsapp/
│       │   ├── webhook/route.ts       ← recebe mensagens do WhatsApp (POST)
│       │   └── send/route.ts          ← envia mensagens (POST interno)
│       ├── investigations/
│       │   ├── route.ts               ← GET lista, POST cria
│       │   └── [id]/
│       │       ├── route.ts           ← GET detalhe
│       │       └── start/route.ts     ← POST dispara investigação
│       ├── audio/
│       │   └── transcribe/route.ts    ← POST transcreve áudio via Whisper
│       └── reports/
│           └── [investigationId]/route.ts ← POST gera relatório final
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts                  ← cliente browser
│   │   ├── server.ts                  ← cliente server-side
│   │   └── types.ts                   ← tipos gerados do schema
│   ├── whatsapp/
│   │   ├── sender.ts                  ← função sendWhatsAppMessage()
│   │   ├── parser.ts                  ← parseia payload do webhook
│   │   └── types.ts                   ← tipos do payload do provedor
│   ├── ai/
│   │   ├── investigation-engine.ts    ← lógica central da investigação
│   │   ├── report-generator.ts        ← gera relatório final
│   │   ├── prompts.ts                 ← todos os system prompts centralizados
│   │   └── types.ts                   ← tipos de resposta da IA
│   ├── audio/
│   │   └── transcriber.ts             ← função transcribeAudio() via Whisper
│   └── utils/
│       ├── anonymizer.ts              ← funções de anonimização de respostas
│       └── constants.ts               ← constantes do sistema
│
├── components/
│   ├── ui/                            ← componentes shadcn/ui (não editar)
│   ├── investigations/
│   │   ├── InvestigationCard.tsx
│   │   ├── InvestigationForm.tsx
│   │   └── MessageThread.tsx
│   ├── workers/
│   │   └── WorkerForm.tsx
│   └── reports/
│       └── ReportView.tsx
│
└── supabase/
    └── migrations/                    ← arquivos SQL de migration
        └── 001_initial_schema.sql
```

---

## 4. Modelo de dados (Supabase / PostgreSQL)

### Regra de ouro: RLS habilitado em TODAS as tabelas desde o início

```sql
-- 001_initial_schema.sql

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
  raw_whatsapp_id       text unique,                 -- ID da mensagem no WhatsApp (deduplicação)
  transcription_status  text not null default 'not_applicable',
                                                     -- 'success' | 'failed' | 'permanently_failed' | 'not_applicable'
  retry_count           integer not null default 0,
  key_points_extracted  jsonb,                       -- array de strings, apenas inbound
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
  confidence_justification text,
  ishikawa_breakdown       jsonb,                     -- { mao_de_obra: "...", maquina: "...", ... }
  sources_summary          jsonb,                     -- array de { alias: "Colaborador A", role: "...", key_points: [...] }
  recommendations          text[],
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
```

---

## 5. Variáveis de ambiente

```bash
# .env.example — copiar para .env.local e preencher

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...         # apenas server-side, nunca expor no client

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# OpenAI (Whisper)
OPENAI_API_KEY=sk-...

# WhatsApp Provider (Evolution API ou Z-API)
WHATSAPP_API_URL=https://seu-provedor.com/api
WHATSAPP_API_KEY=sua-chave-aqui
WHATSAPP_INSTANCE_NAME=elo-mvp          # nome da instância no Evolution API

# Webhook
WHATSAPP_WEBHOOK_SECRET=string-aleatoria-para-validar-webhook

# App
NEXT_PUBLIC_APP_URL=https://elo.vercel.app
NODE_ENV=development
```

### Regras de segurança para variáveis

- `NEXT_PUBLIC_*` → acessível no browser. Nunca colocar segredos aqui.
- Tudo sem `NEXT_PUBLIC_` → apenas server-side (API routes, Server Components).
- `SUPABASE_SERVICE_ROLE_KEY` → nunca usar no client. Apenas em API routes que precisam de acesso administrativo (ex: webhook).
- `ANTHROPIC_API_KEY` e `OPENAI_API_KEY` → nunca expor. Apenas em API routes.

---

## 6. Regras de negócio — o coração do produto

### 6.0 Base metodológica — por que o produto funciona assim

O Elo não inventou nenhuma metodologia. Ele automatiza e escala o que engenheiros de qualidade e consultores de melhoria operacional já fazem manualmente há décadas. Cada decisão de como a IA se comporta tem uma metodologia validada por trás. Conhecer essas metodologias é essencial para implementar corretamente o engine de investigação.

| Metodologia | Origem | Onde o Elo aplica |
|---|---|---|
| **5 Porquês (5 Whys)** | Toyota / Taiichi Ohno, 1950s | O modelo de saturação — a IA continua perguntando "por quê?" até chegar à causa raiz ou atingir saturação |
| **Diagrama de Ishikawa** | Kaoru Ishikawa / TQM, 1960s | A IA estrutura a investigação pelas 6 categorias (Mão de obra, Máquina, Método, Material, Meio ambiente, Medição) e adapta perguntas por cargo dentro dessas categorias |
| **8D Problem Solving** | Ford Motor Company, 1980s | O fluxo completo da investigação: D1 (definir equipe) → D2 (descrever problema) → D4 (identificar causa raiz via IA) → D8 (relatório para ação). O Elo automatiza D1 a D4 |
| **Método Delphi** | RAND Corporation, 1950s | A validação cruzada — múltiplas fontes respondem anonimamente, a IA itera com base nas respostas anteriores sem revelar quem disse o quê, buscando convergência |
| **Triangulação de dados** | Norman Denzin, 1970s | O nível de confiança do relatório aumenta quando fontes independentes convergem para a mesma causa raiz sem terem se comunicado |
| **Saturação teórica** | Glaser & Strauss / Grounded Theory, 1967 | O critério de parada da investigação — a IA para de perguntar quando novas respostas não acrescentam informação nova (não quando atinge um número fixo de perguntas) |
| **Gemba Walk** | Toyota / Lean Manufacturing, 1950s | O conceito de "ir até onde o trabalho acontece" — o Elo é o Gemba Walk digital: em vez do gestor ir ao chão, a IA vai até o worker pelo WhatsApp |
| **Maiêutica Socrática** | Sócrates, ~400 a.C. | A IA não diz ao worker qual é o problema — ela faz perguntas que fazem o worker chegar à resposta sozinho. O conhecimento já está nele; o papel da IA é extraí-lo |
| **Andon System** | Toyota Production System, 1960s | O worker tem o poder de sinalizar e investigar problemas — democratização do reporte, sem precisar passar por hierarquias |
| **Kaizen / PDCA** | Deming / Masaaki Imai | O Elo automatiza o "C" do PDCA (Check). Toda investigação completa alimenta o ciclo de melhoria contínua com dados reais |

**Implicações práticas para a implementação:**

1. A IA **nunca deve dar a resposta** ao worker — deve sempre perguntar. (Maiêutica)
2. A IA **nunca deve parar** depois de um número fixo de perguntas — deve parar quando a qualidade da informação para de crescer. (Saturação teórica)
3. A IA **nunca deve revelar** o que outra fonte disse ao formular perguntas de validação cruzada. (Delphi)
4. O relatório **sempre categoriza** as causas pelas dimensões de Ishikawa, mesmo que algumas estejam vazias. (Ishikawa)
5. O **nível de confiança** do relatório deve refletir a convergência entre fontes independentes, não apenas a quantidade de respostas. (Triangulação)

### 6.1 Fluxo de uma investigação

```
PENDING → ACTIVE → SATURATED → COMPLETED
                ↘ CANCELLED (gestor cancela manualmente)
```

1. Gestor cria a investigação com status `pending`
2. Gestor clica em "Iniciar" → status muda para `active`
3. Sistema cria registros em `investigation_workers` para cada worker selecionado
4. Sistema envia primeira pergunta para cada worker via WhatsApp
5. A cada resposta recebida, o engine de IA:
   a. Atualiza o `saturation_score` do `investigation_worker`
   b. Decide se faz nova pergunta ou marca worker como `saturated`
   c. Se nova pergunta: usa `key_points_extracted` de outros workers para validação cruzada
6. Quando TODOS os workers estão `saturated` ou `unresponsive`:
   a. Investigação muda para `saturated`
   b. Sistema gera relatório automaticamente
   c. Investigação muda para `completed`

### 6.2 Saturação — critério de parada

O `saturation_score` vai de 0 a 100. A IA atualiza esse score a cada resposta.

- **0–30:** poucas informações, continuar perguntando
- **31–60:** informações parciais, fazer perguntas de aprofundamento
- **61–85:** informações substanciais, uma ou duas perguntas finais de confirmação
- **86–100:** saturação atingida, marcar como `saturated`

A IA decide o score com base em:
- Especificidade da resposta (vaga vs. detalhada)
- Coerência interna das respostas do mesmo worker
- Convergência com outras fontes

### 6.3 Validação cruzada — como funciona sem expor identidades

Quando worker A (mestre de obras) diz que "o problema é falta de material X":

1. Sistema NÃO envia para o engenheiro: "o mestre disse que falta material X"
2. Sistema envia para o engenheiro uma pergunta indireta: "Em sua avaliação, como estava a disponibilidade de insumos e materiais durante esse período?"
3. A resposta do engenheiro é comparada com a do mestre internamente pela IA
4. O relatório final mostra convergência sem revelar quem disse o quê individualmente

**Como a validação cruzada funciona na prática (implementação):**

O `crossValidationContext` enviado ao engine é construído agregando os `key_points_extracted` de todos os outros workers ativos na investigação — sem identificar de qual worker vieram. Exemplo:

```typescript
// Construir crossValidationContext para o Worker B
// a partir dos key_points do Worker A (e outros workers)
const otherWorkersMessages = await getMessagesFromOtherWorkers(investigationId, currentWorkerId)
const crossValidationContext = otherWorkersMessages
  .flatMap(msg => msg.key_points_extracted ?? [])
  .join('; ')
// Resultado: "falta de material relatada; problema recorrente às segundas-feiras"
// NÃO inclui: quem disse, o cargo de quem disse, o número de quem disse
```

**Regra absoluta:** o conteúdo de uma resposta nunca é atribuído a um worker específico nas mensagens enviadas a outros workers ou no relatório final. O relatório usa apenas `anonymous_alias` (ex: "Colaborador A", "Colaborador B").

### 6.4 Anonimização

- Cada worker recebe um `anonymous_alias` gerado no cadastro: "Colaborador A", "Colaborador B", etc. (por ordem de cadastro na empresa)
- O alias é fixo — não muda de uma investigação para outra
- O `whatsapp_number` NUNCA aparece em nenhuma tela do dashboard
- O nome real do worker NUNCA aparece no relatório — apenas o alias e o cargo

**Lógica de geração do alias (implementar em `lib/utils/anonymizer.ts`):**

```typescript
const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const index = totalWorkersInCompany // 0-based
const alias = `Colaborador ${letters[index] ?? index + 1}` // fallback numérico após Z
```

### 6.5 Perguntas adaptadas por cargo — sistema dinâmico e agnóstico de setor

O Elo não define cargos fixos. Cada empresa cadastra seus próprios cargos com uma descrição livre de responsabilidades. A IA usa essa descrição para inferir o foco das perguntas automaticamente — sem hardcode de setor ou função.

A tabela `workers` tem dois campos de cargo:
- `role`: nome do cargo como a empresa usa (ex: "Mestre de Obras", "Supervisor de Linha")
- `role_description`: descrição em texto livre das responsabilidades do cargo

**Regras para o engine ao formular perguntas:**

1. Perguntar apenas sobre o que a descrição do cargo sugere que a pessoa tem visibilidade
2. Usar linguagem compatível com o nível de responsabilidade descrito
3. Nunca perguntar sobre algo que está claramente fora do escopo do cargo descrito
4. Se a descrição do cargo for vaga ou ausente, fazer perguntas mais abertas e gerais

---

## 7. Integrações externas

### 7.1 WhatsApp (Evolution API)

**Receber mensagens (webhook):**
```
POST /api/whatsapp/webhook
Header: x-webhook-secret: {WHATSAPP_WEBHOOK_SECRET}
```

O payload do Evolution API tem este formato para mensagem de texto:
```json
{
  "event": "messages.upsert",
  "data": {
    "key": { "remoteJid": "5511999999999@s.whatsapp.net", "id": "MSG_ID" },
    "message": { "conversation": "texto da mensagem" },
    "messageType": "conversation"
  }
}
```

Para áudio (PTT — push to talk):
```json
{
  "event": "messages.upsert",
  "data": {
    "key": { "remoteJid": "5511999999999@s.whatsapp.net", "id": "MSG_ID" },
    "message": { "audioMessage": { "url": "https://...", "mimetype": "audio/ogg; codecs=opus" } },
    "messageType": "audioMessage"
  }
}
```

**Extrair número do remetente:**
```typescript
const phoneNumber = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '')
```

**Enviar mensagem:**
```
POST {WHATSAPP_API_URL}/message/sendText/{WHATSAPP_INSTANCE_NAME}
Header: apikey: {WHATSAPP_API_KEY}
Body: { "number": "5511999999999", "text": "sua mensagem aqui" }
```

**Deduplicação:** sempre checar se `raw_whatsapp_id` já existe na tabela `messages` antes de processar. O campo tem constraint UNIQUE no banco.

### 7.2 Anthropic Claude API

**Modelo:** sempre usar `claude-sonnet-4-6`. Não usar Opus (caro) nem Haiku (qualidade insuficiente).

**Padrão de chamada:**
```typescript
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const response = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  system: SYSTEM_PROMPT, // importar de lib/ai/prompts.ts
  messages: conversationHistory
})
```

**Todos os system prompts ficam em `lib/ai/prompts.ts`.** Nunca inline em API routes.

### 7.3 OpenAI Whisper (transcrição de áudio)

```typescript
import OpenAI from 'openai'
import { toFile } from 'openai/uploads'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const transcription = await openai.audio.transcriptions.create({
  file: await toFile(audioBuffer, 'audio.ogg', { type: 'audio/ogg' }),
  model: 'whisper-1',
  language: 'pt',
  response_format: 'verbose_json'
})
```

**Como detectar transcrição inválida ou de baixa qualidade:**

```typescript
function isTranscriptionReliable(transcription: VerboseTranscription): boolean {
  const text = transcription.text.trim()
  if (text.length < 5) return false
  const hasMinimumWords = text.split(' ').filter(w => w.length > 1).length >= 2
  if (!hasMinimumWords) return false
  const segments = transcription.segments ?? []
  const avgNoSpeechProb = segments.length > 0
    ? segments.reduce((sum, s) => sum + (s.no_speech_prob ?? 0), 0) / segments.length
    : 0
  if (avgNoSpeechProb > 0.6) return false
  return true
}
```

**Regras do fallback:**
- Máximo de **2 tentativas de retry** por mensagem de áudio. Na terceira falha, salvar com `transcription_status: 'permanently_failed'` e continuar a investigação sem aquela resposta
- Mensagem de retry: amigável, nunca culpar o worker, oferecer alternativa por texto
- Campo `retry_count` na tabela `messages` controla o número de tentativas

---

## 8. System prompts (estrutura — implementar em `lib/ai/prompts.ts`)

### 8.1 Engine de investigação (`INVESTIGATION_ENGINE_SYSTEM_PROMPT`)

O prompt recebe via mensagem do usuário um JSON com os seguintes campos:

```typescript
{
  problemDescription: string,
  workerRole: string,
  workerRoleDescription: string,
  messageHistory: { direction: 'outbound' | 'inbound'; content: string }[],
  crossValidationContext: string,  // pontos-chave agregados de outros workers, sem identificação
}
```

O prompt retorna **APENAS** um JSON válido (sem texto extra, sem markdown):

```typescript
{
  action: 'ask_question' | 'mark_saturated',
  next_question: string,
  saturation_score: number,           // 0-100
  key_points_extracted: string[],
  ishikawa_categories_touched: string[],
  cross_validation_hints: string[]
}
```

**Regras que o prompt deve enforçar:**
- Nunca revelar o que outro worker disse (Delphi)
- Adaptar linguagem ao `workerRoleDescription`
- Fazer **uma pergunta por vez**
- Linguagem simples e direta — é WhatsApp, não e-mail formal
- Usar Maiêutica: perguntas que fazem o worker descobrir, não confirmar
- Saturar por qualidade da informação, não por quantidade de perguntas
- Responder APENAS com JSON válido

### 8.2 Gerador de relatório (`REPORT_GENERATOR_SYSTEM_PROMPT`)

O prompt recebe via mensagem do usuário um JSON com:

```typescript
{
  investigation: { title: string; problem_description: string },
  allMessages: {
    alias: string
    role: string
    direction: 'outbound' | 'inbound'
    content: string
    key_points_extracted?: string[]
  }[],
  workerAliases: { alias: string; role: string }[]
}
```

O prompt retorna **APENAS** um JSON válido:

```typescript
{
  root_cause: string,
  confidence_score: number,
  confidence_justification: string,
  ishikawa_breakdown: {
    mao_de_obra: string | null,
    maquina: string | null,
    metodo: string | null,
    material: string | null,
    meio_ambiente: string | null,
    medicao: string | null
  },
  sources_summary: { alias: string; role: string; key_points: string[] }[],
  recommendations: string[]
}
```

---

## 9. Convenções de código

### TypeScript

- `strict: true` no tsconfig — sem exceções
- Sem `any` — usar `unknown` e fazer type guards quando necessário
- Tipos explícitos em parâmetros de funções e retornos de API routes
- Enums como `const` objects com `as const`:
  ```typescript
  export const InvestigationStatus = {
    PENDING: 'pending',
    ACTIVE: 'active',
    SATURATED: 'saturated',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
  } as const
  export type InvestigationStatus = typeof InvestigationStatus[keyof typeof InvestigationStatus]
  ```

### API Routes (Next.js App Router)

```typescript
// Padrão de resposta de erro
return Response.json({ error: 'mensagem legível' }, { status: 400 })

// Padrão de resposta de sucesso
return Response.json({ data: resultado }, { status: 200 })

// Sempre tratar erros com try/catch e logar
try {
  // lógica
} catch (error) {
  console.error('[nome-da-route]', error)
  return Response.json({ error: 'Erro interno' }, { status: 500 })
}
```

### Banco de dados

- Sempre usar o cliente `server.ts` em API routes (nunca o `client.ts`)
- Nunca fazer queries diretas de componentes client — sempre via API routes
- UUIDs gerados pelo banco (`gen_random_uuid()`), nunca pelo JavaScript
- Timestamps sempre em UTC

### Nomenclatura

- Arquivos: `kebab-case.ts`
- Componentes React: `PascalCase.tsx`
- Funções: `camelCase`
- Constantes de ambiente: `SCREAMING_SNAKE_CASE`
- Tabelas do banco: `snake_case` (plural)
- Colunas do banco: `snake_case`

---

## 10. Fluxo de processamento do webhook (passo a passo)

**REGRA CRÍTICA: o webhook deve retornar 200 ANTES de qualquer processamento pesado.**
O WhatsApp reenvia o webhook se não receber 200 em até 5 segundos.

```
POST /api/whatsapp/webhook recebido:

1. Validar header x-webhook-secret → se inválido, retornar 401
2. Retornar Response.json({ ok: true }, { status: 200 }) IMEDIATAMENTE

--- tudo abaixo acontece de forma assíncrona (sem await no retorno) ---

3. Parsear payload → identificar tipo (text | audio) e extrair phoneNumber
4. Checar deduplicação: raw_whatsapp_id já existe em messages? → ignorar se sim
5. Buscar worker pelo phoneNumber + company
6. Se worker não encontrado → ignorar silenciosamente
7. Buscar investigation_worker com status 'active' para este worker
8. Se não encontrar investigation ativa → ignorar

9. Se mensagem de ÁUDIO:
   a. Baixar arquivo da URL do WhatsApp
   b. Upload para Supabase Storage (bucket: audio-messages)
   c. Chamar Whisper → obter transcript (verbose_json)
   d. Avaliar qualidade com isTranscriptionReliable()
   e. Se não confiável E retry_count < 2:
      → Salvar message com transcription_status: 'failed', incrementar retry_count
      → Enviar mensagem de retry para o worker
      → Parar processamento
   f. Se não confiável E retry_count >= 2:
      → Salvar message com transcription_status: 'permanently_failed'
      → Continuar sem o conteúdo desta mensagem
   g. Se confiável:
      → Salvar message com content = transcript, transcription_status: 'success'

10. Se mensagem de TEXTO:
    → Salvar message com content = texto, transcription_status: 'not_applicable'

11. Construir crossValidationContext:
    → Agregar key_points_extracted de mensagens inbound de OUTROS workers desta investigação
    → Não incluir identificação de quem disse nada

12. Chamar runInvestigationEngine()

13. Se action = 'ask_question':
    a. Salvar key_points_extracted na mensagem inbound
    b. Atualizar saturation_score em investigation_workers
    c. Salvar outbound message no banco
    d. Chamar WhatsApp sender com next_question

14. Se action = 'mark_saturated':
    a. Salvar key_points_extracted na mensagem inbound
    b. Atualizar investigation_worker.status = 'saturated'
    c. Verificar se TODOS os workers estão 'saturated' ou 'unresponsive'
    d. Se sim:
       → Atualizar investigation.status = 'saturated'
       → Chamar generateReport()
       → Salvar relatório na tabela reports
       → Atualizar investigation.status = 'completed', completed_at = now()
```

---

## 11. O que nunca fazer

- **Nunca** expor `whatsapp_number` de workers em respostas de API ou logs
- **Nunca** usar o nome real do worker em mensagens ou relatórios (sempre `anonymous_alias`)
- **Nunca** salvar `SUPABASE_SERVICE_ROLE_KEY` ou chaves de API em código-fonte
- **Nunca** fazer chamadas à Anthropic API ou OpenAI diretamente de componentes client
- **Nunca** commitar `.env.local`
- **Nunca** desabilitar RLS de uma tabela sem discussão explícita
- **Nunca** atribuir resposta de um worker a outro worker nas perguntas de validação cruzada
- **Nunca** retornar status diferente de 200 para o webhook do WhatsApp (vai reenviar)
- **Nunca** usar `console.log` em produção para dados de workers — usar `console.error` apenas para erros
- **Nunca** retornar o 200 do webhook depois de processamento pesado — retornar ANTES e processar assincronamente

---

## 12. Sequência de desenvolvimento recomendada

1. ✅ Setup do projeto Next.js + Supabase + variáveis de ambiente
2. ✅ Migration SQL do schema completo no Supabase + tipos TypeScript
3. ✅ Clientes Supabase (browser client + server client)
4. ✅ Parser e tipos do WhatsApp
5. ✅ WhatsApp sender
6. ✅ Pipeline de áudio (download → Storage → Whisper → transcript + fallback)
7. Engine de investigação (`lib/ai/investigation-engine.ts` + prompts)
8. Gerador de relatório (`lib/ai/report-generator.ts`)
9. Webhook receptor — integração de tudo
10. Dashboard: autenticação (Supabase Auth)
11. Dashboard: cadastro de workers
12. Dashboard: criar investigação + selecionar workers
13. Dashboard: visualizar investigação em andamento (Realtime)
14. Dashboard: visualizar relatório final
15. Landing page (por último)
