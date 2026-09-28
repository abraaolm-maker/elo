# CLAUDE.md — Projeto Elo

> Este arquivo é a fonte da verdade do projeto. Leia-o integralmente antes de qualquer tarefa.
> Toda decisão de arquitetura, nomenclatura e regra de negócio está documentada aqui.
>
> **Revisado em 28/09/2026** contra o código real. A versão anterior descrevia
> Supabase/PostgreSQL com RLS e Supabase Auth — nada disso existe no projeto. O banco é
> Turso/libSQL via Drizzle, a autenticação é JWT próprio, e o isolamento entre empresas
> é feito em código, não por política do banco. Ver §4.4.

---

## 1. O que é o Elo

**Elo** é um SaaS B2B de inteligência operacional para empresas industriais brasileiras (construção civil, manufatura, logística).

O produto resolve o seguinte problema: gestores não conseguem descobrir a causa raiz de problemas operacionais porque o conhecimento real está com quem está no chão — operadores, mestres de obras, encarregados — e a comunicação entre esses níveis hierárquicos é falha, lenta ou politicamente contaminada.

**Como funciona em uma frase:** o gestor descreve um problema conversando com a IA → a IA formula perguntas adaptadas por cargo → cada participante responde pelo portal web (link + CPF) → a IA aprofunda até saturação → valida cruzando fontes anonimamente → o gestor encerra e gera dois relatórios: um para a liderança e uma devolutiva para quem participou.

### O que o MVP faz

- Gestor cria a investigação **conversando com a IA** (não é formulário): a IA coleta contexto da empresa, entende o problema e cadastra os participantes
- A IA gera um `investigation_context` que calibra o vocabulário e o foco de todas as perguntas seguintes
- Cada participante recebe um link e entra com CPF — sem instalar nada, sem senha
- A IA entrevista cada um separadamente, uma pergunta por vez
- Quando uma fonte aponta a causa X, a IA pergunta indiretamente sobre X às outras (validação cruzada, sem revelar quem disse)
- A IA pontua saturação (0–100) a cada resposta e decide entre aprofundar ou encerrar aquela fonte
- Quando todos saturam, a investigação **para** e espera o gestor decidir encerrar
- O gestor clica em encerrar → o relatório é montado em etapas, com barra de progresso e painel de conferência
- Dois documentos: relatório gerencial (identifica as fontes) e devolutiva (não atribui nada a ninguém)
- Exportação em PDF de ambos
- Painel admin para o fundador: empresas, gestores, investigações, custos de IA e saúde do sistema

### O que o MVP NÃO faz (não implementar agora)

- Onboarding automatizado (feito manualmente pelo fundador)
- WhatsApp e áudio ligados em produção (ver §11.1 — decisão consciente)
- Dashboard analítico com gráficos e histórico
- Notificações por e-mail em fluxo normal (só recuperação de senha)
- Integração com ERP ou outros sistemas
- Aplicativo mobile
- Múltiplos idiomas
- Testes automatizados (ver §11.1)

---

## 2. Tech Stack

| Camada | Tecnologia | Justificativa |
|---|---|---|
| Framework | Next.js 16 (App Router) | Frontend + API routes no mesmo projeto |
| Linguagem | TypeScript (strict mode) | Obrigatório em todo o projeto |
| Banco | **Drizzle ORM + Turso (libSQL)** | Mesmo código em dev (arquivo SQLite) e produção (Turso). Sem Docker, sem serviço externo |
| Autenticação | **JWT próprio via `jose`**, cookie httpOnly | ~90 linhas, zero dependência de provedor |
| IA / LLM | Anthropic Claude API (`claude-sonnet-4-6`) | Engine de investigação e geração de relatório |
| Transcrição | OpenAI Whisper API | Implementado, desligado em produção (§11.1) |
| WhatsApp | Meta Cloud API (Graph v19) | Implementado, desligado em produção (§11.1) |
| Telegram | Bot API | Canal alternativo implementado |
| Estilização | Tailwind CSS + componentes próprios em `components/ui` | Sem shadcn instalado; os componentes foram escritos à mão |
| PDF | `window.print()` + CSS de impressão | Sem biblioteca. Ver §9.3 |
| Deploy | Vercel | **Plano Hobby: teto de 60s por função** — restrição que molda o desenho da geração de relatório |
| Pacotes | pnpm | — |

### Versões fixas (não atualizar sem decisão explícita)

```json
{
  "next": "16.x (instalado: 16.2.9 — decisão consciente)",
  "typescript": "5.x",
  "drizzle-orm": "0.x",
  "@libsql/client": "0.17.x",
  "@anthropic-ai/sdk": "0.x",
  "jose": "5.x",
  "bcryptjs": "2.x"
}
```

### Scripts

```bash
pnpm dev        # servidor de desenvolvimento
pnpm build      # build de produção
pnpm migrate    # tsx lib/db/migrate.ts
pnpm seed       # tsx lib/db/seed.ts
```

---

## 3. Estrutura de pastas (real)

