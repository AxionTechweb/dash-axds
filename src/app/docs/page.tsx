import type { Metadata } from "next";
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
import { CHECKOUT_PLATFORMS } from "@/lib/checkout/platforms";
import { DISPATCH_TRIGGERS } from "@/lib/meta-wa/constants";
import { CHECKPOINT_HOURS } from "@/lib/reports/daily";

export const metadata: Metadata = {
  title: "Documentação",
  description:
    "Documentação oficial do painel: integrações, atribuição de vendas, disparos de WhatsApp pela API oficial, regras, notificações e segurança.",
};

const TOC: TocItem[] = [
  { id: "visao-geral", label: "Visão geral" },
  { id: "acesso", label: "Acesso e áreas" },
  { id: "atribuicao", label: "Como a atribuição funciona" },
  { id: "integracoes", label: "Integrações" },
  { id: "disparos", label: "Disparos de WhatsApp" },
  { id: "campanhas", label: "Campanhas e regras" },
  { id: "notificacoes", label: "Notificações" },
  { id: "relatorios", label: "Relatórios e rotinas" },
  { id: "seguranca", label: "Segurança e dados" },
  { id: "problemas", label: "Solução de problemas" },
];

const MAX_CAMPAIGN = 500;

export default async function DocsPage() {
  const branding = await getBranding();
  const name = branding.product_name;
  const checkpoints = CHECKPOINT_HOURS.map((h) => `${h}h`).join(", ");

  return (
    <PublicDoc
      branding={branding}
      eyebrow="Documentação oficial"
      title={`Como o ${name} funciona`}
      toc={TOC}
      intro={
        <p>
          Guia de referência do painel: o que cada tela faz, como conectar cada integração, como
          funcionam os disparos de WhatsApp pela API oficial da Meta e quais cuidados o sistema toma
          com os dados. Para o tratamento de dados pessoais, veja a{" "}
          <Link href="/privacidade" className="text-primary underline underline-offset-2">
            Política de Privacidade
          </Link>
          .
        </p>
      }
    >
      {/* ------------------------------------------------------------ */}
      <Section id="visao-geral" title="Visão geral">
        <P>
          O {name} junta num só lugar o <Strong>gasto dos anúncios</Strong> (Meta Ads) e as{" "}
          <Strong>vendas</Strong> (plataformas de checkout) para mostrar o resultado real de cada
          campanha, conjunto e criativo, além de automatizar avisos e mensagens de WhatsApp.
        </P>
        <Table
          head={["Tela", "Para que serve"]}
          rows={[
            ["Dashboard", "Faturamento, gasto, lucro, ROAS, CPA, evolução diária, regiões, formas de pagamento e vendas em tempo real."],
            ["Campanhas", "Hierarquia da Meta (campanha → conjunto → anúncio) com vendas atribuídas, ROAS Front/Backend, edição de status e orçamento e criação de campanhas."],
            ["Criativos", "Desempenho por anúncio, com prévia do criativo."],
            ["Vendas", "Lista de compras com origem, status e a aba Eventos (jornada do visitante)."],
            ["Financeiro", "Visão de receita, custos, impostos e taxas."],
            ["GA4 · Vturb", "Métricas do Google Analytics 4 e retenção dos vídeos (opcionais)."],
            ["Disparos", "Mensagens de WhatsApp pela API oficial: templates, envios automáticos, campanhas e histórico."],
            ["Regras", "Automação que pausa anúncios ou avisa quando uma condição é atingida."],
            ["Integrações · Configurações", "Conexões com as plataformas, áreas, tiers de produto, marca e preferências."],
          ]}
        />
        <Note>
          O painel é de <Strong>leitura e análise</Strong>: ele não envia eventos de conversão (nem
          Conversions API da Meta, nem Measurement Protocol do GA4). As únicas escritas externas são
          gestão de campanhas na Meta — sempre com confirmação — e as mensagens de WhatsApp.
        </Note>
      </Section>

      {/* ------------------------------------------------------------ */}
      <Section id="acesso" title="Acesso e áreas">
        <List>
          <li>
            O acesso é <Strong>somente por convite</Strong>. Não existe cadastro público; o
            administrador cria os usuários.
          </li>
          <li>
            Esqueceu a senha? Use <Strong>Esqueci minha senha</Strong> na tela de login; o link de
            redefinição chega por e-mail.
          </li>
          <li>
            Os dados são organizados em <Strong>áreas</Strong> (ex.: um produto ou uma operação).
            Cada área tem as próprias integrações, regras e disparos; troque de área pelo seletor no
            topo do painel.
          </li>
          <li>
            O painel pode ser instalado no celular como aplicativo (PWA) — no navegador, use{" "}
            <Strong>Adicionar à tela de início</Strong> — e recebe notificações push.
          </li>
        </List>
      </Section>

      {/* ------------------------------------------------------------ */}
      <Section id="atribuicao" title="Como a atribuição funciona">
        <P>
          Cada venda é ligada ao anúncio que a gerou <Strong>pelo ID exato do anúncio</Strong>,
          nunca pelo nome da campanha. O caminho é:
        </P>
        <Pre>{`Anúncio na Meta     →  utm_content={{ad.id}} na URL de destino
Página / script     →  leva o valor até o link do checkout
Webhook do checkout →  devolve o parâmetro ao painel
Painel              →  grava o ad_id na venda e cruza com a Meta`}</Pre>
        <List>
          <li>
            Na Meta, coloque <Code>utm_content={"{{ad.id}}"}</Code> nos parâmetros de URL de todos
            os anúncios. Campanhas criadas pelo painel já saem com os parâmetros de URL completos (o ID vai no final de utm_content).
          </li>
          <li>
            O parâmetro que leva o ID até o checkout depende da plataforma (veja a tabela em{" "}
            <a href="#checkout" className="text-primary underline underline-offset-2">
              Checkout
            </a>
            ). O script de rastreamento faz essa decoração do link sozinho.
          </li>
          <li>
            Só valores numéricos são aceitos como ID de anúncio. Venda sem ID continua registrada e
            aparece como orgânica/direta.
          </li>
          <li>
            <Strong>ROAS Front e Backend</Strong>: cada produto recebe um tier em Configurações →
            Tiers de produto (front, upsell, downsell, backend). O Front considera só a venda de
            entrada; o Backend soma as vendas seguintes do mesmo comprador.
          </li>
        </List>
      </Section>

      {/* ------------------------------------------------------------ */}
      <Section id="integracoes" title="Integrações">
        <P>
          Tudo é configurado em <Strong>Integrações</Strong>, por área. Tokens, chaves e segredos são
          cifrados antes de ir para o banco e nunca são exibidos de volta — para trocar, basta colar
          um novo. Para o painel funcionar bastam duas conexões: <Strong>Meta Ads</Strong> e{" "}
          <Strong>Checkout</Strong>. As demais são opcionais.
        </P>

        <H3 id="meta-ads">Meta Ads (obrigatória)</H3>
        <List ordered>
          <li>
            No Business Manager, em Configurações do negócio → Usuários → <Strong>Usuários do
            sistema</Strong>, crie um usuário do sistema com função de administrador.
          </li>
          <li>Em Adicionar ativos, vincule as contas de anúncio com controle total.</li>
          <li>
            Gere um token com os escopos <Code>ads_read</Code> e <Code>ads_management</Code>. Tokens
            de usuário do sistema não expiram.
          </li>
          <li>
            No painel, cole o token, clique em <Strong>Buscar contas</Strong> e marque as contas
            desejadas.
          </li>
        </List>

        <H3 id="checkout">Checkout (obrigatória)</H3>
        <P>
          Selecione a plataforma na grade. O painel mostra a URL do webhook pronta para copiar (no
          formato <Code>/api/webhook/&lt;plataforma&gt;?a=&lt;token-da-área&gt;</Code>), o passo a
          passo daquela plataforma e o campo do segredo usado para validar cada notificação.
          Cadastre a URL na plataforma marcando os eventos de compra aprovada, pagamento pendente,
          reembolso, chargeback e cancelamento.
        </P>
        <Table
          head={["Plataforma", "Parâmetro do ID do anúncio no link", "Segredo pedido"]}
          rows={CHECKOUT_PLATFORMS.map((p) => [p.label, <Code key="p">{p.trackingParam}</Code>, p.secretLabel])}
        />
        <P>
          O corpo original de cada notificação é guardado, o que permite auditar e corrigir o
          mapeamento de uma plataforma sem perder vendas.
        </P>

        <H3 id="rastreamento">Rastreamento da jornada (opcional)</H3>
        <P>
          Habilita checkouts iniciados, funil e a aba Eventos em Vendas. Instale o snippet em todas
          as páginas (direto no HTML ou no Google Tag Manager como tag HTML personalizada, gatilho
          Todas as páginas):
        </P>
        <Pre>{`<script src="https://SEU-DOMINIO/track.js" data-area="TOKEN_DA_AREA" defer></script>`}</Pre>
        <List>
          <li>
            Ele gera um identificador anônimo do visitante, guarda as UTMs da visita, registra page
            views e decora o link do checkout para a compra casar com o mesmo visitante.
          </li>
          <li>
            Cadastre os domínios das páginas em Configurações → Preferências da área (aceita{" "}
            <Code>*.seudominio.com</Code>). <Strong>Sem domínio cadastrado, a captura é
            bloqueada</Strong> — isso impede que outro site envie dados para o painel.
          </li>
          <li>
            Se o seu GTM já gera um ID de visitante próprio, não instale o snippet por cima:
            reaproveite o ID existente para não criar dois identificadores.
          </li>
        </List>

        <H3 id="whatsapp-oficial">WhatsApp — API oficial da Meta (disparos)</H3>
        <List ordered>
          <li>
            No Meta Business, tenha uma conta do WhatsApp Business (WABA) com um número
            registrado na Cloud API.
          </li>
          <li>
            Crie um usuário do sistema com acesso à WABA e gere um token permanente com{" "}
            <Code>whatsapp_business_messaging</Code> e <Code>whatsapp_business_management</Code>.
          </li>
          <li>
            Em Integrações → WhatsApp API oficial, informe o <Strong>WABA ID</Strong>, o{" "}
            <Strong>Phone Number ID</Strong> do número remetente e o token. O token é validado na
            Meta antes de salvar.
          </li>
          <li>Para desconectar, deixe todos os campos em branco e salve.</li>
        </List>

        <H3 id="whatsapp-avisos">WhatsApp — avisos internos (opcional)</H3>
        <P>
          Canal separado, só para a <Strong>equipe</Strong>: alertas de venda, conta, criativo e
          regras chegam num número interno via Evolution API. Informe a URL base, a instância, a
          API key e o número de destino. Não envia nada para clientes.
        </P>

        <H3 id="opcionais">Vturb, Google Sheets e GA4 (opcionais)</H3>
        <Table
          head={["Integração", "O que pede", "Para que serve"]}
          rows={[
            ["Vturb", "API key e os IDs dos players", "Hook, play rate e retenção do pitch no relatório semanal e na página Vturb."],
            ["Google Sheets — semanal", "URL da planilha e JSON da service account (com acesso de editor)", "Relatório semanal por criativo (ROAS, CAC, margem)."],
            ["Google Sheets — diário", "URL da planilha (com aba TEMPLATE) e JSON da service account", `Checkpoints intradia por campanha ativa (${checkpoints}, horário de Brasília).`],
            ["GA4", "ID da propriedade e JSON da service account (leitor da propriedade, Analytics Data API ativa)", "Página GA4 no painel."],
          ]}
        />
      </Section>

      {/* ------------------------------------------------------------ */}
      <Section id="disparos" title="Disparos de WhatsApp (API oficial)">
        <P>
          Todo envio usa a Cloud API oficial da Meta e <Strong>somente templates aprovados</Strong>.
          O painel nunca envia mensagem livre para clientes.
        </P>

        <H3 id="templates">Templates</H3>
        <List>
          <li>
            Em Disparos → <Strong>Templates</Strong>, crie o template (categoria, idioma, texto,
            variáveis e botões). Ele é enviado para análise da Meta pela própria API.
          </li>
          <li>
            Quando a Meta aprova ou reprova, o painel avisa por push e no sino de notificações. Só
            templates aprovados aparecem para uso.
          </li>
          <li>
            Variáveis disponíveis (<Code>{"{{1}}"}</Code>, <Code>{"{{2}}"}</Code>…): primeiro nome,
            nome completo, produto, valor e e-mail. O nome é higienizado (só letras, até 40
            caracteres) para impedir links ou texto arbitrário dentro da mensagem.
          </li>
        </List>

        <H3 id="automaticos">Disparos automáticos</H3>
        <P>Cada gatilho tem seu template e seu atraso (em minutos), configurados por área:</P>
        <Table
          head={["Gatilho", "Uso", "Atraso padrão"]}
          rows={DISPATCH_TRIGGERS.map((t) => [t.label, t.hint, `${t.defaultDelay} min`])}
        />
        <List>
          <li>
            O evento (webhook ou captura) só <Strong>coloca o envio na fila</Strong>, sem duplicar —
            a mesma regra para a mesma origem entra uma vez só.
          </li>
          <li>
            Atraso 0 envia logo após o evento. Com atraso, o envio sai quando o agendador processa a
            fila (a cada 5 minutos).
          </li>
          <li>
            Antes de enviar, o painel confere tudo de novo: se a pessoa já comprou, se o número está
            na lista de bloqueio ou se já recebeu — e pula o envio quando for o caso.
          </li>
          <li>Uma falha no WhatsApp nunca derruba o registro da venda.</li>
        </List>

        <H3 id="campanha">Envio de campanha</H3>
        <P>Em Disparos → Novo envio de campanha, um assistente em 6 etapas:</P>
        <List ordered>
          <li>
            <Strong>Início</Strong> — escolha a origem dos contatos: do próprio painel (compradores,
            leads) ou de um arquivo.
          </li>
          <li>
            <Strong>Contatos</Strong> — filtre ou envie um <Code>.csv</Code> ou <Code>.vcf</Code>.
            Números inválidos, duplicados e bloqueados são descartados. Limite de{" "}
            {MAX_CAMPAIGN} contatos por campanha.
          </li>
          <li>
            <Strong>Canal</Strong> — confirma o número remetente da API oficial.
          </li>
          <li>
            <Strong>Conteúdo</Strong> — escolha o template aprovado e o valor de cada variável, com
            prévia da mensagem.
          </li>
          <li>
            <Strong>Resumo</Strong> — confira quantidade, template e prévia antes de confirmar.
          </li>
          <li>
            <Strong>Enviado</Strong> — o envio entra na fila e o andamento aparece no Histórico.
          </li>
        </List>
        <Note>
          Envie campanhas de marketing apenas para quem consentiu em receber mensagens da marca. A
          Meta mede bloqueios e denúncias: muitos deles reduzem a qualidade e o limite de envio do
          número.
        </Note>

        <H3 id="teste-bloqueio">Teste, lista de bloqueio e histórico</H3>
        <List>
          <li>
            <Strong>Enviar teste</Strong>: dispara um template para um número seu antes de ligar um
            gatilho ou campanha.
          </li>
          <li>
            <Strong>Lista de bloqueio</Strong>: números que pediram para sair. Nenhum envio automático ou de
            campanha sai para eles. Adicione aqui todo pedido de descadastro.
          </li>
          <li>
            <Strong>Histórico</Strong>: cada envio com data, origem, número (mascarado), template e
            status/erro retornado pela Meta. O botão de processar fila envia na hora o que estiver
            vencido.
          </li>
        </List>
      </Section>

      {/* ------------------------------------------------------------ */}
      <Section id="campanhas" title="Campanhas e regras">
        <H3>Gestão na Meta</H3>
        <List>
          <li>
            Status e orçamento podem ser editados direto na tabela de Campanhas. Toda alteração pede
            confirmação e fica registrada no log de auditoria.
          </li>
          <li>
            Campanhas criadas ou duplicadas pelo painel (Campanhas → Nova) nascem{" "}
            <Strong>pausadas</Strong>; ativar exige confirmação.
          </li>
          <li>As colunas da tabela podem ser personalizadas e ficam salvas por usuário.</li>
        </List>
        <H3>Regras automáticas</H3>
        <P>
          Conservadoras por desenho: só <Strong>pausam</Strong> ou <Strong>notificam</Strong>.
          Nunca aumentam orçamento nem ativam nada sozinhas. Exemplo: pausar o anúncio se gastou mais
          que X sem venda. Toda pausa feita por regra gera aviso.
        </P>
      </Section>

      {/* ------------------------------------------------------------ */}
      <Section id="notificacoes" title="Notificações">
        <Table
          head={["Canal", "Avisos"]}
          rows={[
            [
              "Push no celular / navegador",
              "Venda aprovada, reembolso, meta atingida, resumo do dia às 18h, templates aprovados/reprovados.",
            ],
            [
              "WhatsApp interno (Evolution) e sino do painel",
              "Nenhuma venda aprovada na última hora, conta de anúncio desativada, criativo reprovado (com o motivo), PIX parado em aguardando pagamento e pausas feitas pelas Regras.",
            ],
          ]}
        />
        <P>
          Para receber push, abra o painel no aparelho e ative as notificações no sino. Contas de
          anúncio podem ter os alertas silenciados individualmente em Integrações.
        </P>
      </Section>

      {/* ------------------------------------------------------------ */}
      <Section id="relatorios" title="Relatórios e rotinas">
        <Table
          head={["Rotina", "Frequência"]}
          rows={[
            ["Fila de disparos de WhatsApp", "A cada 5 minutos"],
            ["Alertas operacionais", "A cada 15 minutos"],
            ["Regras automáticas", "Periodicamente, sobre os dados de Campanhas"],
            ["Checkpoints diários na planilha", `${checkpoints} (horário de Brasília)`],
            ["Resumo do dia (push)", "Todo dia às 18h"],
            ["Relatório semanal por criativo", "Segunda-feira de manhã"],
            ["Sincronização do GA4", "Diária"],
            ["Limpeza de registros de rate limit", "Diária"],
          ]}
        />
      </Section>

      {/* ------------------------------------------------------------ */}
      <Section id="seguranca" title="Segurança e dados">
        <List>
          <li>Login obrigatório em todas as telas do painel; cadastro público desligado.</li>
          <li>Controle de acesso no banco (Row Level Security) em todas as tabelas.</li>
          <li>Tokens e segredos de integração cifrados no banco; a chave de cifra fica fora dele.</li>
          <li>
            Webhooks validados pelo mecanismo de cada plataforma (token ou assinatura); endpoints
            públicos com validação de dados, limite de requisições e CORS por domínio.
          </li>
          <li>E-mail e telefone de clientes exibidos sempre mascarados.</li>
          <li>Escritas na Meta com confirmação e trilha de auditoria.</li>
        </List>
        <P>
          Detalhes sobre quais dados pessoais são tratados, bases legais, retenção e direitos dos
          titulares estão na{" "}
          <Link href="/privacidade" className="text-primary underline underline-offset-2">
            Política de Privacidade
          </Link>
          .
        </P>
      </Section>

      {/* ------------------------------------------------------------ */}
      <Section id="problemas" title="Solução de problemas">
        <Table
          head={["Sintoma", "O que conferir"]}
          rows={[
            [
              "Venda não aparece",
              "A URL do webhook está cadastrada na plataforma com o token da área certa? O segredo salvo no painel é o mesmo da plataforma? Os eventos de compra estão marcados?",
            ],
            [
              "Venda entra como orgânica",
              "O anúncio tem utm_content={{ad.id}}? O link do checkout recebeu o parâmetro da plataforma (xcod ou utm_content) com o número do anúncio?",
            ],
            [
              "Campanhas sem gasto",
              "O token da Meta ainda tem acesso à conta? Busque as contas de novo em Integrações.",
            ],
            [
              "Template não aparece em Disparos",
              "Ele ainda está em análise ou foi reprovado na Meta — veja o status em Disparos → Templates.",
            ],
            [
              "Disparo com erro no Histórico",
              "Leia o erro da Meta na linha: número sem WhatsApp, janela/limite de envio do número, template pausado ou token expirado.",
            ],
            [
              "Disparo não saiu",
              "O número está na lista de bloqueio? A pessoa já comprou (lembretes são pulados)? A fila foi processada?",
            ],
            [
              "Push não chega",
              "Notificações permitidas no navegador/aparelho? No iPhone, o painel precisa estar instalado na tela de início.",
            ],
          ]}
        />
      </Section>
    </PublicDoc>
  );
}
