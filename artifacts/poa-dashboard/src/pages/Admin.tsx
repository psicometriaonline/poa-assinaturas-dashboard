import { useState, useRef } from "react";
import { Upload, CheckCircle, AlertCircle, Loader2, ShieldCheck } from "lucide-react";
import { formatBRL, formatNumber } from "@/lib/api";

interface ImportResult {
  inserted: number;
  skipped: number;
  mrr: number;
  arr: number;
  activeSubscribers: number;
  byProduct: Record<string, number>;
}

export default function Admin() {
  const [token, setToken] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-foreground">Administração</h1>
        <p className="text-sm text-muted-foreground">Importação de assinantes via planilha Excel do Hotmart</p>
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
