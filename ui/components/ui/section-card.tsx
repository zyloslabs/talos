"use client";

import { useState, useEffect, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SectionCardProps {
  id?: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  defaultOpen?: boolean;
  /** Controlled open state — when provided, overrides internal state */
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
  className?: string;
}

export function SectionCard({
  id,
  title,
  description,
  icon,
  defaultOpen = false,
  isOpen,
  onOpenChange,
  children,
  className,
}: SectionCardProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = isOpen ?? internalOpen;

  useEffect(() => {
    if (isOpen !== undefined) setInternalOpen(isOpen);
  }, [isOpen]);

  const toggle = () => {
    const next = !open;
    setInternalOpen(next);
    onOpenChange?.(next);
  };

  return (
    <section id={id} className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)}>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors rounded-t-lg"
      >
        <div className="flex items-center gap-3">
          {icon && <span className="text-muted-foreground">{icon}</span>}
          <div>
            <h3 className="font-semibold">{title}</h3>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
        <ChevronDown
          className={cn("h-5 w-5 text-muted-foreground transition-transform duration-200", open && "rotate-180")}
        />
      </button>
      <div
        className={cn(
          "overflow-hidden transition-all duration-200",
          open ? "max-h-[5000px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="p-4 pt-0">{children}</div>
      </div>
    </section>
  );
}
