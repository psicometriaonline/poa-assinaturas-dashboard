import { useState, Fragment } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";

const DATA = [
  {
    source: "MetaAds", total: 9,
    mediums: [
      {
        medium: "trafego", total: 9,
        campaigns: [
          { campaign: "[CAPTAÇÃO] VÍDEOS", total: 4, contents: [{ content: "00 - Lista Geral", total: 2 }, { content: "01 - Engajados", total: 2 }] },
          { campaign: "[CAPTAÇÃO] CARROSSEL", total: 3, contents: [{ content: "02 - Lookalike", total: 2 }, { content: "00 - Lista Geral", total: 1 }] },
          { campaign: "[RETARGETING] FEED", total: 1, contents: [{ content: "02 - Lookalike", total: 1 }] },
          { campaign: "[QUENTE] DEPOIMENTOS", total: 1, contents: [{ content: "03 - Base Quente", total: 1 }] },
        ],
      },
    ],
  },
  {
    source: "google", total: 4,
    mediums: [
      {
        medium: "cpc", total: 4,
        campaigns: [
          { campaign: "brand-search-2026", total: 2, contents: [{ content: "psicometria-online", total: 2 }] },
          { campaign: "concorrentes-2026", total: 2, contents: [{ content: "psicometria-vs", total: 2 }] },
        ],
      },
    ],
  },
  {
    source: "instagram", total: 3,
    mediums: [
      {
        medium: "social", total: 3,
        campaigns: [
          { campaign: "[RETARGETING] STORIES", total: 2, contents: [{ content: "01 - Engajados", total: 2 }] },
          { campaign: "[CAPTAÇÃO] REELS", total: 1, contents: [{ content: "00 - Lista Geral", total: 1 }] },
        ],
      },
    ],
  },
  {
    source: "email", total: 1,
    mediums: [{ medium: "email", total: 1, campaigns: [{ campaign: "nurturing-trial-wk2", total: 1, contents: [{ content: "cta-upgrade", total: 1 }] }] }],
  },
  {
    source: "site", total: 1,
    mediums: [{ medium: "organic", total: 1, campaigns: [{ campaign: "(nenhum)", total: 1, contents: [{ content: "(nenhum)", total: 1 }] }] }],
  },
  {
    source: "(direto)", total: 2,
    mediums: [{ medium: "(nenhum)", total: 2, campaigns: [{ campaign: "(nenhum)", total: 2, contents: [{ content: "(nenhum)", total: 2 }] }] }],
  },
];

const GRAND_TOTAL = DATA.reduce((s, r) => s + r.total, 0);

const SOURCE_COLOR: Record<string, string> = {
  MetaAds:    "#3b82f6",
  google:     "#22c55e",
  instagram:  "#ec4899",
  email:      "#f59e0b",
  site:       "#06b6d4",
  "(direto)": "#64748b",
};

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="w-24 h-1.5 bg-white/8 rounded-full overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${(value / max) * 100}%`, background: color }} />
    </div>
  );
}

