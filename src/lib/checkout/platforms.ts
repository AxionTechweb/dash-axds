/**
 * REGISTRO DE PLATAFORMAS DE CHECKOUT — fonte única da verdade.
 *
 * Cada plataforma declara: como se autentica, onde ficam os campos no payload
 * e como conectar. A rota de webhook é genérica e lê tudo daqui, então
 * adicionar ou corrigir uma plataforma é editar uma entrada deste arquivo —
 * não escrever código novo.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ SOBRE `confirmed`                                                        │
 * │                                                                          │
 * │ `confirmed: true` significa que a ESTRUTURA do payload (caminhos dos     │
 * │ campos, formato do valor e autenticação) foi verificada contra um envio  │
 * │ REAL. `false` significa que ainda há um ponto não confirmado — a UI      │
 * │ avisa isso na tela.                                                      │
 * │                                                                          │
 * │ Nada é perdido enquanto não se confirma: o `raw_webhook` é sempre salvo, │
 * │ mesmo quando a extração falha. A primeira venda real revela os caminhos  │
 * │ corretos e a correção é feita aqui.                                      │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Este arquivo é PURO (sem `server-only`): a UI também o importa para montar
 * a lista de plataformas e as instruções de conexão.
 */

/** Como o webhook prova que é legítimo. */
export type AuthMode =
  /** Segredo vem num header e é comparado em tempo constante. */
  | "header-token"
  /** Segredo vem num campo do corpo JSON, comparado em tempo constante. */
  | "body-token"
  /** Assinatura HMAC do CORPO BRUTO, em header ou query string. */
  | "hmac"
  /**
   * Segredo vem CRU (sem hash) num parâmetro da query string, comparado em
   * tempo constante. Usado por plataformas que não aceitam header nem campo
   * de corpo customizado (ex.: Mundpay — o segredo vai embutido na própria
   * URL do webhook, tipo `?token=<segredo>`).
   */
  | "query-token";

export type PlatformAuth = {
  mode: AuthMode;
  /** Nomes de header candidatos (minúsculos). Para `header-token` e `hmac`. */
  headers?: string[];
  /** Parâmetros de query candidatos (para HMAC em query, ex.: Kiwify). */
  queryParams?: string[];
  /** Caminhos candidatos no corpo (para `body-token`). */
  bodyPaths?: string[];
  /** Algoritmos aceitos para HMAC, na ordem de tentativa. */
  algorithms?: ("sha256" | "sha1")[];
};

/** Caminhos candidatos de cada campo, tentados em ordem. */
export type PlatformPaths = {
  transaction: string[];
  status: string[];
  event?: string[];
  value: string[];
  currency?: string[];
  email: string[];
  phone?: string[];
  product?: string[];
  /** Cartão, PIX, boleto... texto cru da plataforma (normalizado na rota). */
  paymentMethod?: string[];
  /** Rastreio: onde o ad_id pode chegar. */
  adId: string[];
  /** Identificador do visitante (só útil com captura própria). */
  userId?: string[];
  utmSource?: string[];
  utmMedium?: string[];
  utmCampaign?: string[];
  utmTerm?: string[];
  utmContent?: string[];
  geoCountry?: string[];
  geoRegion?: string[];
  geoCity?: string[];
};

export type CheckoutPlatform = {
  id: string;
  label: string;
  /** Estrutura do payload verificada contra um envio real? */
  confirmed: boolean;
  /** Valores chegam em centavos (inteiro dividido por 100)? */
  amountInCents: boolean | "unknown";
  /** Qual parâmetro o código externo deve usar no link do checkout. */
  trackingParam: string;
  auth: PlatformAuth;
  /** Rótulo e dica do campo de segredo na tela de Integrações. */
  secretLabel: string;
  secretHint: string;
  /**
   * Alguns rastreadores externos empacotam várias UTMs num único campo,
   * separadas por `|` (ex.: o `sck` da Hotmart chega como
   * "ig|social|bio|null|null"). Quando declarado, o campo `userId` é
   * desempacotado nesta ordem e usado como fonte das UTMs.
   */
  pipedTrackingOrder?: ("source" | "medium" | "campaign" | "term" | "content")[];
  /**
   * Quando o campo do `ad_id` vem COMPOSTO (vários ids num campo só, separados
   * por `_`, `|` ou `-`), qual pedaço é o `{{ad.id}}`.
   *   last    → último pedaço numérico (padrão; o id costuma ser o mais específico)
   *   first   → primeiro
   *   longest → o mais longo (útil quando o outro pedaço é um timestamp curto)
   * Ignorado quando o campo já é um id limpo.
   */
  adIdSegment?: "last" | "first" | "longest";
  /**
   * Valores-sentinela que a plataforma manda no lugar de "vazio" (ex.: a Ticto
   * envia "Não Informado" nos campos de rastreio não preenchidos). Tratados
   * como null na extração, para não gravar "Não Informado" como utm_source.
   */
  placeholders?: string[];
  /**
   * Algumas plataformas mandam o rastreio como um ARRAY de {chave, valor}
   * (ex.: a Greenn usa `saleMetas: [{meta_key, meta_value}, ...]`). Quando
   * declarado, a rota achata esse array num objeto acessível por
   * `_meta.<chave>` — então os caminhos podem referenciar `_meta.utm_content`.
   */
  metaArray?: { path: string; keyField: string; valueField: string };
  /** Passo a passo de conexão, mostrado quando a plataforma é selecionada. */
  steps: string[];
  /** Observações honestas sobre o que ainda não foi verificado. */
  caveats?: string[];
  paths: PlatformPaths;
  /** Mapeia o status da plataforma para o status interno. */
  statusMap: Record<string, InternalStatus>;
};

// Duplicado de PurchaseStatus (src/lib/webhooks/status.ts) de propósito — este
// arquivo é zero-import por design. Mudar aqui? Muda lá também (e o CHECK do
// banco em purchases.status).
export type InternalStatus =
  | "approved"
  | "pending"
  | "refunded"
  | "chargeback"
  | "canceled"
  | "waiting_payment"
  | "abandoned";

/**
 * Status comuns a quase todas as plataformas brasileiras. Cada entrada do
 * registro pode acrescentar ou sobrescrever os seus.
 * Chaves em MAIÚSCULO — a comparação normaliza antes de consultar.
 */
const COMMON_STATUS: Record<string, InternalStatus> = {
  APPROVED: "approved",
  APROVADA: "approved",
  APROVADO: "approved",
  PAID: "approved",
  PAGO: "approved",
  COMPLETED: "approved",
  COMPLETE: "approved",
  ACTIVE: "approved",
  AUTHORIZED: "approved",

  PENDING: "pending",
  PENDENTE: "pending",
  PROCESSING: "pending",

  // Distintos de "pending" genérico — dá pra montar KPI específico de cada um.
  WAITING_PAYMENT: "waiting_payment",
  AGUARDANDO_PAGAMENTO: "waiting_payment",
  ABANDONED: "abandoned",
  LOST_CART: "abandoned",

  REFUNDED: "refunded",
  REEMBOLSADO: "refunded",
  REFUND: "refunded",

  CHARGEBACK: "chargeback",

  CANCELED: "canceled",
  CANCELLED: "canceled",
  CANCELADO: "canceled",
  EXPIRED: "canceled",
  REJECTED: "canceled",
  REFUSED: "canceled",
  RECUSADO: "canceled",
};

