import { useState } from "react";
import { Search } from "lucide-react";

const MOCK_BUYERS = [
  { name: "Ana Beatriz Lima", email: "ana.lima@gmail.com", plan: "Pro Mensal", source: "MetaAds", medium: "trafego", campaign: "[CAPTAÇÃO] VÍDEOS", content: "00 - Lista Geral" },
  { name: "Carlos Eduardo Souza", email: "carlos.souza@hotmail.com", plan: "Pro Anual", source: "google", medium: "cpc", campaign: "brand-search-2026", content: "psicometria-online" },
  { name: "Fernanda Oliveira", email: "fernanda.o@gmail.com", plan: "Master Mensal", source: "instagram", medium: "social", campaign: "[RETARGETING] STORIES", content: "01 - Engajados" },
  { name: "Marcos Antônio Pereira", email: "marcos.pereira@yahoo.com", plan: "Pro Mensal", source: "MetaAds", medium: "trafego", campaign: "[CAPTAÇÃO] CARROSSEL", content: "02 - Lookalike" },
  { name: "Juliana Costa", email: "juliana.costa@gmail.com", plan: "Basic Mensal", source: "(direto)", medium: "(nenhum)", campaign: "(nenhum)", content: "(nenhum)" },
  { name: "Roberto Silva", email: "roberto.silva@gmail.com", plan: "Pro Anual", source: "MetaAds", medium: "trafego", campaign: "[QUENTE] DEPOIMENTOS", content: "03 - Base Quente" },
  { name: "Patrícia Mendes", email: "patricia.m@empresa.com.br", plan: "Master Anual", source: "email", medium: "email", campaign: "nurturing-trial-wk2", content: "cta-upgrade" },
  { name: "Diego Ferreira", email: "diego.f@gmail.com", plan: "Pro Mensal", source: "google", medium: "cpc", campaign: "concorrentes-2026", content: "psicometria-vs" },
  { name: "Camila Rocha", email: "camila.rocha@outlook.com", plan: "Basic Mensal", source: "instagram", medium: "social", campaign: "[CAPTAÇÃO] REELS", content: "00 - Lista Geral" },
  { name: "Thiago Barbosa", email: "thiago.b@gmail.com", plan: "Pro Anual", source: "MetaAds", medium: "trafego", campaign: "[CAPTAÇÃO] VÍDEOS", content: "01 - Engajados" },
  { name: "Larissa Nunes", email: "larissa.n@gmail.com", plan: "Master Mensal", source: "site", medium: "organic", campaign: "(nenhum)", content: "(nenhum)" },
  { name: "André Carvalho", email: "andre.c@empresa.com", plan: "Pro Mensal", source: "MetaAds", medium: "trafego", campaign: "[RETARGETING] FEED", content: "02 - Lookalike" },
];

const SOURCE_COLORS: Record<string, string> = {
  MetaAds:   "bg-blue-500/20 text-blue-300 border-blue-500/30",
  google:    "bg-green-500/20 text-green-300 border-green-500/30",
  instagram: "bg-pink-500/20 text-pink-300 border-pink-500/30",
  email:     "bg-amber-500/20 text-amber-300 border-amber-500/30",
  site:      "bg-teal-500/20 text-teal-300 border-teal-500/30",
  "(direto)":"bg-slate-500/20 text-slate-300 border-slate-500/30",
};

const PLAN_COLORS: Record<string, string> = {
  "Basic Mensal":  "bg-slate-500/20 text-slate-300",
  "Pro Mensal":    "bg-blue-500/20 text-blue-300",
  "Pro Anual":     "bg-violet-500/20 text-violet-300",
  "Master Mensal": "bg-amber-500/20 text-amber-300",
  "Master Anual":  "bg-emerald-500/20 text-emerald-300",
};

function Chip({ label, className }: { label: string; className: string }) {
  if (!label || label === "(nenhum)") {
    return <span className="text-slate-600 text-xs italic">—</span>;
  }
  const truncated = label.length > 22 ? label.slice(0, 22) + "…" : label;
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${className}`}
      title={label}
    >
      {truncated}
    </span>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const hue = name.charCodeAt(0) * 5 % 360;
  return (
    <div
      className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
      style={{ background: `hsl(${hue}, 55%, 38%)` }}
    >
      {initials}
    </div>
  );
}

export function BuyersTable() {
  const [search, setSearch] = useState("");

  const filtered = MOCK_BUYERS.filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    b.email.toLowerCase().includes(search.toLowerCase()) ||
    b.source.toLowerCase().includes(search.toLowerCase()) ||
    b.campaign.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#0b1120] p-6 font-sans">
      <div className="bg-[#111827] border border-white/8 rounded-2xl overflow-hidden shadow-xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <div>
            <h2 className="text-sm font-semibold text-white">Compradores do Período</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Fonte exata do cadastro de cada comprador — source · medium · campaign · content
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/25 px-2.5 py-1 rounded-full">
              {filtered.length} compradores
            </span>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar…"
                className="bg-white/5 border border-white/10 rounded-lg pl-7 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50 w-44"
              />
            </div>
          </div>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[2fr_1.2fr_1fr_1fr_1.6fr_1.6fr] gap-x-3 px-5 py-2 text-[10px] font-medium text-slate-500 uppercase tracking-wider border-b border-white/5">
          <span>Comprador</span>
          <span>Plano</span>
          <span className="text-blue-400">Source</span>
          <span className="text-violet-400">Medium</span>
          <span className="text-amber-400">Campaign</span>
          <span className="text-teal-400">Content</span>
        </div>

        {/* Rows */}
        <div className="divide-y divide-white/5">
          {filtered.map((b, i) => (
            <div
              key={i}
              className="grid grid-cols-[2fr_1.2fr_1fr_1fr_1.6fr_1.6fr] gap-x-3 px-5 py-2.5 items-center hover:bg-white/3 transition-colors"
            >
              {/* Comprador */}
              <div className="flex items-center gap-2.5 min-w-0">
                <Avatar name={b.name} />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-100 truncate">{b.name}</p>
                  <p className="text-[10px] text-slate-500 truncate">{b.email}</p>
                </div>
              </div>

              {/* Plano */}
              <div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold ${PLAN_COLORS[b.plan] ?? "bg-slate-500/20 text-slate-300"}`}>
                  {b.plan}
                </span>
              </div>

              {/* Source */}
              <div>
                <Chip label={b.source} className={SOURCE_COLORS[b.source] ?? "bg-slate-500/20 text-slate-300 border-slate-500/30"} />
              </div>

              {/* Medium */}
              <div>
                <Chip label={b.medium} className="bg-violet-500/15 text-violet-300 border-violet-500/25" />
              </div>

              {/* Campaign */}
              <div>
                <Chip label={b.campaign} className="bg-amber-500/15 text-amber-300 border-amber-500/25" />
              </div>

              {/* Content */}
              <div>
                <Chip label={b.content} className="bg-teal-500/15 text-teal-300 border-teal-500/25" />
              </div>
            </div>
          ))}
        </div>

        {/* Footer legend */}
        <div className="flex items-center gap-4 px-5 py-3 border-t border-white/8 bg-white/2">
          {[
            { label: "Source", color: "bg-blue-400" },
            { label: "Medium", color: "bg-violet-400" },
            { label: "Campaign", color: "bg-amber-400" },
            { label: "Content", color: "bg-teal-400" },
          ].map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${color}`} />
              <span className="text-[10px] text-slate-500">{label}</span>
            </div>
          ))}
          <span className="ml-auto text-[10px] text-slate-600">Dados reais do período selecionado</span>
        </div>
      </div>
    </div>
  );
}
