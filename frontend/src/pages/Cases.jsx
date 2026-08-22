import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWebSocket } from '../hooks/useWebSocket';
import RiskBadge from '../components/RiskBadge';
import ActionButton from '../components/ActionButton';
import InvestigationSidebar from '../components/InvestigationSidebar';
import { getRole } from '../roleStore';
import { Briefcase, Download, Filter, Network, Search } from 'lucide-react';

const Cases = () => {
  const navigate = useNavigate();
  const { cases, actions, transactions } = useWebSocket();
  const [filter, setFilter] = useState('ALL');
  const [sidebarState, setSidebarState] = useState({ isOpen: false, case: null, tx: null, actions: [] });
  const role = getRole();

  const ALL_STATUSES = ['ALL', 'NEW', 'HIGH_RISK', 'ACTIONED', 'MONITORING', 'CLOSED', 'CLOSED_FP'];

  const filteredCases = filter === 'ALL' 
    ? cases 
    : cases.filter(c => c.status === filter);

  const handleRowClick = (c) => {
    const relatedTx = transactions.find(t => t.case_id === c.case_id);
    const relatedActions = actions.filter(a => a.case_id === c.case_id);
    setSidebarState({ isOpen: true, case: c, tx: relatedTx, actions: relatedActions });
  };

  return (
    <div className="p-8 bg-background min-h-screen font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Page Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
              <Briefcase className="w-6 h-6 text-sky-400" />
              Case Management Queue
            </h1>
            <p className="text-xs text-slate-400 mt-1">Investigation workflows, status tracking, and audit logging</p>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => { window.location.href = 'http://127.0.0.1:8000/export/sentinel_audit.csv'; }}
              disabled={role !== "admin"}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all border ${
                role === "admin"
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 shadow-sm'
                  : 'opacity-40 grayscale cursor-not-allowed bg-slate-900 border-slate-800 text-slate-500'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Audit Log</span>
            </button>
          </div>
        </header>

        {/* Filter Bar */}
        <div className="flex items-center justify-between gap-4 p-2 bg-card border border-border/80 rounded-xl overflow-x-auto">
          <div className="flex items-center gap-1.5 min-w-max">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-3 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" /> Filter:
            </span>
            {ALL_STATUSES.map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
                  filter === f 
                    ? 'bg-primary text-white font-semibold shadow-sm' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <span className="text-xs font-mono text-slate-400 px-3 whitespace-nowrap">
            {filteredCases.length} cases
          </span>
        </div>

        {/* Table Container */}
        <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-muted/60 text-[10px] uppercase tracking-wider font-semibold text-slate-400 border-b border-border/80 select-none">
                  <th className="py-3.5 px-4">Case ID</th>
                  <th className="py-3.5 px-4">Primary Transaction</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-center">Risk Level</th>
                  <th className="py-3.5 px-4 text-right">Fraud Value</th>
                  <th className="py-3.5 px-4 text-right">Recoverable</th>
                  <th className="py-3.5 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredCases.map((c) => (
                  <tr 
                    key={c.case_id} 
                    onClick={() => handleRowClick(c)}
                    className="hover:bg-slate-800/40 transition-colors cursor-pointer border-b border-border/60"
                  >
                    <td className="py-3.5 px-4 font-mono text-xs font-semibold text-slate-200">
                      {c.case_id}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-400">
                      {role === "admin" ? (c.primary_tx_id || 'N/A') : '••••••••'}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border uppercase ${
                        c.status === 'HIGH_RISK' 
                          ? 'bg-rose-500/15 text-rose-400 border-rose-500/30' 
                          : 'bg-slate-800 text-slate-300 border-slate-700/60'
                      }`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <RiskBadge score={c.risk_level} />
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-sm font-semibold text-slate-100">
                      ₹{c.total_fraud_amount.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-sm font-semibold text-emerald-400">
                      ₹{c.recoverable_amount.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex justify-center items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/graph/${c.case_id}`); }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700/60 transition-colors"
                        >
                          <Network className="w-3 h-3 text-sky-400" />
                          <span>Graph</span>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRowClick(c); }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded bg-primary hover:bg-primary/90 text-white text-xs font-semibold transition-colors shadow-sm"
                        >
                          <span>Analyze</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <InvestigationSidebar 
        isOpen={sidebarState.isOpen}
        selectedCase={sidebarState.case ? cases.find(c => c.case_id === sidebarState.case.case_id) : null}
        selectedTransaction={sidebarState.tx}
        actions={sidebarState.case ? actions.filter(a => a.case_id === sidebarState.case.case_id) : []}
        onClose={() => setSidebarState({ ...sidebarState, isOpen: false })}
        role={role}
      />
    </div>
  );
};

export default Cases;

