import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import {
  Code,
  H3,
  List,
  Note,
  P,
  Pre,
  PublicDoc,
  Section,
  Strong,
  Table,
  type TocItem,
} from "@/components/legal/public-doc";
import { getBranding } from "@/lib/branding";
import { WEBHOOK_EVENTS } from "@/lib/public-api/events";
import {
  COMMON_ERRORS,
  ENDPOINTS,
  RETRY_SCHEDULE,
  TAGS,
  WEBHOOK_ENVELOPE_EXAMPLE,
  type Endpoint,
  type Field,
} from "@/lib/public-api/spec";

export const metadata: Metadata = {
  title: "API de Disparo",
  description:
    "Documentação da API de disparo pela API oficial do WhatsApp: autenticação, envio de templates, campanhas, lista de bloqueio e webhooks.",
};

const slug = (tag: string) =>
  tag
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "-");

const TOC: TocItem[] = [
  { id: "visao-geral", label: "Visão geral" },
  { id: "autenticacao", label: "Autenticação" },
  { id: "erros", label: "Erros e limites" },
  ...TAGS.map((tag) => ({ id: slug(tag), label: tag })),
  { id: "webhook-eventos", label: "Eventos do webhook" },
  { id: "assinatura", label: "Validar a assinatura" },
];

const METHOD_COLOR: Record<Endpoint["method"], string> = {
  GET: "text-sky-500 border-sky-500/40 bg-sky-500/10",
  POST: "text-emerald-500 border-emerald-500/40 bg-emerald-500/10",
  PUT: "text-amber-500 border-amber-500/40 bg-amber-500/10",
  DELETE: "text-rose-500 border-rose-500/40 bg-rose-500/10",
};

function curl(base: string, e: Endpoint): string {
  const path = e.path.replace("{id}", "<id>").replace("{number}", "5511999999999");
  const lines = [
    `curl -X ${e.method} "${base}/api/v1${path}"`,
    `  -H "x-api-key: dk_SUA_CHAVE"`,
    `  -H "x-api-secret: ds_SEU_SEGREDO"`,
  ];
  if (e.body) {
    lines.push(`  -H "Content-Type: application/json"`);
    lines.push(`  -d '${JSON.stringify(e.body.example)}'`);
  }
  return lines.join(" \\\n");
}

function FieldTable({ fields }: { fields: Field[] }) {
  return (
    <Table
      head={["Campo", "Tipo", "Descrição"]}
      rows={fields.map((f) => [
        <span key="n" className="whitespace-nowrap">
          <Code>{f.name}</Code>
          {f.required ? <span className="ml-1 text-xs text-primary">obrigatório</span> : null}
        </span>,
        <span key="t" className="whitespace-nowrap font-mono text-xs">{f.type}</span>,
        f.description,
      ])}
    />
  );
}

function EndpointDoc({ e, base }: { e: Endpoint; base: string }) {
  return (
    <div id={e.id} className="scroll-mt-20 space-y-4 rounded-xl border border-border p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`rounded-md border px-2 py-0.5 font-mono text-xs font-semibold ${METHOD_COLOR[e.method]}`}>
          {e.method}
        </span>
        <code className="font-mono text-sm text-foreground">/api/v1{e.path}</code>
      </div>
      <H3>{e.summary}</H3>
      <P>{e.description}</P>
      {e.pathParams ? <FieldTable fields={e.pathParams} /> : null}
      {e.query ? (
        <>
          <p className="micro-label">Query</p>
          <FieldTable fields={e.query} />
        </>
      ) : null}
      {e.body ? (
        <>
          <p className="micro-label">Corpo (JSON)</p>
          <FieldTable fields={e.body.fields} />
        </>
      ) : null}
      <p className="micro-label">Exemplo</p>
      <Pre>{curl(base, e)}</Pre>
      <p className="micro-label">Resposta {e.response.status}</p>
      <Pre>{JSON.stringify(e.response.example, null, 2)}</Pre>
      {e.errors?.length ? (
        <Table
          head={["HTTP", "code", "Quando"]}
          rows={e.errors.map((err) => [String(err.status), <Code key="c">{err.code}</Code>, err.when])}
        />
      ) : null}
    </div>
  );
}

const NODE_VERIFY = `import crypto from "node:crypto";

// Express: use o corpo BRUTO (express.raw), não o JSON já convertido.
app.post("/webhooks/whatsapp", express.raw({ type: "application/json" }), (req, res) => {
  const header = req.get("X-Dash-Signature") ?? "";           // "t=1762527601,v1=ab12…"
  const { t, v1 } = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const expected = crypto
    .createHmac("sha256", process.env.DASH_WEBHOOK_SECRET)     // whsec_… (GET /webhook)
    .update(\`\${t}.\${req.body}\`)
    .digest("hex");

  const fresh = Math.abs(Date.now() / 1000 - Number(t)) < 300; // 5 minutos
  const valid = v1 && expected.length === v1.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
  if (!fresh || !valid) return res.sendStatus(401);

  const event = JSON.parse(req.body);
  // dedupe: ignore se já processou event.delivery_id
  res.sendStatus(200); // responda rápido; processe depois
});`;