export const CHECKOUT_PLATFORMS: CheckoutPlatform[] = [
  /* ------------------------------------------------------------ HOTMART */
  {
    id: "hotmart",
    label: "Hotmart",
    confirmed: true,
    amountInCents: false,
    // Confirmado nesta instalação: o ad_id chega pelo `xcod`, não pelo `src`.
    trackingParam: "xcod",
    auth: { mode: "header-token", headers: ["x-hotmart-hottok"] },
    // Observado num payload real: sck = "ig|social|bio|null|null".
    pipedTrackingOrder: ["source", "medium", "campaign", "term", "content"],
    /**
     * Nesta instalação o `xcod` chega LIMPO — só o {{ad.id}} —, então o
     * desmonte de campo composto nem é acionado. Fica declarado como rede de
     * segurança: se algum dia o rastreador passar a empilhar valores
     * ("<algo>_<ad_id>"), o último pedaço numérico é o que vale.
     */
    adIdSegment: "last",
    secretLabel: "Hottok",
    secretHint: "Ferramentas → Webhook → copie o hottok da sua conta",
    steps: [
      "Na Hotmart, abra Ferramentas → Webhook (Notificações).",
      "Cole a URL de webhook mostrada acima e salve.",
      "Marque os eventos de compra (aprovada, reembolso, chargeback).",
      "Copie o hottok gerado e cole no campo abaixo.",
      "No link do checkout, seu código externo deve enviar xcod=<ad_id>. O painel lê o ad_id de origin.xcod.",
    ],
    caveats: [
      "Confirmado com payload real (versão 2.0.0): o valor vem em REAIS e o país em country_iso.",
      "O ad_id chega em origin.xcod — LIMPO, só os dígitos do {{ad.id}}. O src é lido apenas como alternativa.",
      "O sck vem com as UTMs empacotadas por pipe (\"ig|social|bio|null|null\") e é desempacotado — não é id de visitante.",
    ],
    paths: {
      transaction: [
        "data.purchase.transaction",
        "data.purchase.transaction_id",
        "data.transaction",
      ],
      status: ["data.purchase.status", "data.status", "status"],
      event: ["event"],
      value: [
        "data.purchase.price.value",
        "data.purchase.full_price.value",
        "data.purchase.original_offer_price.value",
      ],
      currency: [
        "data.purchase.price.currency_value",
        "data.purchase.price.currency_code",
      ],
      email: ["data.buyer.email", "data.subscriber.email"],
      phone: ["data.buyer.checkout_phone", "data.buyer.phone"],
      product: ["data.product.name", "data.product.id"],
      adId: [
        "data.purchase.origin.xcod",
        "data.origin.xcod",
        "data.purchase.xcod",
        "data.purchase.origin.src",
        "data.purchase.src",
        "data.origin.src",
        "data.purchase.origin.utm_content",
      ],
      userId: ["data.purchase.origin.sck", "data.purchase.sck"],
      utmSource: [
        "data.purchase.origin.utm_source",
        "data.purchase.tracking.utm_source",
      ],
      utmMedium: [
        "data.purchase.origin.utm_medium",
        "data.purchase.tracking.utm_medium",
      ],
      utmCampaign: [
        "data.purchase.origin.utm_campaign",
        "data.purchase.tracking.utm_campaign",
      ],
      utmTerm: ["data.purchase.origin.utm_term"],
      utmContent: [
        "data.purchase.origin.utm_content",
        "data.purchase.origin.src",
      ],
      geoCountry: [
        "data.buyer.address.country_iso",
        "data.buyer.address.countryISO",
      ],
      geoRegion: ["data.buyer.address.state"],
      geoCity: ["data.buyer.address.city"],
    },
    statusMap: {
      ...COMMON_STATUS,
      STARTED: "pending",
      BILLET_PRINTED: "pending",
      PRINTED_BILLET: "pending",
      UNDER_ANALISYS: "pending", // grafia da própria Hotmart
      UNDER_ANALYSIS: "pending",
      DELAYED: "pending",
      PROTESTED: "chargeback",
      PROTEST: "chargeback",
      BLOCKED: "canceled",
      OVERDUE: "canceled",
    },
  },

  /* ------------------------------------------------------------- KIWIFY */
  {
    id: "kiwify",
    label: "Kiwify",
    confirmed: true,
    // CONFIRMADO num payload real: charge_amount 47832 = R$ 478,32
    // (product_base_price 39700 = R$ 397,00). Centavos.
    amountInCents: true,
    trackingParam: "utm_content",
    auth: {
      mode: "hmac",
      queryParams: ["signature"],
      algorithms: ["sha256", "sha1"],
    },
    // O sck da Kiwify chega COMPOSTO ("<timestamp>_<ad_id>"), como o xcod da
    // Hotmart. Usamos o último pedaço numérico.
    adIdSegment: "last",
    secretLabel: "Token de assinatura",
    secretHint: "Apps → Webhooks → copie o token do webhook",
    steps: [
      "Na Kiwify, abra Apps → Webhooks.",
      "Cole a URL de webhook mostrada acima.",
      "Marque os eventos de compra.",
      "Copie o token de assinatura e cole no campo abaixo.",
      "No link do checkout, envie utm_content=<ad_id> (ou deixe o rastreio no sck).",
    ],
    caveats: [
      "Confirmado com payload real: o valor vem em CENTAVOS (charge_amount 47832 = R$ 478,32).",
      "O ad_id costuma chegar em TrackingParameters.sck, composto (\"<timestamp>_<ad_id>\") — usamos o último pedaço. Confira contra o ad_id real e troque adIdSegment se preciso.",
      "A assinatura é HMAC em ?signature=; aceitamos sha1 e sha256 (ambos exigem o segredo).",
    ],
    paths: {
      transaction: ["order_id", "id"],
      status: ["order_status", "status"],
      event: ["webhook_event_type"],
      value: ["Commissions.charge_amount", "charge_amount"],
      currency: ["Commissions.currency", "currency"],
      email: ["Customer.email"],
      phone: ["Customer.mobile", "Customer.phone"],
      product: ["Product.product_name"],
      adId: [
        "TrackingParameters.utm_content",
        "TrackingParameters.sck",
        "TrackingParameters.src",
        "utm_content",
      ],
      // sck aqui carrega o rastreio do anúncio, não um id de visitante.
      userId: ["TrackingParameters.s1"],
      utmSource: ["TrackingParameters.utm_source"],
      utmMedium: ["TrackingParameters.utm_medium"],
      utmCampaign: ["TrackingParameters.utm_campaign"],
      utmTerm: ["TrackingParameters.utm_term"],
      utmContent: ["TrackingParameters.utm_content"],
      geoCountry: ["Customer.country"],
      geoRegion: ["Customer.state"],
      geoCity: ["Customer.city"],
    },
    statusMap: {
      ...COMMON_STATUS,
      // `chargedback` (com D) é a grafia da Kiwify — o casamento por substring
      // não pegaria "CHARGEBACK" dentro dela.
      CHARGEDBACK: "chargeback",
      COMPRA_APROVADA: "approved",
      COMPRA_RECUSADA: "canceled",
      COMPRA_REEMBOLSADA: "refunded",
      BOLETO_GERADO: "pending",
      PIX_GERADO: "pending",
      SUBSCRIPTION_RENEWED: "approved",
      SUBSCRIPTION_CANCELED: "canceled",
      SUBSCRIPTION_LATE: "pending",
    },
  },

  /* ------------------------------------------------------------ KIRVANO */
  {
    id: "kirvano",
    label: "Kirvano",
    confirmed: true,
    // CONFIRMADO num payload real: total_price = "R$ 169,80" (reais, formatado
    // como texto — o parser de moeda lida com "R$" e vírgula).
    amountInCents: false,
    trackingParam: "utm_content",
    auth: { mode: "header-token", headers: ["security-token", "x-kirvano-token"] },
    secretLabel: "Token de segurança",
    secretHint: "Configurações → Webhooks → token gerado ao criar o webhook",
    steps: [
      "Na Kirvano, abra Configurações → Webhooks e crie um novo webhook.",
      "Cole a URL mostrada acima e marque os eventos de venda.",
      "Copie o token de segurança e cole no campo abaixo.",
      "No link do checkout, envie utm_content=<ad_id>.",
    ],
    caveats: [
      "Confirmado com payload real: valor em REAIS (\"R$ 169,80\") e rastreio no objeto utm.*.",
      "O ad_id chega em utm.utm_content. Confirme na primeira venda que teve anúncio (o exemplo veio com valores de teste).",
      "O header de autenticação (security-token) é o padrão da Kirvano; confirme no primeiro webhook.",
    ],
    paths: {
      transaction: ["sale_id", "checkout_id", "id"],
      status: ["status", "event"],
      event: ["event"],
      value: ["total_price", "price"],
      currency: ["currency"],
      email: ["customer.email"],
      phone: ["customer.phone_number", "customer.phone"],
      product: ["products.0.name", "product.name"],
      adId: ["utm.utm_content", "utm.src", "utm_content"],
      userId: ["utm.sck", "sck"],
      utmSource: ["utm.utm_source"],
      utmMedium: ["utm.utm_medium"],
      utmCampaign: ["utm.utm_campaign"],
      utmTerm: ["utm.utm_term"],
      utmContent: ["utm.utm_content"],
      geoCountry: ["customer.country", "customer.address.country"],
      geoRegion: ["customer.state", "customer.address.state"],
      geoCity: ["customer.city", "customer.address.city"],
    },
    statusMap: { ...COMMON_STATUS, SALE_APPROVED: "approved" },
  },

  /* -------------------------------------------------------- PERFECT PAY */
  {
    id: "perfectpay",
    label: "Perfect Pay",
    confirmed: true,
    // CONFIRMADO num payload real: sale_amount 397 = R$ 397,00 (Plano 270). Reais.
    amountInCents: false,
    trackingParam: "utm_content",
    // CONFIRMADO: o token vem no corpo do postback (campo "token").
    auth: { mode: "body-token", bodyPaths: ["token"] },
    // metadata.utm_perfect chega composto ("<timestamp>_<ad_id>").
    adIdSegment: "last",
    secretLabel: "Token do postback",
    secretHint: "Ferramentas → Postback/API → token de integração",
    steps: [
      "Na Perfect Pay, abra Ferramentas → Postback (ou Integrações → API).",
      "Cole a URL mostrada acima como destino do postback.",
      "Copie o token de integração e cole no campo abaixo.",
      "No link do checkout, envie utm_content=<ad_id>.",
    ],
    caveats: [
      "Confirmado com payload real: valor em REAIS e token de autenticação no corpo.",
      "O ad_id chega em metadata.utm_perfect, composto (\"<timestamp>_<ad_id>\") — usamos o último pedaço. Também lemos metadata.utm_content.",
    ],
    paths: {
      transaction: ["code", "code_transaction", "sale_id"],
      status: ["sale_status_enum_key", "sale_status_detail", "status"],
      value: ["sale_amount", "amount"],
      currency: ["currency_enum_key", "currency"],
      email: ["customer.email"],
      phone: ["customer.phone_formated", "customer.phone_number"],
      product: ["product.name", "plan.name"],
      adId: [
        "metadata.utm_content",
        "metadata.utm_perfect",
        "metadata.src",
        "utm_content",
      ],
      userId: ["metadata.sck"],
      utmSource: ["metadata.utm_source"],
      utmMedium: ["metadata.utm_medium"],
      utmCampaign: ["metadata.utm_campaign"],
      utmTerm: ["metadata.utm_term"],
      utmContent: ["metadata.utm_content"],
      geoCountry: ["customer.country"],
      geoRegion: ["customer.state"],
      geoCity: ["customer.city"],
    },
    statusMap: { ...COMMON_STATUS, BILLET: "pending" },
  },

  /* --------------------------------------------------------------- TICTO */
  {
    id: "ticto",
    label: "Ticto",
    confirmed: false,
    // CONFIRMADO num payload real: paid_amount 10000 e producer.amount 11052 =
    // cms "110.52" → centavos.
    amountInCents: true,
    trackingParam: "utm_content",
    // CONFIRMADO: o token vem no corpo (campo "token").
    auth: { mode: "body-token", bodyPaths: ["token"] },
    // A Ticto preenche o rastreio vazio com o texto "Não Informado".
    placeholders: ["Não Informado", "Nao Informado"],
    secretLabel: "Token do webhook",
    secretHint: "Integrações → Webhooks → token exibido ao criar",
    steps: [
      "Na Ticto, abra Integrações → Webhooks e crie um novo.",
      "Cole a URL mostrada acima e marque os eventos de compra.",
      "Copie o token e cole no campo abaixo.",
      "No link do checkout, envie utm_content=<ad_id>.",
    ],
    caveats: [
      "Estrutura, valor (CENTAVOS) e autenticação (token no corpo) confirmados com payload real.",
      "NÃO CONFIRMADO: o ad_id. O exemplo veio com o rastreio em branco (\"Não Informado\"); o ad_id deve chegar em tracking.utm_content — confirme numa venda que teve anúncio.",
      "O país vem como \"Brasil\" (não ISO); o painel converte para BR. Estado e cidade são lidos normalmente.",
    ],
    paths: {
      transaction: ["order.transaction_hash", "order.hash", "transaction.hash"],
      status: ["status"],
      value: ["order.paid_amount", "item.amount"],
      currency: ["currency"],
      email: ["customer.email"],
      phone: ["customer.phone"],
      product: ["item.product_name", "product.name"],
      adId: ["tracking.utm_content", "tracking.src", "tracking.sck"],
      userId: ["customer.code"],
      utmSource: ["tracking.utm_source"],
      utmMedium: ["tracking.utm_medium"],
      utmCampaign: ["tracking.utm_campaign"],
      utmTerm: ["tracking.utm_term"],
      utmContent: ["tracking.utm_content"],
      geoCountry: ["customer.address.country"],
      geoRegion: ["customer.address.state"],
      geoCity: ["customer.address.city"],
    },
    statusMap: { ...COMMON_STATUS },
  },

  /* --------------------------------------------------------------- CAKTO */
  {
    id: "cakto",
    label: "Cakto",
    confirmed: false,
    // O exemplo mostra amount "34.35" / baseAmount "33.00" → reais (decimal).
    amountInCents: false,
    trackingParam: "utm_content",
    auth: { mode: "header-token", headers: ["x-cakto-signature", "authorization"] },
    secretLabel: "Segredo do webhook",
    secretHint: "Configurações → Webhooks",
    steps: [
      "Na Cakto, abra Configurações → Webhooks.",
      "Cole a URL mostrada acima e selecione os eventos de compra.",
      "Copie o segredo e cole no campo abaixo.",
      "No link do checkout, envie utm_content=<ad_id>.",
    ],
    caveats: [
      "NÃO CONFIRMADO: o exemplo recebido é uma LISTA da API (results[]), não o corpo do webhook — o envelope real pode diferir. Lemos tanto results.0.* quanto a raiz.",
      "NÃO CONFIRMADO: o header de autenticação. A primeira venda revela pelo log do 401.",
      "Valor em reais (decimal, ex.: \"34.35\").",
    ],
    paths: {
      transaction: ["id", "refId", "results.0.id", "data.id"],
      status: ["status", "results.0.status", "data.status"],
      value: ["amount", "results.0.amount", "data.amount"],
      currency: ["currency", "results.0.currency"],
      email: ["customer.email", "results.0.customer.email", "data.customer.email"],
      phone: ["customer.phone", "results.0.customer.phone"],
      product: ["product.name", "results.0.product.name", "data.product.name"],
      adId: [
        "utm_content",
        "results.0.utm_content",
        "sck",
        "results.0.sck",
      ],
      userId: ["sck", "results.0.sck"],
      utmSource: ["utm_source", "results.0.utm_source"],
      utmMedium: ["utm_medium", "results.0.utm_medium"],
      utmCampaign: ["utm_campaign", "results.0.utm_campaign"],
      utmTerm: ["utm_term", "results.0.utm_term"],
      utmContent: ["utm_content", "results.0.utm_content"],
      geoCountry: ["address.country", "results.0.address.country"],
      geoRegion: ["address.state", "results.0.address.state"],
      geoCity: ["address.city", "results.0.address.city"],
    },
    statusMap: { ...COMMON_STATUS },
  },

  /* -------------------------------------------------------------- GREENN */
  {
    id: "greenn",
    label: "Greenn",
    confirmed: false,
    // O exemplo mostra sale.total 49.9 → reais (decimal).
    amountInCents: false,
    trackingParam: "utm_content",
    auth: { mode: "header-token", headers: ["authorization", "x-greenn-token"] },
    // O rastreio vem num array saleMetas [{meta_key, meta_value}] → _meta.<chave>.
    metaArray: { path: "saleMetas", keyField: "meta_key", valueField: "meta_value" },
    // O sck vem empacotado por pipe ("source|medium|campaign|null").
    pipedTrackingOrder: ["source", "medium", "campaign", "term", "content"],
    secretLabel: "Token do webhook",
    secretHint: "Configurações → Webhooks",
    steps: [
      "Na Greenn, abra Configurações → Webhooks.",
      "Cole a URL mostrada acima e marque os eventos de venda.",
      "Copie o token e cole no campo abaixo.",
      "No link do checkout, envie utm_content=<ad_id>.",
    ],
    caveats: [
      "NÃO CONFIRMADO: o header de autenticação. A primeira venda revela pelo log do 401.",
      "O rastreio vem no array saleMetas (chave/valor), que a rota achata para _meta.<chave>. No exemplo os valores eram de teste — confirme o ad_id numa venda real.",
      "Valor em reais (sale.total decimal).",
    ],
    paths: {
      transaction: ["sale.id"],
      status: ["sale.status", "currentStatus", "status"],
      event: ["event"],
      value: ["sale.total", "sale.amount"],
      currency: ["currency"],
      email: ["client.email"],
      phone: ["client.cellphone"],
      product: ["product.name", "offer.name"],
      adId: ["_meta.utm_content", "_meta.utm_term", "_meta.sck"],
      userId: ["_meta.sck"],
      utmSource: ["_meta.utm_source"],
      utmMedium: ["_meta.utm_medium"],
      utmCampaign: ["_meta.utm_campaign"],
      utmTerm: ["_meta.utm_term"],
      utmContent: ["_meta.utm_content"],
      geoRegion: ["client.uf", "client.state"],
      geoCity: ["client.city"],
    },
    statusMap: { ...COMMON_STATUS, SALEPAID: "approved", SALEREFUSED: "canceled" },
  },

  /* ---------------------------------------------------------------- PAYT */
  {
    id: "payt",
    label: "PayT",
    confirmed: false,
    // CONFIRMADO num payload real (venda não-teste, test:false): product.price
    // 19700 = soma exata das comissões (638 + 19062) = R$ 197,00. Centavos.
    // transaction.total_price (24444) inclui juros do parcelamento (12x) e NÃO
    // é usado — infla o faturamento com dinheiro que vai para a maquininha/
    // cartão, não para o vendedor.
    amountInCents: true,
    trackingParam: "utm_content",
    // Confirmado pela doc oficial (help.payt.com.br/article/155-postback):
    // "Sua chave de integração, serve para você poder validar se realmente o
    // postback se origina do PayT" — mesmo desenho de segredo-no-corpo já
    // usado por Perfect Pay/Ticto.
    auth: { mode: "body-token", bodyPaths: ["integration_key"] },
    // utm_content chega composto ("<nome-do-criativo>|<ad_id>"), confirmado
    // num payload real: "...-h45b45|120249638140130720".
    adIdSegment: "last",
    secretLabel: "Chave de integração",
    secretHint:
      "Painel PayT (app.payt.com.br) → Produtos/Ofertas → Postbacks (ou Ferramentas → Integrações) → chave de integração da conta",
    steps: [
      "No painel da PayT (app.payt.com.br), abra Produtos/Ofertas → Postbacks (ou Ferramentas → Integrações).",
      "Crie um postback para vendas avulsas e cole a URL mostrada acima.",
      "Marque pelo menos os eventos Finalizada/Aprovada, Cancelada, Chargeback e Reembolsada.",
      "Copie a chave de integração (integration_key) da sua conta e cole no campo abaixo.",
      "No link do checkout, seu código externo deve enviar utm_content=<ad_id>.",
    ],
    caveats: [
      'NÃO CONFIRMADO plenamente: só o status "paid" foi observado num payload real. Os demais (waiting_payment, refused, refunded, chargeback, expired, e os de assinatura/entrega física) vêm da documentação oficial da PayT, não de um payload — status desconhecido vira pending com segurança, nunca é descartado.',
      "O valor usa product.price / transaction.price_without_installments (bate com a soma das comissões no exemplo real). transaction.total_price NÃO é usado de propósito: inclui juros do parcelamento.",
      "A autenticação (integration_key no corpo) é confirmada pela documentação oficial da PayT, mas ainda não testada nesta instalação — confira que a 'Chave de integração' colada no painel é a mesma da sua conta PayT.",
      "Sem campos de endereço (país/estado/cidade) no payload de exemplo — geo fica nulo, é esperado.",
      'O rótulo exato dos menus no painel da PayT não foi verificado (a doc oficial não detalha telas) — procure por "Postback" nas configurações.',
    ],
    paths: {
      transaction: ["transaction_id", "cart_id"],
      // payment_status primeiro: para produtos físicos o `status` de topo pode
      // virar "separation"/"shipped" (entrega) mesmo já pago — payment_status
      // reflete só o pagamento.
      status: ["transaction.payment_status", "status"],
      value: ["product.price", "transaction.price_without_installments"],
      email: ["customer.email"],
      phone: ["customer.phone"],
      product: ["product.name"],
      // Confirmado num payload real: "credit_card".
      paymentMethod: ["transaction.payment_method"],
      adId: ["link.sources.utm_content"],
      // Confirmado em payloads reais: "link.sources.src" carrega o mesmo ID
      // de visitante que a captura própria (GTM) grava em cookie/localStorage
      // e decora no link do checkout — é o "SRC" usado para casar a compra
      // com a jornada em events_log/visitors.
      userId: ["link.sources.src"],
      utmSource: ["link.sources.utm_source"],
      utmMedium: ["link.sources.utm_medium"],
      utmCampaign: ["link.sources.utm_campaign"],
      utmTerm: ["link.sources.utm_term"],
      utmContent: ["link.sources.utm_content"],
    },
    statusMap: {
      ...COMMON_STATUS,
      SEPARATION: "approved",
      SHIPPED: "approved",
      // LOST_CART já vem de COMMON_STATUS como "abandoned" — confirmado pelo
      // usuário: é o evento "Abandono de Checkout" da PayT.
      SUBSCRIPTION_CANCELED: "canceled",
      SUBSCRIPTION_RENEWED: "approved",
      SUBSCRIPTION_REACTIVATED: "approved",
      SUBSCRIPTION_LATE: "pending",
      ORDER_FRUSTRATED: "canceled",
      ORDER_CONFIRMED: "approved",
    },
  },

  /* --------------------------------------------------------------- HUBLA */
  {
    id: "hubla",
    label: "Hubla",
    confirmed: false,
    // Confirmado pela doc oficial (hubla.gitbook.io/docs/webhooks/eventos/fatura),
    // com exemplo real de payload: amount.totalCents 34100 = amount.total 341
    // (reais). Centavos.
    amountInCents: true,
    trackingParam: "utm_content",
    // Confirmado pela doc oficial (hubla.gitbook.io/docs/webhooks/proteja-seu-endpoint):
    // "x-hubla-token — autentica a requisição: confirma que ela saiu da Hubla."
    auth: { mode: "header-token", headers: ["x-hubla-token"] },
    secretLabel: "Hubla Webhook Token",
    secretHint: "Integrações → Webhook → aba Autenticação → Hubla Webhook Token",
    steps: [
      "Na Hubla, abra Integrações → Webhook.",
      "Na aba Configurações, clique em \"Adicionar regra\" e cole a URL de webhook mostrada acima.",
      "Marque pelo menos os eventos de fatura: paga, reembolsada, com chargeback/contestação e vencida/cancelada.",
      "Na aba Autenticação, copie o \"Hubla Webhook Token\" e cole no campo abaixo.",
      "No link de pagamento, envie utm_content=<ad_id>.",
    ],
    caveats: [
      "NÃO CONFIRMADO nesta instalação: só a doc oficial foi conferida, ainda falta uma venda de teste real pra validar os caminhos abaixo.",
      "Estrutura e valor (CENTAVOS, event.invoice.amount.totalCents) vêm do exemplo oficial da doc — bate a conta (34100 = R$ 341,00).",
      "O payload tem DOIS objetos de pessoa: event.user (quem comprou — usado aqui) e event.invoice.payer (dados de faturamento, nem sempre preenchido). event.user é o campo certo — confirmado contra uma implementação real já em produção com a Hubla.",
      "O ad_id deve chegar em paymentSession.utm.content — a doc só mostra source/medium/campaign no exemplo; confirme term/content numa venda com anúncio. A Hubla manda a sessão de pagamento em paymentSession no payload atual e em firstPaymentSession no formato antigo — os dois são tentados.",
      "NÃO CONFIRMADO: endereço (país/estado/cidade). O exemplo oficial não tinha billingAddress preenchido — pode não existir em vendas de produto digital.",
      "status=\"unpaid\" tem mapeamento EXPLÍCITO pra waiting_payment — sem isso, o casamento por substring do mapStatus leria \"PAID\" dentro de \"UNPAID\" e marcaria como aprovada por engano.",
    ],
    paths: {
      transaction: ["event.invoice.id"],
      status: ["event.invoice.status"],
      event: ["type"],
      value: ["event.invoice.amount.totalCents"],
      currency: ["event.invoice.currency"],
      email: ["event.user.email", "event.invoice.payer.email"],
      phone: ["event.user.phone", "event.invoice.payer.phone"],
      product: ["event.product.name"],
      paymentMethod: ["event.invoice.paymentMethod"],
      adId: [
        "event.invoice.paymentSession.utm.content",
        "event.invoice.firstPaymentSession.utm.content",
        "event.invoice.paymentSession.utm.term",
        "event.invoice.firstPaymentSession.utm.term",
      ],
      utmSource: ["event.invoice.paymentSession.utm.source", "event.invoice.firstPaymentSession.utm.source"],
      utmMedium: ["event.invoice.paymentSession.utm.medium", "event.invoice.firstPaymentSession.utm.medium"],
      utmCampaign: ["event.invoice.paymentSession.utm.campaign", "event.invoice.firstPaymentSession.utm.campaign"],
      utmTerm: ["event.invoice.paymentSession.utm.term", "event.invoice.firstPaymentSession.utm.term"],
      utmContent: ["event.invoice.paymentSession.utm.content", "event.invoice.firstPaymentSession.utm.content"],
      geoCountry: ["event.invoice.billingAddress.countryCode"],
      geoRegion: ["event.invoice.billingAddress.state"],
      geoCity: ["event.invoice.billingAddress.city"],
    },
    statusMap: {
      ...COMMON_STATUS,
      // Sem isso, "UNPAID".includes("PAID") casaria por substring como approved.
      UNPAID: "waiting_payment",
      OVERDUE: "pending",
      DISPUTED: "chargeback",
    },
  },

  /* ---------------------------------------------------------------- GURU */
  {
    id: "guru",
    label: "Guru Digital",
    confirmed: false,
    amountInCents: false,
    trackingParam: "utm_content",
    // A Guru manda o token no CORPO (api_token), às vezes dentro de um
    // wrapper { payload: {...} } — por isso os dois caminhos candidatos.
    auth: { mode: "body-token", bodyPaths: ["api_token", "payload.api_token"] },
    // utm_content costuma vir composto (pipe), como o sck da Hotmart/Kiwify.
    adIdSegment: "last",
    secretLabel: "API Token",
    secretHint: "Guru → Configurações → Integrações → Webhooks → token de API",
    steps: [
      "No Guru Digital, abra Configurações → Integrações → Webhooks para transações.",
      "Cole a URL mostrada acima.",
      "Copie o API Token e cole no campo abaixo.",
      "No link do checkout, envie utm_content=<ad_id>.",
    ],
    caveats: [
      "NÃO CONFIRMADO nesta instalação: baseado na doc oficial (docs.digitalmanager.guru) e numa implementação de referência já em produção, mas sem venda de teste rodada aqui.",
      "O payload às vezes vem embrulhado em { payload: {...} } — os dois formatos (com e sem wrapper) são lidos.",
      "Telefone chega em dois campos separados (DDD + número); só o número é lido por ora — confirme se falta o DDD numa venda real.",
      "CHARGEDBACK tem mapeamento explícito pra chargeback — sem isso cairia em 'pending' por não ter substring em comum com nenhuma chave conhecida.",
    ],
    paths: {
      transaction: ["id", "payload.id"],
      status: ["status", "payload.status"],
      value: ["payment.total", "payload.payment.total"],
      currency: ["payment.currency", "payload.payment.currency"],
      email: ["contact.email", "payload.contact.email"],
      phone: ["contact.phone_number", "payload.contact.phone_number"],
      product: ["product.name", "payload.product.name"],
      paymentMethod: ["payment.method", "payload.payment.method"],
      adId: ["source.utm_content", "payload.source.utm_content"],
      utmSource: ["source.utm_source", "payload.source.utm_source"],
      utmMedium: ["source.utm_medium", "payload.source.utm_medium"],
      utmCampaign: ["source.utm_campaign", "payload.source.utm_campaign"],
      utmTerm: ["source.utm_term", "payload.source.utm_term"],
      utmContent: ["source.utm_content", "payload.source.utm_content"],
      geoCountry: ["infrastructure.country", "payload.infrastructure.country"],
      geoRegion: ["contact.state", "payload.contact.state"],
      geoCity: ["contact.city", "payload.contact.city"],
    },
    statusMap: { ...COMMON_STATUS, CHARGEDBACK: "chargeback" },
  },

  /* --------------------------------------------------------------- EDUZZ */
  {
    id: "eduzz",
    label: "Eduzz",
    confirmed: false,
    amountInCents: false,
    trackingParam: "utm_content",
    auth: { mode: "header-token", headers: ["x-eduzz-token"] },
    secretLabel: "Chave de autenticação",
    secretHint: "Eduzz → MyEduzz → Integrações → Webhook → chave de autenticação",
    steps: [
      "Na Eduzz (MyEduzz), abra Integrações → Webhook.",
      "Cole a URL mostrada acima e marque os eventos de fatura (paga, reembolsada, cancelada, expirada, recusada, chargeback).",
      "Copie a chave de autenticação e cole no campo abaixo.",
      "No link do checkout, envie utm_content=<ad_id>.",
    ],
    caveats: [
      "NÃO CONFIRMADO: baseado na doc oficial (docs.eduzz.com/docs/getting-started/webhook) e numa implementação de referência. A Eduzz também pode assinar via HMAC-SHA256 em x-signature em vez do header direto — se o token direto falhar (401 recorrente), avise que dá pra trocar o modo de autenticação.",
      "O comprador vem em data.buyer OU data.student, dependendo do tipo de produto — os dois são lidos.",
      "Status e evento já cobrem os nomes comuns (paid/refunded/canceled/expired/refused/chargeback) via o mapeamento genérico — sem entradas extras necessárias.",
    ],
    paths: {
      transaction: ["data.id"],
      status: ["data.status", "status"],
      event: ["event"],
      value: ["data.paid.value", "data.price.value"],
      currency: ["data.paid.currency", "data.price.currency"],
      email: ["data.buyer.email", "data.student.email"],
      phone: ["data.buyer.cellphone", "data.buyer.phone", "data.student.cellphone"],
      product: ["data.items.0.name", "data.offer.name"],
      paymentMethod: ["data.payment.method"],
      adId: ["data.utm.content"],
      utmSource: ["data.utm.source"],
      utmMedium: ["data.utm.medium"],
      utmCampaign: ["data.utm.campaign"],
      utmTerm: ["data.utm.term"],
      utmContent: ["data.utm.content"],
      geoCountry: ["data.buyer.address.country"],
      geoCity: ["data.buyer.address.city"],
    },
    statusMap: { ...COMMON_STATUS },
  },

  /* ----------------------------------------------------------- MONETIZZE */
  {
    id: "monetizze",
    label: "Monetizze",
    confirmed: false,
    amountInCents: false,
    trackingParam: "utm_content",
    auth: { mode: "header-token", headers: ["x-monetizze-token", "monetizze-token"] },
    secretLabel: "Chave Única",
    secretHint: "Monetizze → Minha conta → Chave única de postback",
    steps: [
      "Na Monetizze, abra Minha conta → Postback (ou Produtos → Postback do produto).",
      "Cole a URL mostrada acima.",
      "Copie a Chave Única e cole no campo abaixo.",
      "No link do checkout, envie utm_content=<ad_id>.",
    ],
    caveats: [
      "NÃO CONFIRMADO: a Monetizze manda o status como um CÓDIGO NUMÉRICO (codigo_status), não texto — os significados abaixo vêm da doc oficial (app.monetizze.com.br/api/postback) e de uma implementação de referência, não de um payload real desta instalação.",
      "codigo_status 102 (\"assinatura inadimplente\") foi mapeado como pending, não como canceled — é uma escolha conservadora (cobrança pode normalizar); reveja se não bater com a realidade.",
      "Sem utm_term documentado — fica de fora.",
    ],
    paths: {
      transaction: ["venda.codigo", "codigo_venda", "chave_unica"],
      status: ["codigo_status", "postback_evento"],
      value: ["venda.valor", "produtos.0.valor"],
      email: ["comprador.email"],
      phone: ["comprador.telefone"],
      product: ["produto.nome", "produtos.0.nome"],
      paymentMethod: ["venda.formaPagamento", "venda.meioPagamento"],
      adId: ["venda.utm_content", "venda.src"],
      utmSource: ["venda.utm_source"],
      utmMedium: ["venda.utm_medium"],
      utmCampaign: ["venda.utm_campaign"],
      utmContent: ["venda.utm_content"],
      geoCountry: ["comprador.pais"],
      geoRegion: ["comprador.estado"],
      geoCity: ["comprador.cidade"],
    },
    statusMap: {
      ...COMMON_STATUS,
      "1": "waiting_payment",
      "2": "approved",
      "3": "canceled",
      "4": "refunded",
      "5": "canceled",
      "6": "approved",
      "101": "approved",
      "102": "pending",
      "103": "canceled",
      "104": "waiting_payment",
    },
  },

  /* ------------------------------------------------------------- MUNDPAY */
  {
    id: "mundpay",
    label: "Mundpay",
    confirmed: false,
    // Confirmado numa implementação de referência: amount vem em centavos (string).
    amountInCents: true,
    trackingParam: "utm_content",
    // A Mundpay NÃO aceita headers customizados — o segredo vai embutido na
    // própria URL do webhook, tipo ?token=<segredo>. Por isso o modo é
    // query-token (segredo cru, comparado direto, sem hash).
    auth: { mode: "query-token", queryParams: ["token"] },
    secretLabel: "Token (vai na URL, não aqui)",
    secretHint:
      "Gere um valor aleatório forte e use o MESMO valor nos dois lugares: cole aqui embaixo E acrescente ?token=<esse-valor> no final da URL de webhook que você cadastrar na Mundpay.",
    steps: [
      "Defina um token aleatório forte (ex.: gerador de senha) e cole no campo abaixo.",
      "Na Mundpay, cadastre a URL de webhook ACIMA com ?token=<o-mesmo-token> no final — a Mundpay não tem campo de segredo separado.",
      "Marque os eventos de pagamento (pago, reembolsado, chargeback).",
      "No link do checkout, envie utm_content=<ad_id>.",
    ],
    caveats: [
      "NÃO CONFIRMADO: baseado numa implementação de referência já em produção (sem doc pública da Mundpay disponível).",
      "Segredo na query string aparece em logs de acesso do servidor — risco aceito pela própria Mundpay não suportar headers customizados.",
      "CHARGEDBACK (grafia com D, como a Kiwify usa) tem mapeamento explícito — sem isso cairia em pending.",
    ],
    paths: {
      transaction: ["id"],
      status: ["status"],
      event: ["event_type"],
      value: ["amount"],
      currency: ["currency"],
      email: ["customer.email"],
      phone: ["customer.phone"],
      product: ["offers.0.name", "offers.0.product.name"],
      paymentMethod: ["payment_method"],
      adId: ["tracking.utm_content", "tracking.sck", "tracking.xcod"],
      utmSource: ["tracking.utm_source"],
      utmMedium: ["tracking.utm_medium"],
      utmCampaign: ["tracking.utm_campaign"],
      utmTerm: ["tracking.utm_term"],
      utmContent: ["tracking.utm_content"],
      geoCountry: ["customer.location.country"],
      geoRegion: ["customer.location.state"],
      geoCity: ["customer.location.city"],
    },
    statusMap: { ...COMMON_STATUS, CHARGEDBACK: "chargeback" },
  },

  /* ----------------------------------------------------------- CARTPANDA */
  {
    id: "cartpanda",
    label: "CartPanda",
    confirmed: false,
    amountInCents: false,
    trackingParam: "utm_content",
    // Sem doc pública (confirmado no WEBHOOKS.md de referência) — header
    // genérico, mesmo tratamento dado a Cakto/Greenn nesta instalação.
    auth: { mode: "header-token", headers: ["x-webhook-token", "x-api-token", "authorization"] },
    // A CartPanda manda o rastreio como ARRAY [{parameter_name, parameter_value}],
    // não como objeto — achatado em _meta.<chave> pelo metaArray.
    metaArray: {
      path: "order.tracking_parameters",
      keyField: "parameter_name",
      valueField: "parameter_value",
    },
    secretLabel: "Segredo do webhook",
    secretHint: "CartPanda → Configurações → Webhooks",
    steps: [
      "Na CartPanda, abra Configurações → Webhooks.",
      "Cole a URL mostrada acima e marque os eventos order.paid e order.refunded.",
      "Copie o segredo/token exibido e cole no campo abaixo.",
      "No link do checkout, envie utm_content=<ad_id>.",
    ],
    caveats: [
      "NÃO CONFIRMADO: sem documentação pública da CartPanda. O header de autenticação é um PALPITE — confira pelo log quando a autenticação falhar (nomes de header aparecem, nunca valores).",
      "Valor em reais (decimal) — sem confirmação de centavos.",
      "Evento (order.paid/order.refunded) decide o status — não há campo de status separado.",
    ],
    paths: {
      transaction: ["order.id"],
      status: ["event"],
      event: ["event"],
      value: ["order.payment.amount"],
      currency: ["order.currency"],
      email: ["order.customer.email", "order.email"],
      phone: ["order.customer.phone"],
      product: ["order.line_items.0.title", "order.line_items.0.name"],
      paymentMethod: ["order.payment.payment_type", "order.payment.type"],
      adId: ["_meta.utm_content"],
      utmSource: ["_meta.utm_source"],
      utmMedium: ["_meta.utm_medium"],
      utmCampaign: ["_meta.utm_campaign"],
      utmTerm: ["_meta.utm_term"],
      utmContent: ["_meta.utm_content"],
    },
    statusMap: { ...COMMON_STATUS },
  },

  /* ---------------------------------------------------------- GGCHECKOUT */
  {
    id: "ggcheckout",
    label: "GGCheckout",
    confirmed: false,
    amountInCents: false,
    trackingParam: "utm_content",
    // Sem doc pública — header genérico (mesmo tratamento de Cakto/Greenn).
    auth: { mode: "header-token", headers: ["x-webhook-token", "x-api-token", "authorization"] },
    secretLabel: "Segredo do webhook",
    secretHint: "GGCheckout → Configurações → Webhooks",
    steps: [
      "Na GGCheckout, abra Configurações → Webhooks.",
      "Cole a URL mostrada acima e marque os eventos de pix/cartão pago e reembolsado.",
      "Copie o segredo exibido e cole no campo abaixo.",
      "No link do checkout, envie utm_content=<ad_id>.",
    ],
    caveats: [
      "NÃO CONFIRMADO: sem documentação pública. O header de autenticação é um PALPITE — confira pelo log quando a autenticação falhar.",
      "Evento (pix.paid/card.paid/pix.refunded/card.refunded/pix.chargeback/card.chargeback) decide o status — não há campo de status separado.",
      "Moeda não vem no payload — assumida BRL.",
    ],
    paths: {
      transaction: ["payment.id"],
      status: ["event"],
      event: ["event"],
      value: ["payment.amount"],
      email: ["customer.email"],
      phone: ["customer.phone"],
      product: ["product.title", "products.0.title"],
      paymentMethod: ["payment.paymentMethod"],
      adId: ["params.utm_content", "params.sck", "params.src"],
      utmSource: ["params.utm_source"],
      utmMedium: ["params.utm_medium"],
      utmCampaign: ["params.utm_campaign"],
      utmTerm: ["params.utm_term"],
      utmContent: ["params.utm_content"],
    },
    statusMap: { ...COMMON_STATUS },
  },

  /* ------------------------------------------------------------ LASTLINK */
  {
    id: "lastlink",
    label: "LastLink",
    confirmed: false,
    amountInCents: false,
    trackingParam: "utm_content",
    // Sem doc pública — header genérico.
    auth: { mode: "header-token", headers: ["x-webhook-token", "x-api-token", "authorization"] },
    secretLabel: "Segredo do webhook",
    secretHint: "LastLink → Configurações → Integrações → Webhook",
    steps: [
      "Na LastLink, abra Configurações → Integrações → Webhook.",
      "Cole a URL mostrada acima.",
      "Copie o segredo exibido e cole no campo abaixo.",
      "No link do checkout, envie utm_content=<ad_id>.",
    ],
    caveats: [
      "A MENOS CONFIRMADA das plataformas novas: a LastLink usa PascalCase nos campos (Buyer.Email, Purchase.PaymentId) e não tem um campo de status textual — o payload de compra (com `Purchase` preenchido) não traz status, e o de cancelamento/estorno vem num formato DIFERENTE (sem transaction id, só um Subscription.Id), que esta rota genérica não sabe casar de volta com a venda original.",
      "O campo 'Action' usado aqui pra decidir aprovado/cancelado é uma INFERÊNCIA (visto só no caminho de cancelamento como Action=\"remove\") — se não existir no payload de compra, a venda grava como pending em vez de approved. Confirme com urgência numa venda de teste real.",
      "payload.IsTest=true (eventos de sandbox da LastLink) NÃO é filtrado aqui — pode gravar vendas de teste como se fossem reais até isso ser revisado.",
      "Sem confirmação de centavos — valor assumido em reais (Purchase.Price.Value).",
    ],
    paths: {
      transaction: ["Purchase.PaymentId"],
      status: ["Action"],
      value: ["Purchase.Price.Value"],
      email: ["Buyer.Email"],
      phone: ["Buyer.PhoneNumber"],
      product: ["Product.Name", "Products.0.Name"],
      paymentMethod: ["Purchase.Payment.PaymentMethod"],
      adId: ["Utm.UtmContent"],
      utmSource: ["Utm.UtmSource"],
      utmMedium: ["Utm.UtmMedium"],
      utmCampaign: ["Utm.UtmCampaign"],
      utmTerm: ["Utm.UtmTerm"],
      utmContent: ["Utm.UtmContent"],
    },
    statusMap: { ...COMMON_STATUS, ADD: "approved", REMOVE: "canceled" },
  },

  /* --------------------------------------------------------------- WIVEN */
  {
    id: "wiven",
    label: "Wiven",
    confirmed: false,
    // Só a COMISSÃO estava mapeada na integração de referência (container
    // sGTM) — sem campo de valor bruto conhecido. Fica como aproximação.
    amountInCents: false,
    trackingParam: "utm_content",
    auth: { mode: "header-token", headers: ["x-webhook-token", "x-api-token", "authorization"] },
    secretLabel: "Segredo do webhook",
    secretHint: "Wiven → Configurações → Webhooks",
    steps: [
      "Na Wiven, abra Configurações → Webhooks.",
      "Cole a URL mostrada acima e marque os eventos de transação paga/reembolsada/chargeback.",
      "Copie o segredo exibido e cole no campo abaixo.",
      "No link do checkout, envie utm_content=<ad_id>.",
    ],
    caveats: [
      "NÃO CONFIRMADO: campos vistos num container sGTM real em produção (não um payload cru) — confiáveis pra identidade/rastreio, mas o valor é a COMISSÃO (transaction.commissionAmount), não necessariamente o preço cheio da venda.",
      "Header de autenticação é PALPITE — confira pelo log quando falhar.",
    ],
    paths: {
      transaction: ["transaction.id"],
      status: [
        "transaction.status",
        "status",
        "payment_status",
        "transaction.status",
        "payment.status",
        "data.status",
        "sale.status",
        "order.status",
      ],
      event: ["event", "event_name", "type"],
      value: ["transaction.commissionAmount"],
      currency: ["transaction.currency"],
      email: ["client.email"],
      phone: ["client.phone"],
      product: ["orderItems.0.product.name"],
      paymentMethod: ["transaction.paymentMethod", "transaction.payment_method"],
      adId: ["trackProps.utm_content", "trackProps.content", "trackProps.sck"],
      utmSource: ["trackProps.utm_source", "trackProps.source"],
      utmMedium: ["trackProps.utm_medium", "trackProps.medium"],
      utmCampaign: ["trackProps.utm_campaign", "trackProps.campaign"],
      utmTerm: ["trackProps.utm_term", "trackProps.term"],
      utmContent: ["trackProps.utm_content", "trackProps.content"],
    },
    statusMap: {
      ...COMMON_STATUS,
      TRANSACTION_PAID: "approved",
      TRANSACTION_REFUNDED: "refunded",
      TRANSACTION_CHARGEBACK: "chargeback",
      TRANSACTION_CHARGED_BACK: "chargeback",
    },
  },

  /* -------------------------------------------------------------- FRENDZ */
  {
    id: "frendz",
    label: "Frendz",
    confirmed: false,
    // Confirmado num container sGTM real: regex de centavos aplicado ao preço.
    amountInCents: true,
    trackingParam: "utm_content",
    auth: { mode: "header-token", headers: ["x-webhook-token", "x-api-token", "authorization"] },
    secretLabel: "Segredo do webhook",
    secretHint: "Frendz → Configurações → Webhooks",
    steps: [
      "Na Frendz, abra Configurações → Webhooks.",
      "Cole a URL mostrada acima.",
      "Copie o segredo exibido e cole no campo abaixo.",
      "No link do checkout, envie utm_content=<ad_id>.",
    ],
    caveats: [
      "NÃO CONFIRMADO: campos vistos num container sGTM real em produção, não um payload cru desta instalação.",
      "O evento é 'transaction' pra toda transação — quem decide aprovado/recusado é o campo de status, sem lista de eventos conhecida.",
      "Header de autenticação é PALPITE — confira pelo log quando falhar.",
    ],
    paths: {
      transaction: ["transaction.id"],
      status: ["transaction.status", "status", "payment_status", "payment.status", "data.status", "sale.status", "order.status"],
      event: ["event", "event_name"],
      value: ["offer.price"],
      email: ["customer.email"],
      phone: ["customer.phone"],
      product: ["offer.title"],
      paymentMethod: ["transaction.payment_method", "transaction.method"],
      adId: ["tracking.utm_content", "tracking.content", "tracking.src"],
      utmSource: ["tracking.utm_source", "tracking.source"],
      utmMedium: ["tracking.utm_medium", "tracking.medium"],
      utmCampaign: ["tracking.utm_campaign", "tracking.campaign"],
      utmTerm: ["tracking.utm_term", "tracking.term"],
      utmContent: ["tracking.utm_content", "tracking.content"],
    },
    statusMap: { ...COMMON_STATUS },
  },

  /* ------------------------------------------------------------ HEROSPARK */
  {
    id: "herospark",
    label: "Herospark",
    confirmed: false,
    // Confirmado num container sGTM real: purchase.price.value em reais.
    amountInCents: false,
    trackingParam: "utm_content",
    auth: { mode: "header-token", headers: ["x-webhook-token", "x-api-token", "authorization"] },
    secretLabel: "Segredo do webhook",
    secretHint: "Herospark → Configurações → Webhooks",
    steps: [
      "Na Herospark, abra Configurações → Webhooks.",
      "Cole a URL mostrada acima.",
      "Copie o segredo exibido e cole no campo abaixo.",
      "No link do checkout, envie utm_content=<ad_id>.",
    ],
    caveats: [
      "NÃO CONFIRMADO: campos vistos num container sGTM real em produção (que disparava em TODO webhook, sem checar status) — aqui o status manda, com segurança a mais: sem um status reconhecido, a venda fica pending em vez de aprovar sozinha.",
      "Header de autenticação é PALPITE — confira pelo log quando falhar.",
    ],
    paths: {
      transaction: ["transaction_id"],
      status: ["purchase.status", "status", "payment_status", "payment.status", "data.status", "sale.status", "order.status"],
      event: ["event", "event_name"],
      value: ["purchase.price.value"],
      email: ["buyer.email"],
      phone: ["buyer.phone"],
      product: ["product.name"],
      geoCountry: ["data.purchase.checkout_country.iso"],
      adId: ["utm.utm_content", "utm.content", "utm.src"],
      utmSource: ["utm.utm_source", "utm.source"],
      utmMedium: ["utm.utm_medium", "utm.medium"],
      utmCampaign: ["utm.utm_campaign", "utm.campaign"],
      utmTerm: ["utm.utm_term", "utm.term"],
      utmContent: ["utm.utm_content", "utm.content"],
    },
    statusMap: { ...COMMON_STATUS },
  },

  /* --------------------------------------------------------------- KAVOO */
  {
    id: "kavoo",
    label: "Kavoo",
    confirmed: false,
    // Só a COMISSÃO estava mapeada na integração de referência — sem campo
    // de valor bruto conhecido. Fica como aproximação.
    amountInCents: true,
    trackingParam: "utm_content",
    auth: { mode: "header-token", headers: ["x-webhook-token", "x-api-token", "authorization"] },
    secretLabel: "Segredo do webhook",
    secretHint: "Kavoo → Configurações → Webhooks",
    steps: [
      "Na Kavoo, abra Configurações → Webhooks.",
      "Cole a URL mostrada acima.",
      "Copie o segredo exibido e cole no campo abaixo.",
      "No link do checkout, envie utm_content=<ad_id>.",
    ],
    caveats: [
      "NÃO CONFIRMADO: campos vistos num container sGTM real em produção, não um payload cru desta instalação. O valor é a COMISSÃO (transaction.fee_producer), não necessariamente o preço cheio.",
      "Header de autenticação é PALPITE — confira pelo log quando falhar.",
    ],
    paths: {
      transaction: ["transaction.code"],
      status: ["transaction.status", "status", "payment_status", "payment.status", "data.status", "sale.status", "order.status"],
      event: ["event", "event_name"],
      value: ["transaction.fee_producer"],
      email: ["customer.email"],
      phone: ["customer.phone"],
      product: ["items.0.name"],
      paymentMethod: ["transaction.payment_method"],
      adId: ["tracking.utm_content", "tracking.content", "tracking.src"],
      utmSource: ["tracking.utm_source", "tracking.source"],
      utmMedium: ["tracking.utm_medium", "tracking.medium"],
      utmCampaign: ["tracking.utm_campaign", "tracking.campaign"],
      utmTerm: ["tracking.utm_term", "tracking.term"],
      utmContent: ["tracking.utm_content", "tracking.content"],
    },
    statusMap: { ...COMMON_STATUS },
  },

  /* ------------------------------------------------------------ PAGTRUST */
  {
    id: "pagtrust",
    label: "PagTrust",
    confirmed: false,
    // Mesmo formato do webhook da Hotmart (data.buyer, data.purchase,
    // data.commissions) — confirmado numa implementação de referência.
    amountInCents: false,
    trackingParam: "xcod",
    auth: { mode: "header-token", headers: ["x-webhook-token", "x-api-token", "authorization"] },
    pipedTrackingOrder: ["source", "medium", "campaign", "term", "content"],
    adIdSegment: "last",
    secretLabel: "Segredo do webhook",
    secretHint: "PagTrust → Configurações → Webhooks",
    steps: [
      "Na PagTrust, abra Configurações → Webhooks.",
      "Cole a URL mostrada acima e marque os eventos de compra aprovada/reembolsada/chargeback.",
      "Copie o segredo exibido e cole no campo abaixo.",
      "No link do checkout, seu código externo deve enviar xcod=<ad_id> (mesmo formato da Hotmart).",
    ],
    caveats: [
      "NÃO CONFIRMADO nesta instalação: a estrutura do payload (igual à Hotmart) vem de uma implementação de referência já em produção, não de um payload cru daqui.",
      "Header de autenticação é PALPITE — a PagTrust não tem doc pública conhecida. Confira pelo log quando falhar.",
      "'adress' (sem o 'd' duplo) é como o payload de referência escreve endereço — os dois (adress/address) são tentados.",
    ],
    paths: {
      transaction: ["data.purchase.transaction"],
      status: ["data.purchase.status"],
      event: ["event"],
      value: ["data.purchase.price.value", "data.purchase.full_price.value"],
      currency: ["data.purchase.price.currency_value"],
      email: ["data.buyer.email"],
      phone: ["data.buyer.checkout_phone", "data.buyer.phone"],
      product: ["data.product.name"],
      paymentMethod: ["data.purchase.payment.type"],
      adId: [
        "data.purchase.origin.xcod",
        "data.origin.xcod",
        "data.purchase.origin.src",
        "data.purchase.origin.utm_content",
      ],
      userId: ["data.purchase.origin.sck"],
      utmSource: ["data.purchase.origin.utm_source"],
      utmMedium: ["data.purchase.origin.utm_medium"],
      utmCampaign: ["data.purchase.origin.utm_campaign"],
      utmTerm: ["data.purchase.origin.utm_term"],
      utmContent: ["data.purchase.origin.utm_content"],
      geoCountry: ["data.purchase.checkout_country.iso"],
      geoRegion: ["data.buyer.adress.state", "data.buyer.address.state"],
      geoCity: ["data.buyer.adress.city", "data.buyer.address.city"],
    },
    statusMap: {
      ...COMMON_STATUS,
      STARTED: "pending",
      BILLET_PRINTED: "pending",
      PRINTED_BILLET: "pending",
      UNDER_ANALISYS: "pending",
      UNDER_ANALYSIS: "pending",
      DELAYED: "pending",
      PROTESTED: "chargeback",
      PROTEST: "chargeback",
      BLOCKED: "canceled",
      OVERDUE: "canceled",
    },
  },

  /* -------------------------------------------------------------- ASSINY */
  {
    id: "assiny",
    label: "Assiny",
    confirmed: false,
    // Confirmado num container sGTM real: regex de centavos aplicado.
    amountInCents: true,
    trackingParam: "xcod",
    auth: { mode: "header-token", headers: ["x-webhook-token", "x-api-token", "authorization"] },
    secretLabel: "Segredo do webhook",
    secretHint: "Assiny → Configurações → Webhooks",
    steps: [
      "Na Assiny, abra Configurações → Webhooks.",
      "Cole a URL mostrada acima e marque os eventos de compra aprovada/reembolsada/chargeback.",
      "Copie o segredo exibido e cole no campo abaixo.",
      "No link do checkout, envie xcod=<ad_id>.",
    ],
    caveats: [
      "NÃO CONFIRMADO: campos vistos num container sGTM real em produção, não um payload cru desta instalação.",
      "Header de autenticação é PALPITE — confira pelo log quando falhar.",
    ],
    paths: {
      transaction: ["data.transaction.id"],
      status: ["data.transaction.status", "status", "payment_status", "payment.status", "data.status", "sale.status", "order.status"],
      event: ["event", "event_name"],
      value: ["data.offer.amount_client"],
      email: ["data.client.email"],
      phone: ["data.client.phone"],
      product: ["data.offer.product.name"],
      paymentMethod: ["data.transaction.payment_method"],
      adId: ["data.metadata.url_parameters.xcod", "data.metadata.url_parameters.utm_content"],
      utmSource: ["data.metadata.url_parameters.utm_source"],
      utmMedium: ["data.metadata.url_parameters.utm_medium"],
      utmCampaign: ["data.metadata.url_parameters.utm_campaign"],
      utmTerm: ["data.metadata.url_parameters.utm_term"],
      utmContent: ["data.metadata.url_parameters.utm_content"],
    },
    statusMap: {
      ...COMMON_STATUS,
      APPROVED_PURCHASE: "approved",
      REFUNDED_PURCHASE: "refunded",
      PURCHASE_REFUNDED: "refunded",
      CHARGEBACK_PURCHASE: "chargeback",
    },
  },

  /* --------------------------------------------------------------- YAMPI */
  {
    id: "yampi",
    label: "Yampi",
    confirmed: false,
    // Confirmado num container sGTM real: resource.value_total em reais.
    amountInCents: false,
    trackingParam: "utm_content",
    auth: { mode: "header-token", headers: ["x-webhook-token", "x-api-token", "authorization"] },
    secretLabel: "Segredo do webhook",
    secretHint: "Yampi → Configurações → Webhooks",
    steps: [
      "Na Yampi, abra Configurações → Webhooks.",
      "Cole a URL mostrada acima e marque os eventos order.paid/order.refunded/order.chargeback.",
      "Copie o segredo exibido e cole no campo abaixo.",
      "No link do checkout, envie utm_content=<ad_id>.",
    ],
    caveats: [
      "NÃO CONFIRMADO: campos vistos num container sGTM real em produção, não um payload cru desta instalação.",
      "Header de autenticação é PALPITE — confira pelo log quando falhar.",
      "O indexador de rastreio original usava utm_term, não utm_content — os dois são tentados, content primeiro.",
    ],
    paths: {
      transaction: ["resource.id"],
      status: ["resource.status.data.alias"],
      event: ["event"],
      value: ["resource.value_total"],
      email: ["resource.customer.data.email"],
      phone: ["resource.customer.data.phone.formated_number", "resource.customer.data.phone.full_number"],
      product: ["resource.items.data.0.sku.data.title"],
      paymentMethod: ["resource.payments.data.0.name"],
      geoRegion: ["resource.shipping_address.data.uf", "resource.shipping_address.data.state"],
      geoCity: ["resource.shipping_address.data.city"],
      adId: ["resource.utm_content", "resource.utm_term"],
      utmSource: ["resource.utm_source"],
      utmMedium: ["resource.utm_medium"],
      utmCampaign: ["resource.utm_campaign"],
      utmTerm: ["resource.utm_term"],
      utmContent: ["resource.utm_content"],
    },
    statusMap: { ...COMMON_STATUS },
  },

  /* --------------------------------------------------------------- WIAPY */
  {
    id: "wiapy",
    label: "Wiapy",
    confirmed: false,
    // Confirmado num container sGTM real: regex de centavos aplicado.
    amountInCents: true,
    trackingParam: "utm_content",
    auth: { mode: "header-token", headers: ["x-webhook-token", "x-api-token", "authorization"] },
    secretLabel: "Segredo do webhook",
    secretHint: "Wiapy → Configurações → Webhooks",
    steps: [
      "Na Wiapy, abra Configurações → Webhooks.",
      "Cole a URL mostrada acima.",
      "Copie o segredo exibido e cole no campo abaixo.",
      "No link do checkout, envie utm_content=<ad_id>.",
    ],
    caveats: [
      "NÃO CONFIRMADO: campos vistos num container sGTM real em produção (que disparava em TODO webhook, sem checar status) — aqui o status manda, com segurança a mais: sem um status reconhecido, a venda fica pending em vez de aprovar sozinha.",
      "Header de autenticação é PALPITE — confira pelo log quando falhar.",
      "O indexador de rastreio original usava utm_term, não utm_content — os dois são tentados, content primeiro.",
    ],
    paths: {
      transaction: ["payment.id"],
      status: ["payment.status", "status", "payment_status", "data.status", "sale.status", "order.status"],
      event: ["event", "event_name"],
      value: ["payment.amount"],
      email: ["customer.email"],
      phone: ["customer.mobile_phone", "customer.phone"],
      product: ["products.0.title"],
      paymentMethod: ["payment.method", "payment.payment_method"],
      adId: ["tracking.utm_content", "tracking.utm_term"],
      utmSource: ["tracking.utm_source"],
      utmMedium: ["tracking.utm_medium"],
      utmCampaign: ["tracking.utm_campaign"],
      utmTerm: ["tracking.utm_term"],
      utmContent: ["tracking.utm_content"],
    },
    statusMap: { ...COMMON_STATUS },
  },

  /* -------------------------------------------------------------- DOPPUS */
  {
    id: "doppus",
    label: "Doppus",
    confirmed: false,
    // Só a COMISSÃO estava mapeada na integração de referência — sem campo
    // de valor bruto conhecido. Fica como aproximação.
    amountInCents: true,
    trackingParam: "utm_content",
    auth: { mode: "header-token", headers: ["x-webhook-token", "x-api-token", "authorization"] },
    secretLabel: "Segredo do webhook",
    secretHint: "Doppus → Configurações → Webhooks",
    steps: [
      "Na Doppus, abra Configurações → Webhooks.",
      "Cole a URL mostrada acima.",
      "Copie o segredo exibido e cole no campo abaixo.",
      "No link do checkout, envie utm_content=<ad_id>.",
    ],
    caveats: [
      "NÃO CONFIRMADO: campos vistos num container sGTM real em produção (que disparava em TODO webhook, sem checar status) — aqui o status manda, com segurança a mais: sem um status reconhecido, a venda fica pending em vez de aprovar sozinha.",
      "O valor é a COMISSÃO (transaction.fee_producer), não necessariamente o preço cheio.",
      "status.code parece ser um CÓDIGO NUMÉRICO sem significado documentado — não mapeado; cai em pending com segurança até confirmar.",
      "Header de autenticação é PALPITE — confira pelo log quando falhar.",
      "O indexador de rastreio original usava utm_term, não utm_content — os dois são tentados, content primeiro.",
    ],
    paths: {
      transaction: ["transaction.code"],
      status: ["transaction.status", "status", "payment_status", "payment.status", "data.status", "sale.status", "order.status"],
      event: ["event", "event_name"],
      value: ["transaction.fee_producer"],
      email: ["customer.email"],
      phone: ["customer.phone"],
      product: ["items.0.name"],
      paymentMethod: ["transaction.payment_method", "payment.method"],
      adId: ["tracking.utm_content", "tracking.utm_term"],
      utmSource: ["tracking.utm_source"],
      utmMedium: ["tracking.utm_medium"],
      utmCampaign: ["tracking.utm_campaign"],
      utmTerm: ["tracking.utm_term"],
      utmContent: ["tracking.utm_content"],
    },
    statusMap: { ...COMMON_STATUS },
  },
];

/** Ids válidos — usado pelo zod, pelo check do banco e pela rota genérica. */
export const PLATFORM_IDS = CHECKOUT_PLATFORMS.map((p) => p.id);

export function getPlatform(id: string): CheckoutPlatform | null {
  return CHECKOUT_PLATFORMS.find((p) => p.id === id) ?? null;
}

/**
 * Traduz o status da plataforma para o interno.
 * Desconhecido vira `pending` — NUNCA descartamos uma venda por não reconhecer
 * o status; é melhor gravar como pendente e corrigir depois.
 */
export function mapStatus(
  platform: CheckoutPlatform,
  raw: string | null,
  event: string | null,
): InternalStatus {
  const candidates = [raw, event].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const key = candidate.trim().toUpperCase().replace(/[\s-]+/g, "_");
    if (platform.statusMap[key]) return platform.statusMap[key];

    // Casamento por substring: cobre "PURCHASE_APPROVED", "order_approved" etc.
    for (const [needle, status] of Object.entries(platform.statusMap)) {
      if (key.includes(needle)) return status;
    }
  }

  return "pending";
}