```
elo/
├── CLAUDE.md                       ← este arquivo
├── .env.local                      ← não commitar
├── data/elo.db                     ← SQLite local (dev). Em produção: Turso
├── drizzle/                        ← migrations geradas pelo drizzle-kit
│
├── app/
│   ├── (auth)/                     ← login, esqueci-senha, redefinir-senha
│   ├── (dashboard)/                ← área do gestor (protegida)
│   │   ├── investigations/
│   │   │   ├── new/ChatInvestigacao.tsx   ← criação por conversa com a IA
│   │   │   └── [id]/page.tsx             ← detalhe + orquestração da geração
│   │   ├── reports/[id]/page.tsx
│   │   ├── workers/ · perfil/
│   ├── (admin)/admin/              ← painel do fundador
│   │   ├── companies/ · managers/ · investigations/
│   │   ├── relatorios/[id]/ · saude/
│   ├── worker/[token]/page.tsx     ← portal do participante (público, entra por CPF)
│   └── api/
│       ├── auth/                   ← login, logout, esqueci-senha, redefinir-senha
│       ├── investigations/
│       │   ├── chat/route.ts       ← ★ criação da investigação por entrevista
│       │   └── [id]/{start,finalizar,participants}/
│       ├── reports/[investigationId]/
│       │   ├── route.ts            ← geração em uma tacada (legado)
│       │   ├── fase/route.ts       ← ★ geração em etapas
│       │   ├── plano/ · evidencias/ · devolutiva/
│       ├── worker/[token]/         ← auth por CPF, messages, audio
│       ├── admin/                  ← companies, managers, investigations, stats, erros, plans
│       ├── whatsapp/ · telegram/ · baileys/   ← webhooks de canal
│       └── setup/route.ts          ← migrations em produção, protegida por SETUP_SECRET
│
├── lib/
│   ├── db/         schema.ts · index.ts · migrate*.ts · seed.ts · create-admin.ts
│   ├── auth/       session.ts (JWT) · middleware.ts (requireAuth/requireAdmin)
│   ├── ai/         investigation-engine · prompts · report-phases · report-input
│   │               report-generator · worker-report-generator · action-plan-generator
│   │               evidence-generator · context-generator · cost-tracker · sanitize
│   │               utils.ts (parseAIJson) · types.ts
│   ├── security/   rate-limit.ts · cpf.ts
│   ├── monitoring/ logger.ts
│   ├── billing/    plan-limits.ts
│   ├── investigations/ saturation.ts
│   ├── hooks/      use-live-refresh.ts
│   ├── utils/      date.ts · env.ts
│   ├── whatsapp/ · telegram/ · audio/ · email/
│
└── components/
    ├── ui/                ← escritos à mão, podem ser editados
    ├── investigations/    InvestigationDetail · ProgressoGeracao · LiveIndicator
    ├── reports/           ReportView · ReportPrintable · DevolutivaPrintable
    │                      DevolutivaSection · ExportPdfButton
    └── workers/
```

`baileys-service/` e `wppconnect-service/` são serviços separados, **desativados** —
causavam banimento de número. Não usar.

---

## 4. Modelo de dados

O banco é **SQLite (Turso/libSQL) via Drizzle**. Três consequências práticas:

- **Não existe `jsonb`.** Todo JSON é gravado como `text` e parseado na leitura.
  Use `parseJsonSafe` / `parseJsonField` em vez de confiar no valor.
- **Não existe `timestamptz`.** Datas são `text` em ISO 8601, sempre UTC.
  Para exibir, use `lib/utils/date.ts` — nunca formate data direto no componente.
- **Não existe RLS.** Ver §4.4.

A definição canônica está em **`lib/db/schema.ts`** — este arquivo é o contrato.
O resumo abaixo existe para orientação; em caso de divergência, o schema vence.

### 4.1 Tabelas de domínio

```
companies ──< managers              gestores; login e-mail + senha (bcrypt)
          ──< workers               participantes; sem login, entram por link + CPF
          ──< investigations ──< investigation_workers ──< messages
                             ──< reports ──< action_items
                             ──< worker_reports
```

**`companies`** — `id, name, plan, created_at`. `plan` referencia `plan_configs.plan`.

**`managers`** — `password_hash` (bcrypt), `is_admin`, `is_active`, e
`company_context` (JSON: `{company_description, sector, manager_position}`), coletado
uma vez pela IA e reutilizado nas investigações seguintes.

**`workers`** — `name`, `full_name`, `role`, `role_description`, `anonymous_alias`,
`whatsapp_number`, `cpf_hash`.
- `cpf` (texto plano) é **legado**. Existe só para a migração preguiçosa em
  `app/api/worker/[token]/route.ts`: no primeiro acesso o CPF vira hash e o campo
  plano é apagado. **Nunca comparar CPF por este campo** — use `verificarCpf()` de
  `lib/security/cpf.ts`.
- `whatsapp_number` pode começar com `portal:` — é o placeholder de quem só usa o
  portal web. Código que envia mensagem precisa checar esse prefixo.

**`investigations`** — `title`, `problem_description`, `status`,
`investigation_context` (JSON gerado por IA na criação: domínio, persona do
entrevistador, categorias de Ishikawa relevantes, vocabulário, sondagens específicas).

**`investigation_workers`** — a participação de alguém numa investigação.
- `saturation_score` (0–100), atualizado pela IA a cada resposta
- `access_token` — UUID gerado ao iniciar; é a chave do link do portal
- `pending_hints` (JSON) — o que precisa ser confirmado com esta fonte, vindo de outras
- `manager_notes` — observações do gestor sobre aquele participante
- `first_accessed_at` — registra se a pessoa chegou a abrir o link

**`messages`** — `direction` (`outbound` = sistema→pessoa, `inbound` = pessoa→sistema),
`content`, `content_type`, `key_points_extracted` (JSON: `string[]`),
`transcription_status`, `retry_count`, `raw_whatsapp_id` (único, deduplicação).

**`reports`** — o relatório gerencial. Campos exclusivos dele: `evidence_map`,
`divergences`, `sensitive_observations`. Ver §10.2.

**`action_items`** — plano de ação em 5W2H + priorização por impacto × esforço +
`timeframe` e `priority_rank`. `status` do gestor: `suggested | in_progress | done | dismissed`.

