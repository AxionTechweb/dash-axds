import { RETRY_DELAYS_S, WEBHOOK_EVENTS } from "./events";

/**
 * Fonte única da documentação da API pública: a página /docs/api e o
 * /api/v1/openapi.json são gerados daqui. Mudou uma rota? Atualize aqui.
 */

export type Field = { name: string; type: string; required?: boolean; description: string };

export type Endpoint = {
  id: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  tag: string;
  summary: string;
  description: string;
  pathParams?: Field[];
  query?: Field[];
  body?: { fields: Field[]; example: unknown };
  response: { status: number; example: unknown };
  errors?: { status: number; code: string; when: string }[];
};

export const TAGS = ["Conta", "Templates", "Envio", "Campanhas", "Mensagens", "Lista de bloqueio", "Webhook"] as const;

const MESSAGE_EXAMPLE = {
  id: "7f3c2a10-5b1e-4f2a-9d0e-2c6b8a1f4e55",
  message_id: "wamid.HBgNNTUxMTk5OTk5OTk5ORUCABEYEjQ3",
  number: "5511999999999",
  template: "aviso_pedido_v1",
  language: "pt_BR",
  status: "sent",
  error: null,
  campaign_id: null,
  source: "api",
  trigger: "manual",
  scheduled_at: "2026-11-07T15:00:00.000Z",
  sent_at: "2026-11-07T15:00:01.204Z",
};

const CAMPAIGN_EXAMPLE = {
  id: "c1d2e3f4-0000-4a5b-8c9d-0e1f2a3b4c5d",
  label: "Black Friday — alunos",
  template: "convite_bf",
  language: "pt_BR",
  status: "running",
  total: 2,
  scheduled_at: "2026-11-07T15:00:00.000Z",
  finished_at: null,
  canceled_at: null,
  created_at: "2026-11-07T15:00:00.000Z",
};

const NUMBER_FIELD: Field = { name: "number", type: "string", required: true, description: "DDI + DDD + número, só dígitos. Ex.: 5511999999999 (10–11 dígitos sem DDI viram +55)." };
const TEMPLATE_FIELDS: Field[] = [
  { name: "template", type: "string", required: true, description: "Nome exato de um template APROVADO (veja GET /templates)." },
  { name: "language", type: "string", description: "Idioma do template. Padrão: pt_BR." },
];
const NOT_CONNECTED = { status: 409, code: "whatsapp_not_connected", when: "A API oficial não está conectada na área (painel → Integrações)." };
const NOT_FOUND = (what: string) => ({ status: 404, code: "not_found", when: `${what} não existe nesta área.` });

