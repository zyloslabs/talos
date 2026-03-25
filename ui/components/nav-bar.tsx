"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, FlaskConical, Zap, Settings, Wand2 } from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NavLink = { href: string; label: string };

const TOP_LINKS: NavLink[] = [
  { href: "/talos", label: "Dashboard" },
  { href: "/chat", label: "Chat" },
  { href: "/workbench", label: "Workbench" },
];

type NavGroup = {
  label: string;
  icon: React.ReactNode;
  items: NavLink[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Testing",
    icon: <FlaskConical className="h-3.5 w-3.5" />,
    items: [
      { href: "/talos/tests", label: "Test Library" },
      { href: "/talos/vault", label: "Vault Roles" },
      { href: "/talos/artifacts", label: "Artifacts" },
      { href: "/talos/setup", label: "Setup Wizard" },
    ],
  },
  {
    label: "Automation",
    icon: <Zap className="h-3.5 w-3.5" />,
    items: [
      { href: "/library", label: "Prompts" },
      { href: "/skills", label: "Skills" },
      { href: "/agents", label: "Agents" },
      { href: "/scheduler", label: "Scheduler" },
      { href: "/tasks", label: "Tasks" },
    ],
  },
  {
    label: "Admin",
    icon: <Settings className="h-3.5 w-3.5" />,
    items: [
      { href: "/admin", label: "Settings" },
    ],
  },
];

const isActive = (pathname: string, href: string) =>
  href === "/talos" ? pathname === "/talos" : pathname.startsWith(href);

const linkClasses = (active: boolean) =>
  `rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
    active
      ? "bg-primary text-primary-foreground"
      : "text-muted-foreground hover:bg-accent/10 hover:text-foreground"
  }`;

const NavDropdown = ({ group, pathname }: { group: NavGroup; pathname: string }) => {
  const groupActive = group.items.some((item) => isActive(pathname, item.href));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition outline-none ${
          groupActive
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-accent/10 hover:text-foreground"
        }`}
      >
        {group.icon}
        {group.label}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[10rem]">
        {group.items.map(({ href, label }) => (
          <DropdownMenuItem key={href} asChild>
            <Link
              href={href}
              className={`w-full cursor-pointer ${
                isActive(pathname, href) ? "font-bold text-primary" : ""
              }`}
            >
              {label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const NavBar = () => {
  const pathname = usePathname();

  return (
    <nav aria-label="Main navigation" className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/talos" className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-primary" />
          <span className="font-bold text-sm">Talos</span>
        </Link>
        <div className="flex items-center gap-1">
          {TOP_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={linkClasses(isActive(pathname, href))}
            >
              {label}
            </Link>
          ))}
          {NAV_GROUPS.map((group) => (
            <NavDropdown key={group.label} group={group} pathname={pathname} />
          ))}
          <ModeToggle />
        </div>
      </div>
    </nav>
  );
};