**`worker_reports`** — a devolutiva. Tabela separada de `reports` de propósito: outro
conteúdo, outro público, e nenhuma atribuição.

### 4.2 Tabelas de infraestrutura

| Tabela | Para quê |
|---|---|
| `plan_configs` | Limites por plano: investigações, teto de custo em BRL, perguntas por participante. `-1` = ilimitado |
| `api_usage_logs` | Tokens e custo de cada chamada de IA, por empresa e investigação |
| `rate_limits` | Rate limiting persistido. Ver §9.4 |
| `error_logs` | Erros e avisos. Ver §9.5 |
| `password_resets` | Token **hasheado**; o valor cru só existe no link enviado |

### 4.3 Migrations

Dois caminhos, ambos em uso:

- **Local:** `pnpm migrate` (`lib/db/migrate.ts`) e os scripts `migrate-*.ts` para
  alterações pontuais.
- **Produção:** `GET /api/setup?secret=...`, protegida por `SETUP_SECRET` com
  comparação de tempo constante. Executa DDL idempotente — erros de "coluna já existe"
  são tratados como sucesso.

Ao acrescentar coluna, o código de leitura precisa **tolerar a ausência dela**. Vários
pontos do sistema fazem `try/catch` na leitura justamente porque a coluna pode ainda
não existir no ambiente. Siga esse padrão.

### 4.4 Isolamento entre empresas — é responsabilidade do código

**SQLite não tem Row Level Security.** Não existe rede de proteção no banco: se uma
query esquecer o filtro de empresa, os dados vazam entre clientes.

Regra sem exceção: **toda query que toca dado de cliente filtra por `company_id`
vindo da sessão**, nunca de parâmetro da requisição.

```ts
const session = await requireAuth(request)

const investigation = await db
  .select()
  .from(schema.investigations)
  .where(and(
    eq(schema.investigations.id, id),
    eq(schema.investigations.company_id, session.companyId),   // ← obrigatório
  ))
  .get()
```

Para tabelas sem `company_id` direto (`messages`, `reports`, `action_items`), o filtro
vem por join com `investigations`, ou valide a investigação antes e use o id dela.

`requireAdmin()` é a única forma de escapar do filtro, e só nas rotas sob `/api/admin`.

---

## 5. Variáveis de ambiente

```bash
# ─── Obrigatórias ───────────────────────────────────────────────────────────
JWT_SECRET=                      # assina o cookie de sessão
ANTHROPIC_API_KEY=sk-ant-...

# ─── Banco (ausentes = SQLite local em data/elo.db) ─────────────────────────
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=

# ─── Operação ───────────────────────────────────────────────────────────────
SETUP_SECRET=                    # libera GET /api/setup. Rotacionar após usar
USD_BRL_RATE=5.8                 # câmbio para converter custo de IA (default 5.8)
NODE_ENV=development

# ─── Canais (desligados no MVP — ver §11.1) ─────────────────────────────────
OPENAI_API_KEY=                  # Whisper
WHATSAPP_ACCESS_TOKEN=           # Meta Cloud API
WHATSAPP_PHONE_NUMBER_ID=
TELEGRAM_BOT_TOKEN=

# ─── Opcionais ──────────────────────────────────────────────────────────────
RESEND_API_KEY=                  # sem isto, o link de redefinição vai para o log
EMAIL_FROM=
SENTRY_DSN=
```

### Regras

- `NEXT_PUBLIC_*` → acessível no browser. Nunca colocar segredo aqui.
- Tudo sem `NEXT_PUBLIC_` → apenas server-side.
- **Leia env sempre por `env('NOME')` de `lib/utils/env.ts`**, nunca por
  `process.env` direto. A Vercel às vezes grava a variável com BOM (`ï»¿`), e o
  helper remove isso e apara espaços. Já causou falha de conexão difícil de achar.

---

## 6. Regras de negócio — o coração do produto

### 6.0 Base metodológica — por que o produto funciona assim

O Elo não inventou nenhuma metodologia. Ele automatiza e escala o que engenheiros de qualidade e consultores de melhoria operacional já fazem manualmente há décadas. Cada decisão de como a IA se comporta tem uma metodologia validada por trás.

| Metodologia | Origem | Onde o Elo aplica |
|---|---|---|
| **5 Porquês** | Toyota / Taiichi Ohno, 1950s | O modelo de saturação — a IA continua perguntando "por quê?" até chegar à causa raiz |
| **Diagrama de Ishikawa** | Kaoru Ishikawa / TQM, 1960s | A IA estrutura a investigação pelas 6 categorias e adapta perguntas por cargo dentro delas |
| **8D Problem Solving** | Ford, 1980s | O fluxo D1 (definir equipe) → D2 (descrever problema) → D4 (causa raiz) → D8 (relatório). O Elo automatiza D1 a D4 |
| **Método Delphi** | RAND Corporation, 1950s | A validação cruzada — múltiplas fontes respondem anonimamente, a IA itera sem revelar quem disse o quê |
| **Triangulação de dados** | Norman Denzin, 1970s | O nível de confiança sobe quando fontes independentes convergem sem terem se comunicado |
| **Saturação teórica** | Glaser & Strauss, 1967 | O critério de parada — para quando novas respostas deixam de acrescentar informação, não ao atingir um número fixo |
| **Gemba Walk** | Toyota / Lean, 1950s | O Elo é o Gemba Walk digital: em vez de o gestor ir ao chão, a IA vai até quem executa |
| **Maiêutica Socrática** | Sócrates | A IA não diz qual é o problema — faz perguntas que levam a pessoa à resposta. O conhecimento já está nela |
| **Andon System** | Toyota, 1960s | Quem executa tem voz para sinalizar problema, sem passar por hierarquia |
| **Kaizen / PDCA** | Deming / Masaaki Imai | O Elo automatiza o "C" do PDCA com dado real |

