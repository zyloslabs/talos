"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, KeyRound, TestTube2, FileImage, Moon, Sun, MessageSquare, Settings, BookOpen, Zap, Calendar, ListTodo, FileEdit, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";

const navItems = [
  { href: "/talos", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/talos/vault", label: "Vault Roles", icon: KeyRound },
  { href: "/talos/tests", label: "Test Library", icon: TestTube2 },
  { href: "/talos/artifacts", label: "Artifacts", icon: FileImage },
  { href: "/library", label: "Prompts", icon: BookOpen },
  { href: "/skills", label: "Skills", icon: Zap },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/scheduler", label: "Scheduler", icon: Calendar },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/workbench", label: "Workbench", icon: FileEdit },
  { href: "/admin", label: "Admin", icon: Settings },
];

export function NavTabs() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center">
        <div className="mr-4 flex">
          <Link href="/talos" className="flex items-center space-x-2">
            <TestTube2 className="h-6 w-6 text-primary" />
            <span className="font-bold">Talos</span>
          </Link>
        </div>
        <nav className="flex items-center space-x-6 text-sm font-medium">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center space-x-2 transition-colors hover:text-foreground/80",
                  isActive ? "text-foreground" : "text-foreground/60"
                )}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center space-x-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