export function BuyersTable() {
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});
  const [expandedMediums, setExpandedMediums] = useState<Record<string, boolean>>({});
  const [expandedCampaigns, setExpandedCampaigns] = useState<Record<string, boolean>>({});

  const toggle = (map: Record<string, boolean>, set: (v: Record<string, boolean>) => void, key: string) =>
    set({ ...map, [key]: !map[key] });

  const maxSource = Math.max(...DATA.map(d => d.total));

  return (
    <div className="min-h-screen bg-[#0b1120] p-6 font-sans">
      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { label: "Compradores", value: GRAND_TOTAL, sub: "no período" },
          { label: "Top Origem", value: DATA[0].source, sub: `${DATA[0].total} compradores` },
          { label: "Top Campanha", value: "[CAPTAÇÃO] VÍDEOS", sub: "4 compradores" },
          { label: "Sem UTM", value: DATA.find(d => d.source === "(direto)")?.total ?? 0, sub: "origem direta" },
        ].map(({ label, value, sub }) => (
          <div key={label} className="bg-[#111827] border border-white/8 rounded-xl px-4 py-3">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">{label}</p>
            <p className="text-xl font-bold text-white">{value}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Table card */}
      <div className="bg-[#111827] border border-white/8 rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/8">
          <div>
            <h2 className="text-sm font-semibold text-white">Compradores por Origem UTM</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">Clique na origem para expandir por mídia · campanha · conteúdo</p>
          </div>
          <span className="text-xs bg-blue-500/15 text-blue-300 border border-blue-500/25 px-2.5 py-1 rounded-full font-semibold">
            {GRAND_TOTAL} total
          </span>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[2fr_80px_80px_120px] px-5 py-2 text-[10px] font-medium text-slate-500 uppercase tracking-wider border-b border-white/5">
          <span>Origem</span>
          <span className="text-right">Compradores</span>
          <span className="text-right">% Total</span>
          <span className="pl-3">Distribuição</span>
        </div>

        {/* Rows */}
        <div className="divide-y divide-white/5">
          {DATA.map((row) => {
            const srcColor = SOURCE_COLOR[row.source] ?? "#64748b";
            const pct = ((row.total / GRAND_TOTAL) * 100).toFixed(1);
            const srcExpanded = !!expandedSources[row.source];
            return (
              <Fragment key={row.source}>
                {/* Level 1 — source */}
                <div
                  className="grid grid-cols-[2fr_80px_80px_120px] px-5 py-2.5 items-center cursor-pointer hover:bg-white/3 transition-colors"
                  onClick={() => toggle(expandedSources, setExpandedSources, row.source)}
                >
                  <div className="flex items-center gap-2">
                    {srcExpanded
                      ? <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: srcColor }} />
                      : <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: srcColor }} />}
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-md"
                      style={{ background: `${srcColor}20`, color: srcColor }}
                    >
                      {row.source}
                    </span>
                  </div>
                  <span className="text-right text-sm font-bold text-white">{row.total}</span>
                  <span className="text-right text-xs text-slate-400">{pct}%</span>
                  <div className="pl-3"><Bar value={row.total} max={maxSource} color={srcColor} /></div>
                </div>

                {/* Level 2 — medium */}
                {srcExpanded && row.mediums.map((med) => {
                  const medKey = `${row.source}::${med.medium}`;
                  const medExpanded = !!expandedMediums[medKey];
                  return (
                    <Fragment key={medKey}>
                      <div
                        className="grid grid-cols-[2fr_80px_80px_120px] pl-10 pr-5 py-2 items-center bg-white/3 cursor-pointer hover:bg-white/5 transition-colors"
                        onClick={() => toggle(expandedMediums, setExpandedMediums, medKey)}
                      >
                        <div className="flex items-center gap-1.5">
                          {medExpanded
                            ? <ChevronDown className="w-3 h-3 text-violet-400 shrink-0" />
                            : <ChevronRight className="w-3 h-3 text-violet-400 shrink-0" />}
                          <span className="text-[11px] text-violet-300 bg-violet-500/15 border border-violet-500/20 px-1.5 py-0.5 rounded">
                            ↳ {med.medium}
                          </span>
                        </div>
                        <span className="text-right text-xs font-semibold text-slate-300">{med.total}</span>
                        <span className="text-right text-[10px] text-slate-500">{((med.total / GRAND_TOTAL) * 100).toFixed(1)}%</span>
                        <div className="pl-3"><Bar value={med.total} max={maxSource} color="#8b5cf6" /></div>
                      </div>

                      {/* Level 3 — campaign */}
                      {medExpanded && med.campaigns.map((camp) => {
                        const campKey = `${medKey}::${camp.campaign}`;
                        const campExpanded = !!expandedCampaigns[campKey];
                        return (
                          <Fragment key={campKey}>
                            <div
                              className="grid grid-cols-[2fr_80px_80px_120px] pl-16 pr-5 py-1.5 items-center bg-white/4 cursor-pointer hover:bg-white/6 transition-colors"
                              onClick={() => toggle(expandedCampaigns, setExpandedCampaigns, campKey)}
                            >
                              <div className="flex items-center gap-1.5">
                                {campExpanded
                                  ? <ChevronDown className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                                  : <ChevronRight className="w-2.5 h-2.5 text-amber-400 shrink-0" />}
                                <span className="text-[10px] text-amber-300 bg-amber-500/12 border border-amber-500/20 px-1.5 py-0.5 rounded truncate max-w-[220px]" title={camp.campaign}>
                                  ↳↳ {camp.campaign.length > 28 ? camp.campaign.slice(0, 28) + "…" : camp.campaign}
                                </span>
                              </div>
                              <span className="text-right text-xs text-slate-400">{camp.total}</span>
                              <span className="text-right text-[10px] text-slate-500">{((camp.total / GRAND_TOTAL) * 100).toFixed(1)}%</span>
                              <div className="pl-3"><Bar value={camp.total} max={maxSource} color="#f59e0b" /></div>
                            </div>

                            {/* Level 4 — content */}
                            {campExpanded && camp.contents.map((ct) => (
                              <div
                                key={ct.content}
                                className="grid grid-cols-[2fr_80px_80px_120px] pl-[5.5rem] pr-5 py-1.5 items-center bg-white/5"
                              >
                                <span className="text-[10px] text-teal-300/80 truncate">
                                  ↳↳↳ {ct.content}
                                </span>
                                <span className="text-right text-xs text-slate-500">{ct.total}</span>
                                <span className="text-right text-[10px] text-slate-600">{((ct.total / GRAND_TOTAL) * 100).toFixed(1)}%</span>
                                <div className="pl-3"><Bar value={ct.total} max={maxSource} color="#06b6d4" /></div>
                              </div>
                            ))}
                          </Fragment>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </Fragment>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-5 px-5 py-2.5 border-t border-white/8 bg-white/2">
          {[
            { label: "Source", color: "#3b82f6" },
            { label: "Medium", color: "#8b5cf6" },
            { label: "Campaign", color: "#f59e0b" },
            { label: "Content", color: "#06b6d4" },
          ].map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: color }} />
              <span className="text-[10px] text-slate-500">{label}</span>
            </div>
          ))}
          <span className="ml-auto text-[10px] text-slate-600">Dados reais do período selecionado</span>
        </div>
      </div>
    </div>
  );
}