**Implicações práticas:**

1. A IA **nunca dá a resposta** à pessoa entrevistada — sempre pergunta. (Maiêutica)
2. A IA **nunca para** por número fixo de perguntas — para quando a informação deixa de crescer. (Saturação teórica)
3. A IA **nunca revela** o que outra fonte disse ao formular perguntas de validação cruzada. (Delphi)
4. O relatório **sempre categoriza** pelas dimensões de Ishikawa, mesmo com categorias vazias.
5. O **nível de confiança** reflete convergência entre fontes independentes, não quantidade de respostas. (Triangulação)

### 6.1 Fluxo de uma investigação

```
PENDING → ACTIVE → SATURATED → COMPLETED
                ↘ CANCELLED (gestor cancela)
```

1. Gestor conversa com a IA em `/investigations/new`; ao final a investigação nasce em `pending` com os participantes já cadastrados
2. Gestor clica em "Iniciar" → `POST /api/investigations/[id]/start`:
   - status vira `active`
   - cada `investigation_worker` ganha um `access_token` (UUID)
   - a IA gera a primeira pergunta de cada participante, em paralelo
3. A pessoa abre o link `/worker/[token]`, entra com CPF e responde
4. A cada resposta (`POST /api/worker/[token]/messages`), a engine:
   - extrai `key_points_extracted`
   - atualiza `saturation_score`
   - decide entre `ask_question` e `mark_saturated`
   - grava `cross_validation_hints` em `pending_hints` das outras fontes
5. Quando todos estão `saturated` ou `unresponsive`,
   `marcarSaturadaSeTodosTerminaram()` move a investigação para `saturated` — **e para**
6. O gestor encerra e gera o relatório manualmente (§10.1)

O gestor pode **acrescentar participante com a investigação em andamento**
(`POST /api/investigations/[id]/participants`), desde que não esteja finalizada.

### 6.2 Saturação — critério de parada

`saturation_score` de 0 a 100, atualizado pela IA a cada resposta:

- **0–30:** poucas informações, continuar perguntando
- **31–60:** informações parciais, aprofundar
- **61–85:** informações substanciais, uma ou duas perguntas de confirmação
- **86–100:** saturação atingida, marcar como `saturated`

Baseado em: especificidade da resposta, coerência interna das respostas da mesma
pessoa, e convergência com outras fontes.

Existe também um teto **duro** por plano: `plan_configs.max_questions_per_worker`.
Quando atingido, a fonte é saturada independentemente do score. É proteção de custo,
não critério metodológico.

### 6.3 Validação cruzada — sem expor identidades

Quando a fonte A (mestre de obras) diz que "o problema é falta de material X":

1. O sistema **não** diz ao engenheiro "o mestre disse que falta material X"
2. Envia uma pergunta indireta: "Como estava a disponibilidade de insumos nesse período?"
3. A comparação acontece internamente, na IA
4. O relatório mostra a convergência

Na implementação, a engine recebe dois campos distintos:

- `reportedFacts` — `key_points_extracted` agregados das **outras** fontes: o que já foi dito
- `pendingValidations` — `cross_validation_hints`: o que precisa ser confirmado

Nenhum dos dois carrega quem disse, o cargo de quem disse, nem o número.

**Regra absoluta:** o conteúdo de uma resposta nunca é atribuído a uma pessoa
específica nas mensagens enviadas a outras pessoas.

### 6.4 Anonimato — o que ele significa exatamente

Esta seção foi corrigida. A regra antiga dizia que o nome real nunca aparece em
relatório nenhum, e isso **não é mais verdade** para o relatório gerencial.

| Onde | Identifica? |
|---|---|
| Perguntas enviadas às outras fontes | **Nunca.** Nem nome, nem alias, nem cargo |
| Payload enviado à IA | **Nunca.** A IA só recebe alias e cargo |
| O que fica gravado em `reports` | **Nunca.** Só alias |
| Relatório gerencial, ao exibir | **Sim** — nome e cargo. Decidir exige saber quem observou o quê |
| Devolutiva aos participantes | **Nunca**, por nenhuma via. Ver §10.2 |

Como isso funciona sem gravar o nome: ver §10.2, "O nome real nunca é gravado nem
enviado à IA".

Continuam valendo sem exceção:
- `whatsapp_number` **nunca** aparece em tela, resposta de API ou log
- CPF **nunca** é comparado em texto plano nem registrado em log
- O alias é fixo por empresa, gerado na ordem de cadastro, e não muda entre investigações

**Geração do alias** (`gerarAliasWorker` em `app/api/investigations/chat/route.ts`):
`Colaborador A`…`Colaborador Z`, e depois duas letras (`Colaborador AA`). O índice é a
contagem de workers já existentes na empresa.

### 6.5 Perguntas adaptadas por cargo

O Elo não define cargos fixos. Cada empresa cadastra os seus com descrição livre, e a
IA infere o foco das perguntas — sem hardcode de setor.

- `role`: nome do cargo como a empresa usa
- `role_description`: responsabilidades em texto livre

Somado a isso, `investigations.investigation_context` (gerado por
`lib/ai/context-generator.ts` na criação) traz domínio, persona do entrevistador,
vocabulário e sondagens específicas do setor. É o que faz a mesma engine soar
diferente numa obra e numa linha de produção.

**Regras para a engine:**

1. Perguntar apenas sobre o que a descrição do cargo sugere que a pessoa enxerga
2. Usar linguagem compatível com o nível de responsabilidade descrito
3. Nunca perguntar sobre algo claramente fora do escopo do cargo
4. Se a descrição for vaga, fazer perguntas mais abertas

