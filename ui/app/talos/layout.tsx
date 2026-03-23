import { NavTabs } from "@/components/talos/nav-tabs";

export default function TalosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full">
      <NavTabs />
      <div className="flex-1 overflow-auto container py-6">{children}</div>
      <footer className="border-t py-3 text-center text-xs text-muted-foreground shrink-0">
        <p>Talos — Test Automation &amp; Logic Orchestration System &middot; v0.1.0</p>
      </footer>
    </div>
  );
}
