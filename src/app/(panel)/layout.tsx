import { redirect } from "next/navigation";

import { Header } from "@/components/panel/header";
import { Sidebar } from "@/components/panel/sidebar";
import { ValuesProvider } from "@/components/panel/values-context";
import { getActiveArea, getAreas } from "@/lib/areas";
import { displayName, getCurrentUser } from "@/lib/auth";
import { getBranding } from "@/lib/branding";
import { DEFAULT_SETTINGS, getSettings } from "@/lib/settings";

/** O painel depende de sessão/cookies — sempre dinâmico. */
export const dynamic = "force-dynamic";

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [branding, areas, activeArea] = await Promise.all([
    getBranding(),
    getAreas(),
    getActiveArea(),
  ]);

  const settings = activeArea ? await getSettings(activeArea.id) : null;
  const currency = settings?.currency ?? DEFAULT_SETTINGS.currency;

  // A meta operacional vem das settings da área; cai no valor da própria área.
  const goal = settings?.revenue_goal ?? activeArea?.revenue_goal ?? 0;

  const sidebarProps = {
    branding,
    areas,
    activeArea,
    userEmail: user.email ?? "",
  };

  return (
    <ValuesProvider>
      <Sidebar {...sidebarProps} />

      <div className="lg:pl-64">
        <Header
          {...sidebarProps}
          userName={displayName(user)}
          revenue={0}
          goal={goal}
          currency={currency}
        />
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </ValuesProvider>
  );
}