---

## 7. Integrações externas

### 7.1 Portal do trabalhador — o canal do MVP

É como as pessoas respondem hoje. Não requer WhatsApp nem instalação.

```
GET  /api/worker/[token]            → dados da tela de login (sem autenticar)
POST /api/worker/[token]            → autentica por CPF, devolve histórico
POST /api/worker/[token]/messages   → envia resposta, roda a engine
POST /api/worker/[token]/audio      → envia áudio (desligado, sem OPENAI_API_KEY)
```

O `token` é o `access_token` do `investigation_worker`, gerado ao iniciar. O CPF é
o segundo fator. Há rate limit **por token e por IP** (`RULES.workerCpf`): sem os
dois, quem tivesse um link válido poderia iterar CPFs.

### 7.2 Anthropic Claude API

**Modelo:** sempre `claude-sonnet-4-6`. Não usar Opus (caro) nem Haiku (qualidade
insuficiente).

Padrão:

```ts
import Anthropic from '@anthropic-ai/sdk'
import { env } from '@/lib/utils/env'

const client = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY') })

const response = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  system: SYSTEM_PROMPT,
  messages: [{ role: 'user', content: JSON.stringify(payload) }],
})
```

Obrigatório em toda chamada:

1. `export const maxDuration = 60` no topo do arquivo da rota (§9.1)
2. `logUsage()` de `lib/ai/cost-tracker.ts` — sem isso o custo fica invisível
3. `parseAIJson<T>()` de `lib/ai/utils.ts` para ler a saída
4. Checar `canSpendOnAi(companyId)` antes, quando a chamada é disparada por ação de usuário

Os prompts ficam em `lib/ai/prompts.ts` e em `lib/ai/report-phases.ts`. **Nunca inline
em API route** — a única exceção é o prompt do chat de criação, que é montado por fase
e vive junto da rota por depender do estado do rascunho.

### 7.3 WhatsApp (Meta Cloud API) — implementado, desligado

```
POST https://graph.facebook.com/v19.0/{WHATSAPP_PHONE_NUMBER_ID}/messages
```

`sendWhatsAppMessage()` retorna `{success:false}` e segue adiante quando não há
credencial. Números com prefixo `portal:` são ignorados no envio.

**Baileys e WPPConnect foram removidos — causavam banimento do número.** As pastas
`baileys-service/` e `wppconnect-service/` continuam no repositório mas não são usadas.

**Deduplicação:** sempre checar `raw_whatsapp_id` antes de processar. O campo é UNIQUE.

### 7.4 Whisper — implementado, desligado

`lib/audio/transcriber.ts`. Sem `OPENAI_API_KEY` a chamada falha com 401 e o áudio é
perdido. Regras do fallback: no máximo 2 retries por mensagem; na terceira falha,
`transcription_status: 'permanently_failed'` e a investigação segue sem aquela resposta.
A mensagem de retry nunca culpa quem respondeu e sempre oferece a alternativa por texto.

---

## 8. Prompts de IA

### 8.1 Papéis invertidos — a regra que mais quebra

**Leia isto antes de escrever ou alterar qualquer prompt de conversa.**

Na API da Anthropic o turno do humano tem `role: 'user'`, e o modelo é treinado para
tratar isso como alguém pedindo ajuda. No Elo os papéis estão invertidos: **quem
pergunta é a IA; o humano responde.**

Sem instrução explícita, a IA abre a resposta com "Ótima pergunta!", "Excelente
ponto!", "Que bom que você trouxe isso!" — elogiando uma pergunta que nunca existiu.
Soa artificial e derruba a credibilidade da entrevista.

Duas camadas resolvem:

1. **Bloco no system prompt** — texto completo em `app/api/investigations/chat/route.ts`,
   sob o título `PAPÉIS INVERTIDOS`. Copie ao criar prompt de conversa novo.
2. **`limparPreambulo()`** de `lib/ai/sanitize.ts` — filtro determinístico aplicado à
   saída. O prompt reduz a frequência; o filtro garante.

Use as duas. Uma só não basta.

### 8.2 Saída em JSON

Todo prompt do Elo retorna JSON puro — sem markdown, sem texto fora do objeto.

O parse tem tolerância em três níveis (`extrairJSON` na rota de chat, `parseAIJson` em
`lib/ai/utils.ts`): parse direto → remove cerca de markdown → extrai do primeiro `{`
ao último `}`. Na rota de chat há ainda uma segunda chamada à IA só para reformatar o
texto em JSON, antes de desistir.

Ao escrever prompt novo, inclua o esqueleto exato do JSON esperado, com todos os
campos e seus `null` padrão. A IA preenche melhor um molde do que uma descrição.

### 8.3 Engine de investigação

Entrada (`InvestigationEngineInput` em `lib/ai/types.ts`):

```ts
{
  problemDescription, workerRole, workerRoleDescription,
  messageHistory: { direction, content }[],
  reportedFacts: string[],        // o que outras fontes já disseram (sem autoria)
  pendingValidations: string[],   // o que precisa ser confirmado com esta fonte
  managerNotes: string,
  investigationContext,           // domínio, persona, vocabulário
  maxQuestionsPerWorker, questionsAsked,
  companyId, managerId, investigationId,   // rastreio de custo
}
```

Saída (`InvestigationEngineOutput`):

```ts
{
  action: 'ask_question' | 'mark_saturated',
  next_question: string,
  saturation_score: number,              // 0-100
  key_points_extracted: string[],
  ishikawa_categories_touched: IshikawaCategory[],
  cross_validation_hints: string[],
}
```

