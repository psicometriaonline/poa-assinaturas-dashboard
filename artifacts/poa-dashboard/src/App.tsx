import { useState } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Sidebar, MobileMenuButton, MobileDrawer } from "@/components/Sidebar";
import { GlobalPeriodSelector } from "@/components/GlobalPeriodSelector";
import { PeriodProvider } from "@/context/PeriodContext";
import Overview from "@/pages/Overview";
import Revenue from "@/pages/Revenue";
import Subscriptions from "@/pages/Subscriptions";
import Retention from "@/pages/Retention";
import Acquisition from "@/pages/Acquisition";
import Traffic from "@/pages/Traffic";
import LeadMap from "@/pages/LeadMap";
import Admin from "@/pages/Admin";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

function NotFound() {
  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-muted-foreground">Página não encontrada</p>
    </div>
  );
}

function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border px-3 sm:px-6 py-2.5 flex items-center gap-3 shrink-0">
          <MobileMenuButton onClick={() => setMobileOpen(true)} />
          <span className="text-xs text-muted-foreground hidden lg:block shrink-0">Período de análise</span>
          <div className="flex-1 min-w-0">
            <GlobalPeriodSelector />
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          <Switch>
            <Route path="/" component={Overview} />
            <Route path="/revenue" component={Revenue} />
            <Route path="/subscriptions" component={Subscriptions} />
            <Route path="/retention" component={Retention} />
            <Route path="/acquisition" component={Acquisition} />
            <Route path="/traffic" component={Traffic} />
            <Route path="/leadmap" component={LeadMap} />
            <Route path="/admin" component={Admin} />
            <Route component={NotFound} />
          </Switch>
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <PeriodProvider>
          <Layout />
        </PeriodProvider>
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
