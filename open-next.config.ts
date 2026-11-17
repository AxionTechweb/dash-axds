import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Sem cache incremental por enquanto: o painel é todo dinâmico (autenticado).
// Se o cache da Meta (META_CACHE) precisar persistir entre requests, ligar um
// incrementalCache (KV ou R2) aqui — ver https://opennext.js.org/cloudflare/caching
export default defineCloudflareConfig({});