A saída passa por `validateOutput()` antes de ser usada — a IA não é fonte confiável
de estrutura. Falhas de rede têm retry; erro de conteúdo, não.

### 8.4 Prompts de relatório

| Constante | Arquivo | Produz |
|---|---|---|
| `ANALISE_PROMPT` | `report-phases.ts` | causa raiz, confiança, Ishikawa |
| `FONTES_PROMPT` | `report-phases.ts` | resumo por fonte, em lotes |
| `RECOMENDACOES_PROMPT` | `report-phases.ts` | recomendações |
| `ACTION_PLAN_SYSTEM_PROMPT` | `prompts.ts` | plano de ação 5W2H |
| `EVIDENCE_LAYER_SYSTEM_PROMPT` | `prompts.ts` | mapa de evidências, divergências, observações sensíveis |
| `WORKER_REPORT_SYSTEM_PROMPT` | `prompts.ts` | devolutiva |
| `REPORT_GENERATOR_SYSTEM_PROMPT` | `prompts.ts` | geração em uma tacada (legado) |

`REGRAS_COMUNS` em `report-phases.ts` é compartilhado por todas as fases: identificação
por alias exato, escrita densa, JSON puro.

---

## 9. Restrições de plataforma e as decisões que elas forçaram

### 9.1 Teto de 60s por função na Vercel

**Toda rota que chama IA precisa de `export const maxDuration = 60` na primeira linha.**

O default da Vercel é 10s. A rota de geração de relatório ficou sem esse export e
morria aos 10s — **antes de entrar no `catch`**, o que deixava a falha invisível nos
logs e entregava ao usuário um "Erro de conexão" que não apontava para nada.

Rotas que hoje declaram: todas sob `api/reports/`, `api/worker/[token]/{messages,audio}`,
`api/investigations/[id]/{start,participants}`, `api/admin/investigations/[id]/reprocess`.

### 9.2 Geração de relatório em etapas

Mesmo com 60s, o relatório inteiro não cabe numa execução — o gargalo é a geração de
tokens de saída.

A saída errada seria encurtar a entrada. Decisão do fundador, registrada:

> "divida em quantas vezes for necessário, mas não quero perder nenhum dado de entrada
> ou saída por causa de limite de tempo"

Então **nada é truncado; o trabalho é que é dividido.** Cada etapa recebe as conversas
por inteiro, é uma requisição própria, grava o que produziu, e pode ser refeita sozinha.

A orquestração é **no cliente**, em `components/investigations/InvestigationDetail.tsx`:

```
finalizar (se ainda ativa)
  → fase: analise                    obrigatória — falhou, para tudo
  → fase: fontes (lotes de 2)        a única que cresce com o nº de participantes
  → fase: recomendacoes              obrigatória — conclui a investigação
  → /plano                           complementar — falhar não invalida
  → /evidencias                      complementar — falhar não invalida
```

Duas proteções que não devem ser removidas:

- Se `stop_reason === 'max_tokens'`, a fase **lança erro e não grava nada**. Gravar
  meio relatório sem ninguém notar é pior do que falhar visivelmente.
- Cada fase devolve `diagnostico` (mensagens enviadas, caracteres, tokens de entrada
  e saída) que `ProgressoGeracao.tsx` exibe com painel de conferência comparando o que
  há no banco com o que foi enviado à IA.

### 9.3 PDF por impressão do navegador

Sem biblioteca: `ReportPrintable` e `DevolutivaPrintable` renderizam em portal para
`document.body` e um `@media print` esconde o resto. `ExportPdfButton` define
`document.title` (vira o nome do arquivo) e `document.body.dataset.imprimir` (escolhe
qual documento sai).

Armadilhas já pagas, **não repetir**:

- `@page :first` com margem diferente faz o Chrome calcular a largura errado e cortar
  o conteúdo nas laterais. Use `@page { margin: 0 }` uniforme e
  `box-decoration-break: clone` no bloco de página.
- `min-height: 297mm` numa folha de 297mm transborda por arredondamento e gera página
  em branco. Não fixar altura.
- Seção que passa da folha por poucos milímetros joga **só o rodapé** para a página
  seguinte. O rodapé leva `break-before: avoid`.

### 9.4 Rate limit no banco, não em memória

A Vercel roda múltiplas instâncias serverless. Um contador em memória é por instância:
as tentativas se distribuem e o limite nunca dispara.

`lib/security/rate-limit.ts` persiste em `rate_limits`. Regras em `RULES`:
`login`, `workerCpf`, `aiChat`, `passwordReset`. Falha do banco é **fail-open** — é
preferível aceitar a requisição a derrubar o login de todos por indisponibilidade do
rate limiter.

### 9.5 Log de erro no banco

`console.error` em serverless se perde. Use `logError` / `logWarn` de
`lib/monitoring/logger.ts`; gravam em `error_logs` e aparecem em `/admin/saude`.
Nunca passe dado de trabalhador no `context`.

### 9.6 Teto de custo verificado durante a execução

`canCreateInvestigation()` na criação **não basta**: cada resposta dispara uma chamada
ao Claude, e uma investigação já em andamento ultrapassaria o teto indefinidamente.
Por isso existe `canSpendOnAi()`, chamado antes de cada chamada de IA.

Preço em `lib/ai/cost-tracker.ts`: US$ 3,00/milhão de tokens de entrada e US$ 15,00/milhão
de saída, convertidos por `USD_BRL_RATE` (default 5,8).

### 9.7 Atualização ao vivo que sobrevive a erro

