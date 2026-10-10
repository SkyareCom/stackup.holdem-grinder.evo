import React, { useEffect, useMemo, useState } from 'react';
import { SCENARIO_FILTERS, SECTIONS, FILTERS_BY_SECTION, SCENARIO_CATALOG_SHA } from '../core/stackup-scenario-catalog.esm.js';
import { useScenarioFilter } from '../hooks/useScenarioFilter.js';

const GROUPS = {
  CORE: ['mode','seats','ttype','extras','fsize','fskill','hands','phase','pos','street','stack'],
  SPECIALS: ['pre_special','blind_special','aggr_special','short_special','icm_special','pko_special','post_special','river_special','texture_special','math_special','game_special','pot_special'],
  EXTENDED: ['pre_extended','line_extended','format_extended']
};
const gold = '#D4AF37';
export default function StackUpScenarioCinematicFilter({ onSelectionChange = () => {} }) {
  const { selectedKeys, keys, toggle, clear } = useScenarioFilter();
  const [activeSection, setActiveSection] = useState(SECTIONS[0]);
  const [searchQuery, setSearchQuery] = useState('');
  useEffect(() => { onSelectionChange(keys); }, [keys, onSelectionChange]);
  const visible = useMemo(() => (FILTERS_BY_SECTION[activeSection] || []).filter(f => (f.name + ' ' + f.key).toLowerCase().includes(searchQuery.trim().toLowerCase())), [activeSection, searchQuery]);
  const copyArray = async () => { try { await navigator.clipboard.writeText(JSON.stringify(keys)); } catch { /* Clipboard requires user permission/HTTPS */ } };
  return <section className="min-h-screen bg-[#0A0A0B] text-[#F2EEE3] p-4 md:p-6" aria-label="StackUp Scenario Catalog">
    <header className="mb-6 border-b border-[#D4AF37]/30 pb-4">
      <h1 className="text-base md:text-xl font-semibold tracking-widest text-[#D4AF37]">STACKUP // SCENARIO CATALOG v1 — 194 FILTERS — SHA {SCENARIO_CATALOG_SHA.slice(0,8)}</h1>
      <p className="text-xs text-neutral-400 mt-2">194 filtros • 26 seções • NOT_CERTIFIED — sem validação matemática declarada</p>
    </header>
    <div className="flex flex-col md:flex-row gap-5">
      <nav className="md:w-64 md:shrink-0 flex md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-2 md:pb-0" aria-label="Seções de filtros">
        {Object.entries(GROUPS).map(([group, sections]) => <div key={group} className="flex md:flex-col gap-1 shrink-0">
          <span className="hidden md:block text-[11px] uppercase tracking-[.2em] text-[#D4AF37] mt-4 mb-2">{group}</span>
          {sections.map(section => <button key={section} type="button" onClick={() => {setActiveSection(section);setSearchQuery('');}}
            aria-pressed={activeSection===section}
            className={`whitespace-nowrap rounded-lg border px-3 py-2 text-left text-xs transition-all hover:-translate-y-0.5 ${activeSection===section?'border-[#D4AF37] bg-[#D4AF37]/15 text-[#D4AF37]':'border-white/10 bg-white/5 text-neutral-300'}`}>
            {section.replaceAll('_',' ').toUpperCase()} <span className="opacity-60 ml-2">{(FILTERS_BY_SECTION[section]||[]).length}</span>
          </button>)}
        </div>)}
      </nav>
      <main className="min-w-0 flex-1">
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <h2 className="uppercase tracking-wider text-sm text-[#D4AF37]">{activeSection} ({visible.length})</h2>
          <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Buscar por nome ou chave…" aria-label="Buscar filtros"
            className="w-full sm:w-72 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm outline-none focus:border-[#D4AF37]" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {visible.map(f => { const selected=selectedKeys.has(f.key); return <button key={f.key} type="button" onClick={()=>toggle(f.key)} aria-pressed={selected}
            className={`min-w-0 text-left rounded-xl border p-3 backdrop-blur-lg transition-all duration-150 hover:-translate-y-1 ${selected?'border-[#D4AF37] bg-[#D4AF37]/15 shadow-[0_0_18px_rgba(212,175,55,0.22)]':'border-white/15 bg-white/5 hover:border-[#D4AF37]/60'}`}>
            <span className="block text-[10px] text-[#D4AF37]">#{f.ordinal}</span>
            <span className="block mt-1 text-sm font-semibold break-words">{f.name}</span>
            <span className="block mt-2 text-[10px] font-mono text-neutral-400 break-all">{f.key}</span>
          </button>; })}
        </div>
      </main>
    </div>
    <footer className="sticky bottom-0 mt-8 rounded-xl border border-[#D4AF37]/30 bg-[#0A0A0B]/95 p-3 backdrop-blur-lg">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <code className="text-xs text-[#D4AF37] break-all">{JSON.stringify(keys)}</code>
        <div className="flex gap-2">
          <button type="button" onClick={copyArray} className="rounded-lg bg-[#D4AF37] text-[#0A0A0B] px-3 py-2 text-xs font-bold">COPY ARRAY</button>
          <button type="button" onClick={clear} className="rounded-lg border border-white/30 px-3 py-2 text-xs">CLEAR</button>
        </div>
      </div>
    </footer>
  </section>;
}
