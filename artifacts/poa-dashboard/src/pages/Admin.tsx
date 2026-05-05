import { useState, useRef } from "react";
import { Upload, CheckCircle, AlertCircle, Loader2, ShieldCheck, LogOut, Mail, RefreshCw } from "lucide-react";
import { formatBRL, formatNumber } from "@/lib/api";

const ALLOWED_EMAILS = [
  "brunodamasio@psicometriaonline.com.br",
  "bf.damasio@gmail.com",
  "wellingtonfield@gmail.com",
  "wellington.trd@outlook.com",
];

const STORAGE_KEY = "poa_admin_email";

interface ImportResult {
  inserted: number;
  skipped: number;
  mrr: number;
  arr: number;
  activeSubscribers: number;
  byProduct: Record<string, number>;
}

interface AcCacheResult {
  tagId: string;
  listId: string;
  tagEmailCount: number;
  listEmailCount: number;
}

function EmailGate({ onAccess }: { onAccess: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (ALLOWED_EMAILS.map((e) => e.toLowerCase()).includes(normalized)) {
      localStorage.setItem(STORAGE_KEY, email.trim());
      onAccess(email.trim());
    } else {
      setError("E-mail não autorizado.");
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <ShieldCheck className="w-10 h-10 text-primary mx-auto" />
          <h1 className="text-lg font-bold text-foreground">Área Restrita</h1>
          <p className="text-sm text-muted-foreground">Informe seu e-mail para continuar</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card border border-card-border rounded-xl p-6 space-y-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" />
              E-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); }}
              placeholder="seu@email.com"
              autoFocus
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-400">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-primary text-primary-foreground rounded-lg py-2.5 text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}

export default function Admin() {
  const savedEmail = localStorage.getItem(STORAGE_KEY) ?? "";
  const isAllowed = ALLOWED_EMAILS.map((e) => e.toLowerCase()).includes(savedEmail.toLowerCase());

  const [authorizedEmail, setAuthorizedEmail] = useState<string>(isAllowed ? savedEmail : "");
  const [token, setToken] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [acLoading, setAcLoading] = useState(false);
  const [acResult, setAcResult] = useState<AcCacheResult | null>(null);
  const [acError, setAcError] = useState<string | null>(null);

  async function handleRefreshAcCache() {
    if (!token) return;
    setAcLoading(true);
    setAcError(null);
    setAcResult(null);

    try {
      const res = await fetch("/api/admin/refresh-ac-cache", {
        method: "POST",
        headers: { "x-admin-token": token },
      });
      let json: { error: boolean; message?: string; data?: AcCacheResult };
      try {
        json = await res.json();
      } catch {
        setAcError(`Erro ${res.status}: resposta inválida do servidor.`);
        return;
      }
      if (!res.ok || json.error) {
        setAcError(json.message ?? `Erro ${res.status} ao atualizar cache AC.`);
      } else {
        setAcResult(json.data!);
      }
    } catch (e) {
      setAcError(e instanceof Error ? e.message : "Erro de rede.");
    } finally {
      setAcLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem(STORAGE_KEY);
    setAuthorizedEmail("");
    setResult(null);
    setError(null);
  }

  async function handleImport() {
    if (!file || !token) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/admin/import-subscribers", {
        method: "POST",
        headers: { "x-admin-token": token },
        body: formData,
      });
      const json = await res.json();
      if (json.error) {
        setError(json.message ?? "Erro ao importar.");
      } else {
        setResult(json.data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro de rede.");
    } finally {
      setLoading(false);
    }
  }

  if (!authorizedEmail) {
    return <EmailGate onAccess={setAuthorizedEmail} />;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Administração</h1>
          <p className="text-sm text-muted-foreground">Importação de assinantes via planilha Excel do Hotmart</p>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-sidebar-accent"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sair ({authorizedEmail})
        </button>
      </div>

      <div className="bg-card border border-card-border rounded-xl p-6 space-y-5">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <ShieldCheck className="w-4 h-4 text-blue-400" />
          Importar Planilha de Assinantes
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Token de administrador</label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Cole o ADMIN_SECRET aqui"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Arquivo Excel (.xlsx)</label>
          <div
            className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Upload className="w-7 h-7 text-muted-foreground mx-auto mb-2" />
            {file ? (
              <p className="text-sm text-foreground font-medium">{file.name}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Clique para selecionar o arquivo exportado do Hotmart</p>
            )}
          </div>
        </div>

        <button
          onClick={handleImport}
          disabled={!file || !token || loading}
          className="w-full bg-primary text-primary-foreground rounded-lg py-2.5 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Importando…
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              Importar e Atualizar Base
            </>
          )}
        </button>

        <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 space-y-1">
          <p className="font-medium text-foreground/70">Como exportar do Hotmart:</p>
          <p>1. Hotmart → Assinaturas → Filtrar por status "Ativo"</p>
          <p>2. Exportar → formato Excel (.xlsx)</p>
          <p>3. Fazer upload aqui com o token de administrador</p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-300">Erro na importação</p>
            <p className="text-xs text-red-400/80 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      <div className="bg-card border border-card-border rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <RefreshCw className="w-4 h-4 text-purple-400" />
          Cache ActiveCampaign
        </div>
        <p className="text-xs text-muted-foreground">
          Força a atualização imediata dos e-mails da tag 401 e lista 30 no cache do servidor.
          Usa o token de administrador informado acima.
        </p>

        <button
          onClick={handleRefreshAcCache}
          disabled={!token || acLoading}
          className="w-full bg-purple-600 text-white rounded-lg py-2.5 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-500 transition-colors"
        >
          {acLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Atualizando cache…
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" />
              Atualizar Cache AC
            </>
          )}
        </button>

        {acError && (
          <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-300">Erro ao atualizar cache</p>
              <p className="text-xs text-red-400/80 mt-0.5">{acError}</p>
            </div>
          </div>
        )}

        {acResult && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-400" />
              <p className="text-sm font-semibold text-green-300">Cache atualizado com sucesso</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-background/40 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-foreground">{formatNumber(acResult.tagEmailCount)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">E-mails tag {acResult.tagId}</p>
              </div>
              <div className="bg-background/40 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-foreground">{formatNumber(acResult.listEmailCount)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">E-mails lista {acResult.listId}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {result && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <p className="text-sm font-semibold text-green-300">Importação concluída com sucesso</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Assinantes Ativos", value: formatNumber(result.activeSubscribers) },
              { label: "MRR", value: formatBRL(result.mrr) },
              { label: "ARR", value: formatBRL(result.arr) },
            ].map((item) => (
              <div key={item.label} className="bg-background/40 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-foreground">{item.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.label}</p>
              </div>
            ))}
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Por produto:</p>
            {Object.entries(result.byProduct)
              .sort(([, a], [, b]) => b - a)
              .map(([product, count]) => (
                <div key={product} className="flex justify-between text-xs text-foreground/80">
                  <span>{product}</span>
                  <span className="font-medium">{formatNumber(count)}</span>
                </div>
              ))}
          </div>

          {result.skipped > 0 && (
            <p className="text-xs text-yellow-400">⚠ {result.skipped} linha(s) ignoradas por código inválido.</p>
          )}
        </div>
      )}
    </div>
  );
}