O acompanhamento usava `setTimeout` de uma vez só: uma falha de rede matava o polling
**permanentemente** e a tela congelava sem avisar. Use `useLiveRefresh`
(`lib/hooks/use-live-refresh.ts`), que reagenda inclusive depois de erro.

### 9.8 Datas

Tudo é gravado em UTC como texto ISO. **Formate sempre por `lib/utils/date.ts`.**
Formatar direto no componente já produziu horário três horas à frente em tela.

---

## 10. Relatórios

### 10.1 Geração sempre manual

**Nenhum fluxo automático envia as conversas para a IA.** A coleta encerra em
`saturated` e espera o gestor.

Isso é deliberado. Antes o relatório era gerado sozinho ao saturar, e isso tirava de
quem conduz a decisão de encerrar: o gestor podia querer incluir mais um participante,
reler as conversas, ou só conferir o que foi coletado. Gerar sozinho também queimava
cota de IA do cliente sem que ele tivesse pedido.

`generateReport()` e `generateWorkerReport()` só podem ser chamados a partir destas
rotas, todas acionadas por clique:

| Rota | Origem |
|---|---|
| `POST /api/reports/[investigationId]` | Botão "Gerar relatório" (tela de relatório) |
| `POST /api/reports/[investigationId]/fase` | Etapas do botão "Encerrar e gerar" |
| `POST /api/reports/[investigationId]/{plano,evidencias}` | Etapas complementares |
| `POST /api/reports/[investigationId]/devolutiva` | Botão "Gerar devolutiva" |
| `POST /api/admin/investigations/[id]/reprocess` | Botão "Reprocessar" (admin) |

**Ao mexer neste fluxo, não reintroduza chamada automática** nas rotas do worker
(`messages`, `audio`) nem nos webhooks. Elas só podem alterar status.

### 10.2 Dois relatórios, dois públicos

| | Gerencial (`reports`) | Devolutiva (`worker_reports`) |
|---|---|---|
| Para quem | Liderança que vai decidir | Quem participou |
| Atribuição | **Nome real** + cargo (alias ao lado, no anexo) | **Nenhuma** |
| Exclusivos | `evidence_map`, `divergences`, `sensitive_observations` | — |
| Pode circular | Não | Sim |

A devolutiva é derivada do gerencial (exige que ele exista) para que as duas versões
contem a mesma história.

**Risco central da devolutiva: identificação por eliminação.** Se um cargo tem uma
pessoa só, mencionar o cargo equivale a dar o nome. Por isso ela não atribui nada —
nem por alias, nem por cargo, nem por detalhe específico (data, número de
equipamento, episódio) que permita deduzir quem falou. Além da instrução no prompt,
`removerAtribuicao()` em `worker-report-generator.ts` faz uma limpeza determinística
antes de gravar.

#### O nome real nunca é gravado nem enviado à IA

O relatório gerencial identifica as fontes, mas o nome não existe em lugar nenhum do
pipeline: a IA recebe só alias e cargo, e é isso que fica em `reports`. A troca por
nome acontece **ao exibir**, em `lib/ai/report-input.ts`:

| Função | Papel |
|---|---|
| `mapaDeNomes(investigationId)` | Lê alias → nome do cadastro (`full_name`, senão `name`) |
| `identificarFontes(dados, nomes)` | Troca o alias por nome em qualquer string, em qualquer profundidade |
| `enriquecerFontes(fontes, nomes)` | Anexa `name` **preservando** o alias |

Aplicado em `app/(dashboard)/reports/[id]/page.tsx` e
`app/api/admin/relatorios/[id]/route.ts`.

Quatro consequências que justificam o desenho:

1. relatórios emitidos antes da identificação passam a mostrar o nome, sem custo de IA;
2. corrigir o cadastro de alguém se reflete em tudo que já foi emitido;
3. a devolutiva deriva do gerencial gravado — como ele só tem alias, não há nome para vazar;
4. nenhum nome de trabalhador trafega para a Anthropic.

`identificarFontes` alcança o alias escrito no meio da prosa, não só os campos
estruturados: era exatamente aí (`evidence_map[].note`, `divergences[].reading`,
`confidence_justification`) que o relatório do gestor continuava dizendo
"Colaborador G". Ela também desfaz o artigo que vinha com o alias —
"o relato do Colaborador G" vira "o relato de Lethicia", não "do Lethicia" —
porque "Colaborador" é masculino e a pessoa por trás dele pode não ser.

**Por isso os prompts mandam escrever o alias exato e por extenso.** Se a IA abreviar
("Colab. G") ou inventar um nome, a troca não acontece. O único lugar que mantém o
alias visível é o anexo de fontes, que é como o gestor cruza o relatório com a
conversa original na plataforma.

### 10.3 Estrutura do relatório gerencial

`components/reports/ReportPrintable.tsx`, sete seções:

```
Capa · 01 Panorama · 02 Como foi feito · 03 Dimensões (Ishikawa)
04 Evidências · 05 Recomendações · 06 Próximos passos · 07 Anexo: Fontes
```

A seção 04 reúne o que só a liderança vê: mapa de evidências (com força
`corroborada | fonte_unica | divergente`), divergências entre fontes e observações
sensíveis.

---

## 11. Convenções de código

### TypeScript

- `strict: true` — sem exceções
- Sem `any` — usar `unknown` com type guard
- Tipos explícitos em parâmetros e retornos de API route
- Enums como const object com `as const`

### API Routes

```ts
export const maxDuration = 60   // se chamar IA — primeira linha do arquivo

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(request)
    const { id } = await params
    // filtrar SEMPRE por session.companyId
    return Response.json({ data: resultado }, { status: 200 })
  } catch (error) {
    if (isUnauthorizedError(error)) return unauthorizedResponse()
    if (isForbiddenError(error)) return forbiddenResponse()
    await logError('api/nome-da-rota', error)
    return Response.json({ error: 'Erro interno' }, { status: 500 })
  }
}
```

