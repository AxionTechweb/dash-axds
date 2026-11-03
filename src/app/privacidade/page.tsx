import type { Metadata } from "next";

import {
  Code,
  List,
  Note,
  P,
  PublicDoc,
  Section,
  Strong,
  Table,
  type TocItem,
} from "@/components/legal/public-doc";
import { getBranding } from "@/lib/branding";
import { getLegalInfo, PRIVACY_UPDATED_AT } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: "Como os dados pessoais são coletados, usados, compartilhados e protegidos.",
};

const TOC: TocItem[] = [
  { id: "controlador", label: "Quem somos" },
  { id: "dados", label: "Dados que tratamos" },
  { id: "finalidades", label: "Para que usamos" },
  { id: "whatsapp", label: "Mensagens no WhatsApp" },
  { id: "cookies", label: "Cookies e identificadores" },
  { id: "compartilhamento", label: "Compartilhamento" },
  { id: "transferencia", label: "Transferência internacional" },
  { id: "retencao", label: "Retenção" },
  { id: "seguranca", label: "Segurança" },
  { id: "direitos", label: "Seus direitos" },
  { id: "exclusao-de-dados", label: "Exclusão de dados" },
  { id: "menores", label: "Menores de idade" },
  { id: "alteracoes", label: "Alterações" },
  { id: "contato", label: "Contato" },
];

