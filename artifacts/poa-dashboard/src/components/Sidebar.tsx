import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, TrendingUp, Funnel, Globe, Users, Menu, X } from "lucide-react";

const navItems = [
  { label: "Visão Geral", href: "/", icon: LayoutDashboard },
  { label: "Receita & Churn", href: "/revenue", icon: TrendingUp },
  { label: "Funil", href: "/funnel", icon: Funnel },
  { label: "Tráfego", href: "/traffic", icon: Globe },
  { label: "Mapa do Lead", href: "/leadmap", icon: Users },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();

  return (
    <>
      <div className="px-5 py-6 border-b border-sidebar-border">
        <h1 className="text-base font-bold text-foreground">Dashboard POA</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Métricas estratégicas</p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="md:hidden p-1.5 -ml-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
      aria-label="Menu"
    >
      <Menu className="w-5 h-5" />
    </button>
  );
}

export function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity md:hidden ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-sidebar flex flex-col transition-transform duration-200 md:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-3 p-1 rounded-md text-muted-foreground hover:text-foreground"
          aria-label="Fechar"
        >
          <X className="w-5 h-5" />
        </button>
        <SidebarContent onNavigate={onClose} />
      </aside>
    </>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden md:flex w-56 min-h-screen bg-sidebar border-r border-sidebar-border flex-col">
      <SidebarContent />
    </aside>
  );
}