export const ENDPOINTS: Endpoint[] = [
  {
    id: "account",
    method: "GET",
    path: "/account",
    tag: "Conta",
    summary: "Dados da conta",
    description: "Área dona das credenciais, número do WhatsApp conectado e limites da API. Bom para testar as credenciais.",
    response: {
      status: 200,
      example: {
        area: { id: "3b2f1c9e-7a44-4d1b-9c55-1e0f6a2d8b70", name: "Principal" },
        whatsapp: { connected: true, display_phone: "+55 11 90000-0000", waba_id: "123456789012345", phone_number_id: "109876543210987" },
        limits: { requests_per_minute: 120, campaign_max_messages: 500 },
      },
    },
  },
  {
    id: "templates-list",
    method: "GET",
    path: "/templates",
    tag: "Templates",
    summary: "Listar templates",
    description: "Templates da conta na Meta. Por padrão só os aprovados — os únicos que podem ser enviados.",
    query: [{ name: "status", type: "string", description: "APPROVED (padrão), PENDING, REJECTED, PAUSED ou all." }],
    response: {
      status: 200,
      example: {
        data: [
          {
            name: "aviso_pedido_v1",
            language: "pt_BR",
            status: "APPROVED",
            category: "UTILITY",
            header: null,
            body: "Oi, {{1}}! Seu pedido de {{2}} foi confirmado.",
            footer: null,
            buttons: [],
            variables: 2,
            rejected_reason: null,
          },
        ],
      },
    },
    errors: [NOT_CONNECTED, { status: 502, code: "meta_error", when: "A Meta não respondeu a listagem." }],
  },
  {
    id: "templates-create",
    method: "POST",
    path: "/templates",
    tag: "Templates",
    summary: "Criar template",
    description: "Envia um template novo para aprovação da Meta. Normalmente fica PENDING por minutos a até 24h; consulte em GET /templates?status=all.",
    body: {
      fields: [
        { name: "name", type: "string", required: true, description: "Só minúsculas, números e _. Ex.: boas_vindas_v1." },
        { name: "language", type: "string", description: "Padrão pt_BR." },
        { name: "category", type: "string", description: "UTILITY (padrão) ou MARKETING." },
        { name: "allow_category_change", type: "boolean", description: "Deixa a Meta trocar a categoria em vez de reprovar." },
        { name: "header", type: "string", description: "Cabeçalho em texto, até 60 caracteres, sem variáveis." },
        { name: "body", type: "string", required: true, description: "Texto até 1024 caracteres, variáveis {{1}}, {{2}}… em sequência; não pode começar nem terminar com variável." },
        { name: "variables", type: "string[]", description: "Um exemplo para cada variável do body, na ordem." },
        { name: "footer", type: "string", description: "Rodapé até 60 caracteres." },
        { name: "buttons", type: "object[]", description: "Até 10: { type: QUICK_REPLY, text } · { type: URL, text, url, example? } (url terminando em {{1}} = dinâmica) · { type: PHONE_NUMBER, text, phone } · { type: COPY_CODE, example }." },
      ],
      example: {
        name: "aviso_pedido_v1",
        category: "UTILITY",
        body: "Oi, {{1}}! Seu pedido de {{2}} foi confirmado.",
        variables: ["Maria", "Curso X"],
        buttons: [{ type: "URL", text: "Ver pedido", url: "https://loja.com/pedido/{{1}}", example: "12345" }],
      },
    },
    response: { status: 201, example: { name: "aviso_pedido_v1", language: "pt_BR", category: "UTILITY", status: "PENDING" } },
    errors: [
      { status: 422, code: "invalid_template", when: "O template não segue as regras da Meta (mensagem explica qual)." },
      { status: 422, code: "meta_rejected", when: "A Meta recusou a criação." },
      NOT_CONNECTED,
    ],
  },
  {
    id: "send-template",
    method: "POST",
    path: "/send/template",
    tag: "Envio",
    summary: "Enviar template",
    description:
      "Envia um template aprovado para um número, na hora (síncrono). Fora da janela de 24h da conversa, a Meta só aceita template. O resultado fica no log de disparos do painel e gera message.sent ou message.failed no webhook.",
    body: {
      fields: [
        NUMBER_FIELD,
        ...TEMPLATE_FIELDS,
        { name: "params", type: "string[]", description: "Valores das variáveis do corpo, na ordem {{1}}, {{2}}… Vazio vira \"-\"." },
      ],
      example: { number: "5511999999999", template: "aviso_pedido_v1", language: "pt_BR", params: ["Maria", "Curso X"] },
    },
    response: { status: 200, example: MESSAGE_EXAMPLE },
    errors: [
      { status: 422, code: "invalid_number", when: "Número inválido." },
      { status: 409, code: "number_opted_out", when: "O número está na lista de bloqueio." },
      { status: 422, code: "meta_rejected", when: "A Meta recusou (template inexistente, variáveis a menos, número sem WhatsApp…). O corpo traz também `message` com status failed." },
      NOT_CONNECTED,
    ],
  },
  {
    id: "campaigns-create",
    method: "POST",
    path: "/campaigns",
    tag: "Campanhas",
    summary: "Disparar campanha em lote",
    description:
      "Um template para vários números, com variáveis por destinatário. As mensagens entram na fila de disparos do painel e saem aos poucos (o primeiro lote logo após a resposta, o resto pela fila automática). Números inválidos, repetidos e bloqueados são descartados e contados em `rejected`. Na hora do envio, a fila também pula quem já recebeu o mesmo template nas últimas 24h.",
    body: {
      fields: [
        ...TEMPLATE_FIELDS,
        { name: "messages", type: "object[]", required: true, description: "Até 500 itens: { number, params? }. Sem params, usa os `params` da campanha." },
        { name: "params", type: "string[]", description: "Variáveis padrão para quem não tem params próprio." },
        { name: "label", type: "string", description: "Nome da campanha (até 80 caracteres)." },
        { name: "scheduled_for", type: "string | number", description: "Agendar: data ISO 8601 ou timestamp em ms, até 30 dias à frente. Vazio = agora." },
      ],
      example: {
        label: "Black Friday — alunos",
        template: "convite_bf",
        language: "pt_BR",
        messages: [
          { number: "5511999999999", params: ["Maria"] },
          { number: "5521988888888", params: ["João"] },
        ],
        scheduled_for: "2026-11-28T09:00:00-03:00",
      },
    },
    response: { status: 202, example: { ...CAMPAIGN_EXAMPLE, rejected: { invalid_numbers: [], invalid: 0, duplicates: 0, opted_out: 0 } } },
    errors: [
      { status: 422, code: "invalid_messages", when: "`messages` vazio ou não é array." },
      { status: 422, code: "too_many_messages", when: "Mais de 500 destinatários." },
      { status: 422, code: "no_valid_recipients", when: "Sobrou nenhum número válido." },
      { status: 422, code: "invalid_schedule", when: "`scheduled_for` inválido ou além de 30 dias." },
      NOT_CONNECTED,
    ],
  },
  {
    id: "campaigns-list",
    method: "GET",
    path: "/campaigns",
    tag: "Campanhas",
    summary: "Listar campanhas",
    description: "Campanhas criadas pela API, das mais recentes para as mais antigas. status: running, finished ou canceled.",
    query: [{ name: "limit", type: "number", description: "1 a 100. Padrão 20." }],
    response: { status: 200, example: { data: [CAMPAIGN_EXAMPLE] } },
  },
  {
    id: "campaigns-get",
    method: "GET",
    path: "/campaigns/{id}",
    tag: "Campanhas",
    summary: "Progresso da campanha",
    description: "Contagem por status (na fila, enviando, enviadas, falhas, puladas). Com include=messages, devolve também cada mensagem.",
    pathParams: [{ name: "id", type: "uuid", required: true, description: "id devolvido na criação." }],
    query: [{ name: "include", type: "string", description: "messages para listar as mensagens." }],
    response: {
      status: 200,
      example: { ...CAMPAIGN_EXAMPLE, counts: { total: 2, queued: 0, sending: 0, sent: 1, failed: 0, skipped: 1 } },
    },
    errors: [NOT_FOUND("A campanha")],
  },
  {
    id: "campaigns-cancel",
    method: "POST",
    path: "/campaigns/{id}/cancel",
    tag: "Campanhas",
    summary: "Cancelar campanha",
    description: "Tira da fila tudo o que ainda não foi enviado (vira skipped, com evento message.skipped). O que já saiu não volta.",
    pathParams: [{ name: "id", type: "uuid", required: true, description: "id da campanha." }],
    response: {
      status: 200,
      example: { ...CAMPAIGN_EXAMPLE, status: "canceled", canceled_at: "2026-11-07T15:05:00.000Z", finished_at: "2026-11-07T15:05:00.000Z", counts: { total: 2, queued: 0, sending: 0, sent: 1, failed: 0, skipped: 1 }, canceled_messages: 1 },
    },
    errors: [NOT_FOUND("A campanha"), { status: 409, code: "campaign_closed", when: "A campanha já terminou ou já foi cancelada." }],
  },
  {
    id: "messages-get",
    method: "GET",
    path: "/messages/{id}",
    tag: "Mensagens",
    summary: "Status da mensagem",
    description:
      "Qualquer mensagem da área (API, campanhas do painel ou regras automáticas). status: queued, sending, sent, failed ou skipped. sent = aceita pela Meta; entregue/lida ainda não são informados.",
    pathParams: [{ name: "id", type: "uuid", required: true, description: "id devolvido no envio ou no webhook." }],
    response: { status: 200, example: { ...MESSAGE_EXAMPLE, params: ["Maria", "Curso X"] } },
    errors: [NOT_FOUND("A mensagem")],
  },
  {
    id: "optouts-list",
    method: "GET",
    path: "/optouts",
    tag: "Lista de bloqueio",
    summary: "Listar bloqueados",
    description: "Números que não recebem nenhum disparo da área (API, campanhas e regras).",
    response: { status: 200, example: { data: [{ number: "5511999999999", created_at: "2026-11-07T15:00:00.000Z" }] } },
  },
  {
    id: "optouts-add",
    method: "POST",
    path: "/optouts",
    tag: "Lista de bloqueio",
    summary: "Bloquear número",
    description: "Use quando a pessoa pedir para não receber mais mensagens.",
    body: { fields: [NUMBER_FIELD], example: { number: "5511999999999" } },
    response: { status: 201, example: { number: "5511999999999", opted_out: true } },
    errors: [{ status: 422, code: "invalid_number", when: "Número inválido." }],
  },
  {
    id: "optouts-remove",
    method: "DELETE",
    path: "/optouts/{number}",
    tag: "Lista de bloqueio",
    summary: "Desbloquear número",
    description: "Tira o número da lista de bloqueio.",
    pathParams: [{ name: "number", type: "string", required: true, description: "Número com DDI." }],
    response: { status: 200, example: { number: "5511999999999", opted_out: false } },
    errors: [NOT_FOUND("O número na lista")],
  },
  {
    id: "webhook-get",
    method: "GET",
    path: "/webhook",
    tag: "Webhook",
    summary: "Ver webhook",
    description: "URL configurada, eventos assinados, se está ligado e o segredo usado para assinar as entregas.",
    response: {
      status: 200,
      example: {
        url: "https://seusistema.com/webhooks/whatsapp",
        events: ["message.sent", "message.failed", "message.skipped", "campaign.finished"],
        enabled: true,
        secret: "whsec_3f9a…",
        consecutive_failures: 0,
      },
    },
  },
  {
    id: "webhook-put",
    method: "PUT",
    path: "/webhook",
    tag: "Webhook",
    summary: "Configurar webhook",
    description: "Define a URL (https público) que recebe os eventos. Na primeira URL o segredo de assinatura é gerado. Salvar religa o webhook e zera as falhas.",
    body: {
      fields: [
        { name: "url", type: "string | null", description: "https://… público. null remove o webhook." },
        { name: "events", type: "string[]", description: `Eventos a receber: ${WEBHOOK_EVENTS.map((e) => e.id).join(", ")}. Padrão: todos.` },
        { name: "enabled", type: "boolean", description: "false pausa as entregas sem apagar a URL." },
        { name: "rotate_secret", type: "boolean", description: "true gera um segredo novo (o antigo para de valer na hora)." },
      ],
      example: { url: "https://seusistema.com/webhooks/whatsapp", events: ["message.sent", "message.failed", "campaign.finished"] },
    },
    response: {
      status: 200,
      example: { url: "https://seusistema.com/webhooks/whatsapp", events: ["message.sent", "message.failed", "campaign.finished"], enabled: true, secret: "whsec_3f9a…", consecutive_failures: 0 },
    },
    errors: [
      { status: 422, code: "invalid_url", when: "URL sem https, interna (localhost, IP privado) ou que não resolve." },
      { status: 422, code: "invalid_events", when: "Evento desconhecido em `events`." },
    ],
  },
  {
    id: "webhook-test",
    method: "POST",
    path: "/webhook/test",
    tag: "Webhook",
    summary: "Testar webhook",
    description: "Entrega agora um evento webhook.test (uma tentativa, não conta como falha) e devolve o resultado.",
    response: { status: 200, example: { delivered: true, http_status: 200, error: null, delivery_id: "0b6f…" } },
  },
  {
    id: "webhook-deliveries",
    method: "GET",
    path: "/webhook/deliveries",
    tag: "Webhook",
    summary: "Entregas recentes",
    description: "As últimas 100 entregas, com tentativas e o último erro — útil para depurar o seu endpoint.",
    query: [{ name: "status", type: "string", description: "pending, delivered ou failed." }],
    response: {
      status: 200,
      example: {
        data: [
          { id: "0b6f…", event: "message.sent", status: "delivered", attempts: 1, last_http_status: 200, last_error: null, next_attempt_at: null, delivered_at: "2026-11-07T15:00:02.000Z", created_at: "2026-11-07T15:00:01.300Z" },
        ],
      },
    },
  },
];