Em Next 16, `params` é `Promise` — sempre `await`.

Sucesso: `{ data: ... }`. Erro: `{ error: 'mensagem legível' }`.

### Banco

- Sempre pelo `db` de `lib/db` — nunca criar cliente próprio
- Nunca fazer query de componente client; sempre por API route ou Server Component
- IDs por `crypto.randomUUID()` no código (o SQLite não gera)
- JSON entra com `JSON.stringify` e sai com parse tolerante a falha
- Datas em UTC, ISO 8601

### Nomenclatura

- Arquivos: `kebab-case.ts` · Componentes: `PascalCase.tsx` · Funções: `camelCase`
- Tabelas e colunas: `snake_case` (tabelas no plural)
- Env: `SCREAMING_SNAKE_CASE`
- **Código e comentários em português**, seguindo o que já existe no projeto

### Comentários

O projeto comenta o **porquê**, não o quê. Quase todo comentário existente registra uma
decisão e a razão dela — frequentemente um bug que já aconteceu. Ao alterar código com
comentário desse tipo, verifique se a razão continua válida antes de apagá-lo.

### Ambiente de desenvolvimento (Windows / PowerShell)

- **Nunca** apagar `.next` com o servidor rodando — corrompe o build. Pare, limpe, suba.
- `Set-Content` grava em ANSI por padrão e **destrói acentuação**. Já corrompeu um
  componente inteiro e exigiu restauração via git. Use as ferramentas de edição do
  Claude Code, ou `-Encoding utf8` explícito.
- Aspas e `&&` do PowerShell 5.1 quebram comandos longos. Para mensagem de commit
  multilinha, escreva num arquivo e use `git commit -F arquivo`.

---

## 12. O que nunca fazer

- **Nunca** consultar dado de cliente sem filtrar por `session.companyId`
- **Nunca** expor `whatsapp_number` em resposta de API, tela ou log
- **Nunca** comparar CPF em texto plano — use `verificarCpf()`
- **Nunca** atribuir resposta a uma pessoa nas perguntas de validação cruzada
- **Nunca** deixar nome real chegar à devolutiva, por nenhuma via
- **Nunca** enviar nome real à IA — a identificação é feita ao exibir (§10.2)
- **Nunca** criar rota de IA sem `maxDuration = 60`
- **Nunca** truncar conversa para caber no limite de tempo — divida em etapas
- **Nunca** reintroduzir geração automática de relatório
- **Nunca** ler env por `process.env` direto — use `env()` (BOM da Vercel)
- **Nunca** contar rate limit em memória — a Vercel tem várias instâncias
- **Nunca** commitar `.env.local`
- **Nunca** salvar chave de API em código-fonte
- **Nunca** chamar Anthropic ou OpenAI de componente client
- **Nunca** retornar status diferente de 200 ao webhook do WhatsApp (ele reenvia)
- **Nunca** retornar o 200 do webhook depois do processamento pesado — retorne antes
- **Nunca** usar `console.log` com dado de trabalhador

---

## 13. Decisões de escopo do MVP / free trial

> Registrado em 22/09/2026, durante a preparação do primeiro free trial.

**Canal do MVP: apenas web (portal do trabalhador), apenas texto.**
A pessoa acessa por link + CPF e responde digitando. WhatsApp e áudio ficam desligados
até haver cliente pagante.

| Item adiado | Por quê | O que fazer quando houver cliente |
|---|---|---|
| **Transcrição de áudio (Whisper)** | `OPENAI_API_KEY` não está em produção. Sem ela `transcribeAudio()` falha com 401 e o áudio é perdido | Configurar a chave na Vercel antes de liberar resposta por áudio |
| **Retry / fila de envio WhatsApp** | `sendViaMeta` retorna `{success:false}` e segue, sem retry nem dead-letter. Se a Meta instabiliza, a pergunta não chega e ninguém percebe | Retry com backoff + fila de reenvio antes de vincular o WhatsApp |
| **Testes automatizados** | 32 rotas sem cobertura | Priorizar: limites de plano, autenticação do worker, rate limiting |

**Ao religar WhatsApp ou áudio, revisar estes três pontos antes de subir.**

### Pendências operacionais conhecidas

- Rotacionar `SETUP_SECRET` (foi usado em produção)
- `NEXT_PUBLIC_APP_URL` está com BOM e apontando para o domínio errado
  (`elo.vercel.app` em vez de `elo-ashy.vercel.app`)
- `RESEND_API_KEY` / `EMAIL_FROM` ausentes: o link de redefinição de senha vai para o log
- `SENTRY_DSN` ausente: o monitoramento é só `error_logs` + `/admin/saude`

---

## 14. Por onde começar a ler o código

| Para entender | Leia |
|---|---|
| O produto inteiro em um arquivo | `lib/db/schema.ts` |
| Criação da investigação por conversa | `app/api/investigations/chat/route.ts` |
| Como a IA decide perguntar ou parar | `lib/ai/investigation-engine.ts` + `lib/ai/prompts.ts` |
| Validação cruzada na prática | `app/api/worker/[token]/messages/route.ts` |
| Geração do relatório em etapas | `lib/ai/report-phases.ts` + `components/investigations/InvestigationDetail.tsx` |
| Identificação das fontes ao exibir | `lib/ai/report-input.ts` |
| Layout de impressão | `components/reports/ReportPrintable.tsx` |
| Autenticação | `lib/auth/session.ts` + `lib/auth/middleware.ts` |
