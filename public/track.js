/*!
 * Snippet de captura — Painel de Tracking e Atribuição (white label)
 *
 * Uso na landing page:
 *   <script src="https://SEU-PAINEL/track.js" data-area="TOKEN_PUBLICO_DA_AREA" defer></script>
 *
 * O que faz:
 *  - gera/lê o user_id anônimo (cookie first-party + localStorage);
 *  - captura UTMs e referrer (e guarda o ad_id vindo de utm_content);
 *  - chama /api/identify e /api/event (page_view, initiate_checkout);
 *  - decora links de checkout (Hotmart/Kiwify) e WhatsApp com user_id e ad_id.
 *
 * Este script apenas ALIMENTA o painel. Não envia nada para Meta/GA4.
 */
(function () {
  "use strict";

  var script =
    document.currentScript ||
    (function () {
      var all = document.getElementsByTagName("script");
      return all[all.length - 1];
    })();

  if (!script) return;

  var AREA = script.getAttribute("data-area");
  if (!AREA) {
    console.warn("[track] atributo data-area ausente — snippet desativado.");
    return;
  }

  // Base da API: por padrão, a origem de onde o próprio script foi servido.
  var ENDPOINT = script.getAttribute("data-endpoint");
  if (!ENDPOINT) {
    try {
      ENDPOINT = new URL(script.src, location.href).origin;
    } catch (e) {
      console.warn("[track] não foi possível resolver o endpoint.");
      return;
    }
  }

  var UID_KEY = "_tuid";
  var UTM_KEY = "_tutm";
  var ONE_YEAR = 60 * 60 * 24 * 365;
  var ID_ALPHABET =
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

  /* ----------------------------------------------------------------- infra */

  function safeGet(store, key) {
    try {
      return store.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function safeSet(store, key, value) {
    try {
      store.setItem(key, value);
    } catch (e) {
      /* storage indisponível (modo privado) — segue só com cookie */
    }
  }

  function getCookie(name) {
    var match = document.cookie.match(
      new RegExp("(^|;\\s*)" + name + "=([^;]*)")
    );
    return match ? decodeURIComponent(match[2]) : null;
  }

  function setCookie(name, value) {
    var secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie =
      name +
      "=" +
      encodeURIComponent(value) +
      "; Max-Age=" +
      ONE_YEAR +
      "; Path=/; SameSite=Lax" +
      secure;
  }

  /** id anônimo compacto e URL-safe (compatível com o sck da Hotmart). */
  function generateId() {
    var out = "";
    var i;
    if (window.crypto && window.crypto.getRandomValues) {
      var bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      for (i = 0; i < 16; i++) out += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
    } else {
      for (i = 0; i < 16; i++) {
        out += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
      }
    }
    return out;
  }

  function isValidId(value) {
    return typeof value === "string" && /^[0-9A-Za-z]{8,32}$/.test(value);
  }

  /** Cookie e localStorage se espelham: o que existir vence. */
  function resolveUserId() {
    var fromCookie = getCookie(UID_KEY);
    var fromStorage = safeGet(localStorage, UID_KEY);
    var id = isValidId(fromCookie)
      ? fromCookie
      : isValidId(fromStorage)
        ? fromStorage
        : generateId();

    setCookie(UID_KEY, id);
    safeSet(localStorage, UID_KEY, id);
    return id;
  }

  /* ------------------------------------------------------------------ utms */

  var UTM_FIELDS = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
  ];

  function currentUtms() {
    var params = new URLSearchParams(location.search);
    var found = {};
    var has = false;

    for (var i = 0; i < UTM_FIELDS.length; i++) {
      var key = UTM_FIELDS[i];
      var value = params.get(key);
      if (value) {
        found[key] = value;
        has = true;
      }
    }
    return has ? found : null;
  }

  /**
   * UTMs da URL vencem; sem UTMs na URL, reaproveita as guardadas (navegação
   * interna não perde a origem da visita).
   */
  function resolveUtms() {
    var fromUrl = currentUtms();
    if (fromUrl) {
      safeSet(localStorage, UTM_KEY, JSON.stringify(fromUrl));
      return fromUrl;
    }
    try {
      return JSON.parse(safeGet(localStorage, UTM_KEY) || "{}") || {};
    } catch (e) {
      return {};
    }
  }

  var USER_ID = resolveUserId();
  var UTMS = resolveUtms();
  // Os anúncios usam utm_content={{ad.id}} — é daí que sai o ad_id.
  var AD_ID = UTMS.utm_content || null;

  /* ------------------------------------------------------------------ rede */

  function post(path, data) {
    var url = ENDPOINT + path + "?a=" + encodeURIComponent(AREA);
    var payload = JSON.stringify(data);

    try {
      return fetch(url, {
        method: "POST",
        // text/plain evita o preflight CORS (o servidor faz o parse do JSON).
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: payload,
        keepalive: true,
        mode: "cors",
        credentials: "omit",
      });
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  function identify() {
    var data = {
      userId: USER_ID,
      referrer: document.referrer || null,
    };
    for (var i = 0; i < UTM_FIELDS.length; i++) {
      data[UTM_FIELDS[i]] = UTMS[UTM_FIELDS[i]] || null;
    }

    return post("/api/identify", data)
      .then(function (res) {
        return res && res.ok ? res.json() : null;
      })
      .then(function (body) {
        // Se o servidor devolveu outro id (ex.: o nosso era inválido), adota.
        if (body && isValidId(body.userId) && body.userId !== USER_ID) {
          USER_ID = body.userId;
          setCookie(UID_KEY, USER_ID);
          safeSet(localStorage, UID_KEY, USER_ID);
        }
      })
      .catch(function () {
        /* silencioso: captura nunca deve quebrar a página */
      });
  }

  function track(eventName) {
    var data = { userId: USER_ID, eventName: eventName };
    for (var i = 0; i < UTM_FIELDS.length; i++) {
      data[UTM_FIELDS[i]] = UTMS[UTM_FIELDS[i]] || null;
    }
    return post("/api/event", data).catch(function () {});
  }

  /* ----------------------------------------------------------- decoradores */

  function isHotmart(host) {
    return /(^|\.)hotmart\.com$/.test(host);
  }

  function isKiwify(host) {
    return /(^|\.)kiwify\.com(\.br)?$/.test(host);
  }

  function isWhatsApp(host) {
    return (
      host === "wa.me" ||
      host === "api.whatsapp.com" ||
      host === "web.whatsapp.com"
    );
  }

  function setParam(url, key, value) {
    if (value) url.searchParams.set(key, value);
  }

  function decorateLink(anchor) {
    var href = anchor.getAttribute("href");
    if (!href || href.charAt(0) === "#") return false;

    var url;
    try {
      url = new URL(href, location.href);
    } catch (e) {
      return false;
    }

    var host = url.hostname.toLowerCase();
    var isCheckout = false;

    if (isHotmart(host)) {
      // Hotmart: user_id no `sck`, ad_id no `src`.
      setParam(url, "sck", USER_ID);
      setParam(url, "src", AD_ID);
      isCheckout = true;
    } else if (isKiwify(host)) {
      // Kiwify: ad_id em utm_content. O parâmetro de rastreio do comprador é
      // enviado em `sck` e `s1` — a Fase 4 confirma qual deles a Kiwify
      // devolve no webhook (doc oficial) e então podemos enxugar.
      setParam(url, "sck", USER_ID);
      setParam(url, "s1", USER_ID);
      setParam(url, "utm_content", AD_ID);
      isCheckout = true;
    } else if (isWhatsApp(host)) {
      var text = url.searchParams.get("text") || "";
      if (text.indexOf(USER_ID) === -1) {
        url.searchParams.set("text", text + " (ref: " + USER_ID + ")");
      }
    } else {
      return false;
    }

    anchor.setAttribute("href", url.toString());
    if (isCheckout) anchor.setAttribute("data-track-checkout", "1");
    return isCheckout;
  }

  function decorateAll() {
    var anchors = document.querySelectorAll("a[href]");
    for (var i = 0; i < anchors.length; i++) decorateLink(anchors[i]);
  }

  /* ------------------------------------------------------------------ boot */

  identify();
  track("page_view");
  decorateAll();

  // Links criados depois (SPA, popups, builders) também são decorados.
  if (window.MutationObserver) {
    var scheduled = false;
    new MutationObserver(function () {
      if (scheduled) return;
      scheduled = true;
      setTimeout(function () {
        scheduled = false;
        decorateAll();
      }, 300);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  // Rede de segurança: decora no clique (captura) e marca o initiate_checkout.
  document.addEventListener(
    "click",
    function (event) {
      var anchor = event.target && event.target.closest
        ? event.target.closest("a[href]")
        : null;
      if (!anchor) return;

      var isCheckout = decorateLink(anchor);
      if (isCheckout) track("initiate_checkout");
    },
    true
  );

  // API mínima para eventos customizados da própria página.
  window.tracker = {
    track: track,
    getUserId: function () {
      return USER_ID;
    },
  };
})();
