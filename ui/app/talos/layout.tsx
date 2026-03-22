import { NavTabs } from "@/components/talos/nav-tabs";

export default function TalosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <NavTabs />
      <main className="flex-1 container py-6">{children}</main>
      <footer className="border-t py-4 text-center text-sm text-muted-foreground">
        <p>Talos Test Automation &amp; Logic Orchestration System</p>
      </footer>
    </div>
  );
}
