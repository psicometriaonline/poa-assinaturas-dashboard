import { Link, useLocation } from "wouter";
import { LayoutDashboard, TrendingUp, Funnel, Globe, Settings } from "lucide-react";

const navItems = [
  { label: "Visão Geral", href: "/", icon: LayoutDashboard },
  { label: "Receita & Churn", href: "/revenue", icon: TrendingUp },
  { label: "Funil", href: "/funnel", icon: Funnel },
  { label: "Tráfego", href: "/traffic", icon: Globe },
];

export function Sidebar() {
  const [location] = useLocation();

  return (
    <aside className="w-56 min-h-screen bg-sidebar border-r border-sidebar-border flex flex-col">
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
      <div className="px-3 pb-4 border-t border-sidebar-border pt-3">
        <Link
          href="/admin"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            location === "/admin"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
          }`}
        >
          <Settings className="w-4 h-4 shrink-0" />
          Admin
        </Link>
      </div>
    </aside>
  );
}