export const COMMON_ERRORS = [
  { status: 400, code: "invalid_json / invalid_body", when: "Corpo não é um objeto JSON." },
  { status: 401, code: "unauthorized", when: "x-api-key ou x-api-secret ausente ou errado." },
  { status: 429, code: "rate_limited", when: "Passou de 120 requisições/minuto na chave (ou de 20 tentativas com credencial errada por minuto no IP)." },
  { status: 500, code: "internal_error", when: "Falha nossa; tente de novo." },
];

export const WEBHOOK_ENVELOPE_EXAMPLE = {
  delivery_id: "0b6f2c1e-8a8d-4b8e-9a51-2f7d0c4b1e9a",
  event_id: "message.sent:7f3c2a10-5b1e-4f2a-9d0e-2c6b8a1f4e55",
  version: "1",
  event: "message.sent",
  area_id: "3b2f1c9e-7a44-4d1b-9c55-1e0f6a2d8b70",
  created_at: "2026-11-07T15:00:01.300Z",
  data: MESSAGE_EXAMPLE,
};

export const RETRY_SCHEDULE = RETRY_DELAYS_S.map((s) => (s < 60 ? `${s}s` : s < 3600 ? `${s / 60}min` : `${s / 3600}h`));

/* ------------------------------------------------------------- OpenAPI */

