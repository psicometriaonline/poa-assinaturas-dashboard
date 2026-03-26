import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Sidebar } from "@/components/Sidebar";
import { GlobalPeriodSelector } from "@/components/GlobalPeriodSelector";
import { PeriodProvider } from "@/context/PeriodContext";
import Overview from "@/pages/Overview";
import Revenue from "@/pages/Revenue";
import Funnel from "@/pages/Funnel";
import Leads from "@/pages/Leads";
import Traffic from "@/pages/Traffic";
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
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border px-6 py-2.5 flex items-center justify-between gap-4 shrink-0">
          <span className="text-xs text-muted-foreground hidden sm:block">Período de análise</span>
          <GlobalPeriodSelector />
        </header>
        <main className="flex-1 overflow-auto p-8">
          <Switch>
            <Route path="/" component={Overview} />
            <Route path="/revenue" component={Revenue} />
            <Route path="/funnel" component={Funnel} />
            <Route path="/leads" component={Leads} />
            <Route path="/traffic" component={Traffic} />
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
