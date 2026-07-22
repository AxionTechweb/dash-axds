import { redirect } from "next/navigation";

/** A raiz leva ao painel; o proxy.ts redireciona ao /login quando não há sessão. */
export default function RootPage() {
  redirect("/dashboard");
}