function schemaFor(type: string): Record<string, unknown> {
  if (type.endsWith("[]")) return { type: "array", items: schemaFor(type.slice(0, -2)) };
  if (type.includes("|")) return {};
  if (type === "number") return { type: "number" };
  if (type === "boolean") return { type: "boolean" };
  if (type === "object") return { type: "object" };
  if (type === "uuid") return { type: "string", format: "uuid" };
  return { type: "string" };
}

export function buildOpenApi(baseUrl: string): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const e of ENDPOINTS) {
    const parameters = [
      ...(e.pathParams ?? []).map((f) => ({ name: f.name, in: "path", required: true, description: f.description, schema: schemaFor(f.type) })),
      ...(e.query ?? []).map((f) => ({ name: f.name, in: "query", required: false, description: f.description, schema: schemaFor(f.type) })),
    ];
    const responses: Record<string, unknown> = {
      [String(e.response.status)]: { description: "Sucesso", content: { "application/json": { example: e.response.example } } },
    };
    for (const err of [...(e.errors ?? []), ...COMMON_ERRORS]) {
      responses[String(err.status)] ??= {
        description: `${err.code}: ${err.when}`,
        content: { "application/json": { example: { error: { code: err.code.split(" ")[0], message: err.when } } } },
      };
    }
    (paths[`/api/v1${e.path}`] ??= {})[e.method.toLowerCase()] = {
      operationId: e.id,
      tags: [e.tag],
      summary: e.summary,
      description: e.description,
      ...(parameters.length ? { parameters } : {}),
      ...(e.body
        ? {
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: e.body.fields.filter((f) => f.required).map((f) => f.name),
                    properties: Object.fromEntries(e.body.fields.map((f) => [f.name, { ...schemaFor(f.type), description: f.description }])),
                  },
                  example: e.body.example,
                },
              },
            },
          }
        : {}),
      responses,
    };
  }

  return {
    openapi: "3.0.3",
    info: {
      title: "API de Disparo — WhatsApp API Oficial",
      version: "1.0.0",
      description:
        "Envio de templates, campanhas em lote, lista de bloqueio e webhooks sobre a API oficial do WhatsApp (Cloud API da Meta) conectada ao painel. Autentique-se com x-api-key e x-api-secret (painel → Integrações → API pública). Documentação completa: " +
        `${baseUrl}/docs/api`,
    },
    servers: [{ url: baseUrl }],
    security: [{ ApiKeyAuth: [], ApiSecretAuth: [] }],
    tags: TAGS.map((name) => ({ name })),
    components: {
      securitySchemes: {
        ApiKeyAuth: { type: "apiKey", in: "header", name: "x-api-key" },
        ApiSecretAuth: { type: "apiKey", in: "header", name: "x-api-secret" },
      },
    },
    paths,
    "x-webhook": {
      description: "Envelope que o painel envia por POST para a URL do webhook, assinado em X-Dash-Signature (t=UNIX,v1=HMAC-SHA256 hex de `${t}.${corpo_bruto}`).",
      events: WEBHOOK_EVENTS,
      example: WEBHOOK_ENVELOPE_EXAMPLE,
    },
  };
}