export default async function PrivacidadePage() {
  const [branding, legal] = await Promise.all([getBranding(), getLegalInfo()]);
  const contact = legal.contactEmail ? (
    <a href={`mailto:${legal.contactEmail}`} className="text-primary underline underline-offset-2">
      {legal.contactEmail}
    </a>
  ) : (
    <>os canais oficiais de atendimento de {legal.companyName}</>
  );

  return (
    <PublicDoc
      branding={branding}
      eyebrow={`Atualizada em ${PRIVACY_UPDATED_AT}`}
      title="Política de Privacidade"
      toc={TOC}
      intro={
        <p>
          Esta política explica como <Strong>{legal.companyName}</Strong> trata dados pessoais no
          painel <Strong>{legal.productName}</Strong> — o sistema que reúne vendas, anúncios e
          comunicações da operação — e nas mensagens enviadas pelo WhatsApp a partir dele, em
          conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD) e com as
          políticas da Meta para a WhatsApp Business Platform.
        </p>
      }
    >
      <Section id="controlador" title="1. Quem somos">
        <P>
          O controlador dos dados é <Strong>{legal.companyName}</Strong>
          {legal.document ? <>, inscrita sob o nº {legal.document}</> : null}, responsável pela
          operação do painel {legal.productName}. Dúvidas e pedidos sobre privacidade podem ser
          enviados para {contact}, que também atua como canal do encarregado (DPO).
        </P>
      </Section>

      <Section id="dados" title="2. Dados que tratamos">
        <Table
          head={["Quem", "Dados", "Origem"]}
          rows={[
            [
              "Clientes (compradores)",
              "Nome, e-mail, telefone, cidade/estado, produto comprado, valor, forma e status do pagamento, parâmetros de campanha (UTMs e identificador do anúncio).",
              "Notificações (webhooks) enviadas pela plataforma de checkout em que a compra foi feita.",
            ],
            [
              "Leads e visitantes das páginas",
              "Identificador anônimo do navegador, páginas visitadas, parâmetros de campanha, endereço IP, navegador/dispositivo (user-agent) e localização aproximada derivada do IP. Telefone e nome, quando a pessoa os informa em formulário ou checkout.",
              "Script de medição instalado nas páginas da operação e formulários preenchidos pela própria pessoa.",
            ],
            [
              "Contatos do WhatsApp",
              "Número de telefone, primeiro nome, template enviado, data/hora e status de entrega da mensagem e pedidos de descadastro.",
              "Compras e cadastros acima, ou listas de contatos que a própria empresa já possui e envia ao painel.",
            ],
            [
              "Usuários do painel (equipe)",
              "E-mail, senha (armazenada apenas em formato criptografado pelo provedor de autenticação), registro de ações de gestão e inscrições de notificação push dos aparelhos.",
              "Cadastro feito por convite do administrador.",
            ],
          ]}
        />
        <P>
          Não coletamos dados sensíveis (saúde, religião, biometria etc.) nem dados completos de
          cartão de pagamento — o pagamento é processado inteiramente pela plataforma de checkout.
        </P>
      </Section>

      <Section id="finalidades" title="3. Para que usamos e bases legais">
        <Table
          head={["Finalidade", "Base legal (LGPD, art. 7º)"]}
          rows={[
            [
              "Registrar a compra, liberar acesso e enviar mensagens transacionais (confirmação, acesso, lembrete de pagamento pendente).",
              "Execução de contrato (inciso V).",
            ],
            [
              "Medir resultados de anúncios: saber qual campanha gerou cada venda, faturamento, custo e retorno.",
              "Legítimo interesse (inciso IX), com dados minimizados e exibidos de forma mascarada.",
            ],
            [
              "Prevenir fraude e abuso nos endpoints públicos (limite de requisições por IP).",
              "Legítimo interesse (inciso IX).",
            ],
            [
              "Enviar mensagens de marketing e recuperação de carrinho pelo WhatsApp.",
              "Consentimento (inciso I) ou legítimo interesse para quem já é cliente — sempre com opção de descadastro.",
            ],
            [
              "Cumprir obrigações legais, fiscais e responder a autoridades.",
              "Obrigação legal (inciso II) e exercício regular de direitos (inciso VI).",
            ],
          ]}
        />
        <P>
          <Strong>Não vendemos dados pessoais</Strong> e não os usamos para decisões automatizadas
          que afetem a pessoa. O painel também não envia eventos de conversão com dados pessoais
          para plataformas de anúncio.
        </P>
      </Section>

      <Section id="whatsapp" title="4. Mensagens no WhatsApp">
        <P>
          As mensagens são enviadas pela API oficial da Meta (WhatsApp Business Platform / Cloud
          API), usando apenas modelos de mensagem (templates) previamente aprovados pela Meta.
        </P>
        <List>
          <li>
            Enviamos mensagens apenas para números que forneceram o telefone à empresa — em uma
            compra, cadastro ou contato anterior — e que não pediram para sair.
          </li>
          <li>
            Mensagens transacionais (compra aprovada, pagamento pendente) se referem a uma ação da
            própria pessoa. Mensagens de marketing respeitam o consentimento e são limitadas por
            campanha.
          </li>
          <li>
            Antes de cada envio automático o sistema confere de novo a situação: se a compra já foi
            aprovada, o lembrete ou a recuperação de carrinho não é enviado.
          </li>
          <li>
            <Strong>Para não receber mais mensagens</Strong>, peça o descadastro por {contact}. O
            número entra na lista de bloqueio e nenhum envio futuro é feito para ele. Você também
            pode bloquear o número ou denunciar a conversa no próprio WhatsApp.
          </li>
        </List>
        <P>
          O conteúdo das mensagens trafega pela infraestrutura da Meta e está sujeito também à{" "}
          <a
            href="https://www.whatsapp.com/legal/privacy-policy"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2"
          >
            Política de Privacidade do WhatsApp
          </a>
          .
        </P>
      </Section>

      <Section id="cookies" title="5. Cookies e identificadores">
        <P>
          Nas páginas da operação, um script próprio grava um <Strong>identificador anônimo</Strong>{" "}
          (cookie primário e armazenamento local do navegador) e guarda os parâmetros de campanha
          (UTMs) da visita. Ele não contém nome, e-mail nem telefone e serve só para ligar a visita à
          compra correspondente. Você pode apagá-lo a qualquer momento limpando os cookies e dados do
          site no navegador.
        </P>
        <P>
          No próprio painel, usamos apenas cookies estritamente necessários para manter a sessão de
          login da equipe.
        </P>
      </Section>

      <Section id="compartilhamento" title="6. Com quem compartilhamos">
        <P>
          Os dados são compartilhados apenas com fornecedores que operam o serviço em nosso nome
          (operadores), na medida necessária:
        </P>
        <Table
          head={["Fornecedor", "Para quê"]}
          rows={[
            ["Supabase", "Banco de dados e autenticação do painel."],
            ["Vercel", "Hospedagem da aplicação."],
            [
              "Meta Platforms (WhatsApp Business Platform)",
              "Envio das mensagens de WhatsApp e gestão dos templates.",
            ],
            [
              "Meta Platforms (Marketing API)",
              "Leitura de métricas e gestão das campanhas de anúncio. Nenhum dado pessoal de cliente é enviado.",
            ],
            [
              "Plataformas de checkout (ex.: Hotmart, Kiwify, Hubla)",
              "Origem dos dados de compra; elas são controladoras dos dados de pagamento.",
            ],
            [
              "Google (Sheets e Analytics) e Vturb",
              "Relatórios com métricas agregadas de campanha e de vídeo — sem dados pessoais de clientes.",
            ],
          ]}
        />
        <P>
          Também podemos compartilhar dados quando exigido por lei, ordem judicial ou autoridade
          competente.
        </P>
      </Section>

      <Section id="transferencia" title="7. Transferência internacional">
        <P>
          Alguns fornecedores acima armazenam ou processam dados fora do Brasil. Nesses casos a
          transferência ocorre com base no art. 33 da LGPD, com fornecedores que adotam cláusulas
          contratuais e padrões de segurança compatíveis com a lei brasileira.
        </P>
      </Section>

      <Section id="retencao" title="8. Por quanto tempo guardamos">
        <List>
          <li>
            Dados de compra: enquanto houver relação com o cliente e pelos prazos legais de guarda
            fiscal e de defesa em processos (em regra, até 5 anos).
          </li>
          <li>
            Dados de navegação e leads sem compra: até 12 meses, ou antes se a pessoa pedir a
            exclusão.
          </li>
          <li>
            Histórico de mensagens do WhatsApp: até 12 meses. A lista de bloqueio é mantida enquanto
            o serviço existir, para garantir que o descadastro seja respeitado.
          </li>
          <li>Registros de limite de requisições (IP): apagados automaticamente após 1 hora.</li>
        </List>
      </Section>

      <Section id="seguranca" title="9. Segurança">
        <List>
          <li>Acesso ao painel apenas por usuários convidados, com login e senha; sem cadastro público.</li>
          <li>Comunicação sempre criptografada (HTTPS).</li>
          <li>
            Chaves e tokens de integração armazenados cifrados no banco; a chave de cifra fica fora
            do banco.
          </li>
          <li>Controle de acesso no banco (Row Level Security) em todas as tabelas.</li>
          <li>E-mails e telefones exibidos de forma mascarada na interface.</li>
          <li>Notificações de compra validadas pela assinatura ou token de cada plataforma.</li>
        </List>
        <P>
          Em caso de incidente de segurança que possa gerar risco relevante, comunicaremos os
          titulares afetados e a Autoridade Nacional de Proteção de Dados (ANPD), nos termos da lei.
        </P>
      </Section>

      <Section id="direitos" title="10. Seus direitos">
        <P>Pelo art. 18 da LGPD, você pode, a qualquer momento e sem custo:</P>
        <List>
          <li>confirmar se tratamos seus dados e acessá-los;</li>
          <li>corrigir dados incompletos, inexatos ou desatualizados;</li>
          <li>pedir anonimização, bloqueio ou eliminação de dados desnecessários ou excessivos;</li>
          <li>pedir a portabilidade dos dados;</li>
          <li>pedir a eliminação dos dados tratados com base no consentimento;</li>
          <li>saber com quem seus dados foram compartilhados;</li>
          <li>revogar o consentimento, inclusive para mensagens de marketing;</li>
          <li>apresentar reclamação à ANPD.</li>
        </List>
        <P>
          Para exercer qualquer direito, escreva para {contact}. Respondemos em até 15 dias e
          podemos pedir informações para confirmar sua identidade.
        </P>
      </Section>

      <Section id="exclusao-de-dados" title="11. Como pedir a exclusão dos seus dados">
        <List ordered>
          <li>
            Envie um pedido para {contact} com o assunto <Code>Exclusão de dados</Code>, informando o
            e-mail e/ou o telefone usados na compra ou no cadastro.
          </li>
          <li>Confirmaremos o recebimento e, se necessário, a sua identidade.</li>
          <li>
            Em até 15 dias, excluímos ou anonimizamos seus dados de compra, navegação e mensagens, e
            mantemos apenas o mínimo exigido por lei (por exemplo, registros fiscais) e o número na
            lista de bloqueio, para que nenhuma mensagem volte a ser enviada.
          </li>
          <li>Enviamos a confirmação da exclusão para o mesmo canal do pedido.</li>
        </List>
        <Note>
          Se você interagiu conosco por um aplicativo ou recurso da Meta (Facebook, Instagram ou
          WhatsApp), este mesmo procedimento vale como instrução de exclusão de dados. Dados mantidos
          pela própria Meta podem ser geridos nas configurações da sua conta Meta.
        </Note>
      </Section>

      <Section id="menores" title="12. Menores de idade">
        <P>
          Nossos produtos e comunicações são destinados a maiores de 18 anos. Não coletamos
          intencionalmente dados de crianças e adolescentes; se identificarmos esse caso, os dados
          serão excluídos.
        </P>
      </Section>

      <Section id="alteracoes" title="13. Alterações desta política">
        <P>
          Podemos atualizar esta política para refletir mudanças no serviço ou na lei. A data no
          topo indica a versão vigente; mudanças relevantes serão comunicadas pelos canais usuais.
        </P>
      </Section>

      <Section id="contato" title="14. Contato">
        <P>
          {legal.companyName}
          {legal.document ? <> · {legal.document}</> : null}
          <br />
          Privacidade e encarregado (DPO): {contact}
        </P>
      </Section>
    </PublicDoc>
  );
}
