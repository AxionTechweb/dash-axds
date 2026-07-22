import {
  LayoutDashboard,
  Megaphone,
  Plug,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

/** Navegação principal da sidebar. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/campanhas", label: "Campanhas", icon: Megaphone },
  { href: "/vendas", label: "Vendas", icon: ShoppingCart },
  { href: "/integracoes", label: "Integrações", icon: Plug },
  { href: "/financeiro", label: "Financeiro", icon: Wallet },
  { href: "/regras", label: "Regras", icon: Zap },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
  { href: "/admin", label: "Admin", icon: ShieldCheck },
];