const PHP_VERIFY = `$body = file_get_contents('php://input');
parse_str(str_replace(',', '&', $_SERVER['HTTP_X_DASH_SIGNATURE'] ?? ''), $sig);
$expected = hash_hmac('sha256', $sig['t'] . '.' . $body, getenv('DASH_WEBHOOK_SECRET'));
if (abs(time() - (int)$sig['t']) > 300 || !hash_equals($expected, $sig['v1'] ?? '')) {
  http_response_code(401); exit;
}
$event = json_decode($body, true);
http_response_code(200);`;

export default async function ApiDocsPage() {
  const branding = await getBranding();
  const h = await headers();
  const base = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "seu-painel"}`;

  return (
    <PublicDoc
      branding={branding}
      eyebrow="Documentação da API"
      title="API de Disparo — WhatsApp API Oficial"
      toc={TOC}
      intro={
        <p>
          Integre o seu sistema aos disparos do {branding.product_name}: envie templates aprovados, dispare
          campanhas em lote, gerencie a lista de bloqueio e receba eventos por webhook — tudo pela API oficial
          do WhatsApp (Cloud API da Meta) conectada ao painel. Especificação OpenAPI:{" "}
          <a href="/api/v1/openapi.json" className="text-primary underline underline-offset-2">
            /api/v1/openapi.json
          </a>{" "}
          (importe no Postman, Insomnia ou n8n). Guia do painel:{" "}
          <Link href="/docs" className="text-primary underline underline-offset-2">
            Documentação
          </Link>
          .
        </p>
      }
    >
      <Section id="visao-geral" title="Visão geral">
        <Table
          head={["Item", "Valor"]}
          rows={[
            ["URL base", <Code key="b">{`${base}/api/v1`}</Code>],
            ["Formato", "JSON (Content-Type: application/json), UTF-8"],
            ["Autenticação", <span key="a">headers <Code>x-api-key</Code> e <Code>x-api-secret</Code></span>],
            ["Números", "Só dígitos com DDI: 5511999999999 (números brasileiros sem DDI recebem 55)"],
            ["Datas", "ISO 8601 em UTC (2026-11-07T15:00:00.000Z)"],
          ]}
        />
        <Note>
          <Strong>Regra da Meta:</Strong> fora da janela de 24h de conversa, só templates <Strong>aprovados</Strong>{" "}
          podem ser enviados. Crie e acompanhe os templates em <Code>/templates</Code> ou no painel (Disparos →
          Templates). O que a API envia aparece no log de disparos do painel, e a lista de bloqueio vale para
          tudo: API, campanhas do painel e regras automáticas.
        </Note>
      </Section>

      <Section id="autenticacao" title="Autenticação">
        <List ordered>
          <li>
            No painel, abra <Strong>Integrações → API Oficial do WhatsApp → API pública</Strong> e clique em{" "}
            <Strong>Gerar credenciais</Strong>.
          </li>
          <li>
            Copie a <Code>x-api-key</Code> e o <Code>x-api-secret</Code>. O segredo aparece <Strong>uma única vez</Strong>
            {" "}— guarde num cofre de senhas ou variável de ambiente do seu servidor.
          </li>
          <li>Envie os dois headers em toda requisição. Cada par de credenciais dá acesso a uma única área do painel.</li>
        </List>
        <Pre>{`curl "${base}/api/v1/account" \\\n  -H "x-api-key: dk_SUA_CHAVE" \\\n  -H "x-api-secret: ds_SEU_SEGREDO"`}</Pre>
        <P>
          Perdeu o segredo ou ele vazou? Gere credenciais novas no painel — as antigas param de funcionar na hora.
          Nunca use as credenciais no navegador ou em app de celular: a API é para servidor-servidor.
        </P>
      </Section>

      <Section id="erros" title="Erros e limites">
        <P>Erros sempre têm o mesmo formato, com um <Code>code</Code> estável para o seu código tratar:</P>
        <Pre>{`{ "error": { "code": "invalid_number", "message": "\`number\` inválido. Use DDI + DDD + número…" } }`}</Pre>
        <Table head={["HTTP", "code", "Quando"]} rows={COMMON_ERRORS.map((e) => [String(e.status), <Code key="c">{e.code}</Code>, e.when])} />
        <P>
          Limites: <Strong>120 requisições por minuto</Strong> por chave e <Strong>500 destinatários</Strong> por campanha.
          Para listas maiores, crie várias campanhas.
        </P>
      </Section>

      {TAGS.map((tag) => (
        <Section key={tag} id={slug(tag)} title={tag}>
          {ENDPOINTS.filter((e) => e.tag === tag).map((e) => (
            <EndpointDoc key={e.id} e={e} base={base} />
          ))}
        </Section>
      ))}

      <Section id="webhook-eventos" title="Eventos do webhook">
        <P>
          Configure a URL em <Code>PUT /webhook</Code> (ou no painel). A cada evento, o painel faz um <Strong>POST</Strong>{" "}
          nessa URL com o envelope abaixo. Responda <Strong>2xx em até 10 segundos</Strong> — processe depois, em fila.
        </P>
        <Table head={["Evento", "Quando"]} rows={WEBHOOK_EVENTS.map((e) => [<Code key="e">{e.id}</Code>, e.label])} />
        <P>
          Os eventos <Code>message.*</Code> valem para <Strong>todas</Strong> as mensagens da área (API, campanhas do painel e
          regras automáticas); o campo <Code>data.source</Code> diz a origem (<Code>api</Code>, <Code>painel</Code> ou{" "}
          <Code>regra</Code>). <Code>data</Code> tem a mesma forma de <Code>GET /messages/{"{id}"}</Code>; em{" "}
          <Code>campaign.finished</Code>, a de <Code>GET /campaigns/{"{id}"}</Code>.
        </P>
        <p className="micro-label">Envelope (corpo do POST)</p>
        <Pre>{JSON.stringify(WEBHOOK_ENVELOPE_EXAMPLE, null, 2)}</Pre>
        <Table
          head={["Header", "Conteúdo"]}
          rows={[
            [<Code key="1">X-Dash-Id</Code>, "id da entrega (igual a delivery_id, o mesmo em todas as tentativas)"],
            [<Code key="2">X-Dash-Event</Code>, "tipo do evento"],
            [<Code key="3">X-Dash-Timestamp</Code>, "unix time do envio"],
            [<Code key="4">X-Dash-Signature</Code>, "t=UNIX,v1=HMAC — veja como validar abaixo"],
          ]}
        />
        <H3>Reentregas</H3>
        <List>
          <li>
            Sem 2xx (erro, timeout ou redirecionamento), o painel tenta de novo depois de {RETRY_SCHEDULE.join(", ")} — {RETRY_SCHEDULE.length + 1}{" "}
            tentativas no total.
          </li>
          <li>
            Se 3 entregas seguidas esgotarem as tentativas, o webhook é <Strong>desligado</Strong>. Salve a configuração de
            novo (<Code>PUT /webhook</Code>) para religar.
          </li>
          <li>
            O mesmo evento pode chegar mais de uma vez: ignore o que já processou pelo <Code>delivery_id</Code> (ou{" "}
            <Code>event_id</Code>).
          </li>
          <li>
            Acompanhe as entregas em <Code>GET /webhook/deliveries</Code> e teste o seu endpoint com <Code>POST /webhook/test</Code>.
          </li>
        </List>
        <Note>
          Ainda não enviamos os retornos de <Strong>entregue</Strong>, <Strong>lida</Strong> e <Strong>resposta</Strong> da Meta —{" "}
          <Code>message.sent</Code> significa que a Meta aceitou a mensagem. Esses eventos virão numa próxima versão.
        </Note>
      </Section>

      <Section id="assinatura" title="Validar a assinatura">
        <List ordered>
          <li>
            Leia <Code>t</Code> e <Code>v1</Code> do header <Code>X-Dash-Signature</Code>.
          </li>
          <li>
            Calcule o HMAC-SHA256, em hex, de <Code>{"t + \".\" + corpo_bruto"}</Code> usando o segredo do webhook (
            <Code>whsec_…</Code>, em <Code>GET /webhook</Code> ou no painel).
          </li>
          <li>Compare com <Code>v1</Code> em tempo constante. Diferente? Rejeite com 401.</li>
          <li>Rejeite se <Code>t</Code> tiver mais de 5 minutos (proteção contra reenvio malicioso).</li>
        </List>
        <p className="micro-label">Node.js (Express)</p>
        <Pre>{NODE_VERIFY}</Pre>
        <p className="micro-label">PHP</p>
        <Pre>{PHP_VERIFY}</Pre>
        <P>
          Use sempre o <Strong>corpo bruto</Strong>, exatamente como chegou: converter para JSON e de volta muda espaços e
          ordem dos campos, e a assinatura deixa de bater.
        </P>
      </Section>
    </PublicDoc>
  );
}
