import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Sidebar } from "@/components/Sidebar";
import Overview from "@/pages/Overview";
import Revenue from "@/pages/Revenue";
import Churn from "@/pages/Churn";
import Funnel from "@/pages/Funnel";
import Traffic from "@/pages/Traffic";

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
      <main className="flex-1 p-8 overflow-auto">
        <Switch>
          <Route path="/" component={Overview} />
          <Route path="/revenue" component={Revenue} />
          <Route path="/churn" component={Churn} />
          <Route path="/funnel" component={Funnel} />
          <Route path="/traffic" component={Traffic} />
          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Layout />
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
