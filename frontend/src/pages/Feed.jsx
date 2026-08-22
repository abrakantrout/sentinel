import React, { useState, useEffect, useRef } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import RiskBadge from '../components/RiskBadge';
import InvestigationSidebar from '../components/InvestigationSidebar';
import { getRole } from '../roleStore';
import { maskAccount } from '../utils/maskAccount';
import { Activity, Zap, AlertTriangle, ShieldCheck, ArrowRight, Layers } from 'lucide-react';

const Feed = () => {
  const { transactions, cases, actions } = useWebSocket();
  const [sidebarState, setSidebarState] = useState({ isOpen: false, tx: null, case: null });
  const [newTxIds, setNewTxIds] = useState(new Set());
  const previousTxIdsRef = useRef(new Set());
  const role = getRole();
  
  // Track new incoming transaction IDs for highlight animation
  useEffect(() => {
    if (transactions.length === 0) return;
    const currentIds = new Set(transactions.map((t) => t.tx_id));
    const newlyArrived = new Set();

    currentIds.forEach((id) => {
      if (!previousTxIdsRef.current.has(id)) {
        newlyArrived.add(id);
      }
    });

    if (newlyArrived.size > 0 && previousTxIdsRef.current.size > 0) {
      setNewTxIds((prev) => new Set([...prev, ...newlyArrived]));
      const timer = setTimeout(() => {
        setNewTxIds((prev) => {
          const next = new Set(prev);
          newlyArrived.forEach((id) => next.delete(id));
          return next;
        });
      }, 2500);
      return () => clearTimeout(timer);
    }

    previousTxIdsRef.current = currentIds;
  }, [transactions]);

  // Data calculations for Header
  const totalTransactions = transactions.length;
  const totalAtRiskAmount = cases.reduce((sum, c) => sum + (c.total_fraud_amount || 0), 0);

  // Calculate Tx/min (transactions in the last 60 seconds)
  const now = Date.now();
  const txPerMin = transactions.filter(tx => 
    now - new Date(tx.timestamp).getTime() < 60000
  ).length;

  // Sort transactions by timestamp (latest first) and limit to 100
  const sortedTransactions = [...transactions]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 100);

  const formatTime = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  };

  const getRowClass = (tx) => {
    const isNew = newTxIds.has(tx.tx_id);
    const score = tx.risk_score || 0;

    let baseClass = "transition-all duration-150 cursor-pointer border-b border-border/60 hover:bg-slate-800/40 ";

    if (isNew) {
      baseClass += "animate-new-row ";
    }

    if (tx.regulatory_flagged && !tx.requires_pan) {
      return baseClass + "border-l-2 border-l-amber-500 bg-amber-500/5";
    }
    if (score >= 85) {
      return baseClass + "border-l-2 border-l-rose-500 bg-rose-500/10";
    }
    if (score >= 70) {
      return baseClass + "border-l-2 border-l-orange-500 bg-orange-500/5";
    }
    if (score >= 40) {
      return baseClass + "border-l-2 border-l-amber-500/50";
    }

    return baseClass + "border-l-2 border-l-transparent";
  };

  const handleTxClick = (tx) => {
    const relatedCase = cases.find(c => c.case_id === tx.case_id);
    const relatedActions = actions.filter(a => a.case_id === tx.case_id);
    setSidebarState({ isOpen: true, tx, case: relatedCase, actions: relatedActions });
  };

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden font-sans">
      {/* Top Header / KPI Bar */}
      <header className="px-8 py-5 border-b border-border/80 bg-card/60 backdrop-blur-md shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-100">Live Transaction Stream</h1>
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                STREAMING
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">Real-time payment scoring and anomaly evaluation pipeline</p>
          </div>
          
          {/* KPI Cards */}
          <div className="flex items-center gap-4">
            <div className="px-4 py-2 bg-muted/30 rounded-xl border border-border/60 min-w-[130px]">
              <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider block">Throughput</span>
              <span className="text-lg font-mono font-bold text-slate-100">{totalTransactions} <span className="text-xs text-slate-500 font-sans font-normal">txs</span></span>
            </div>

            <div className="px-4 py-2 bg-muted/30 rounded-xl border border-border/60 min-w-[140px]">
              <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider block flex items-center gap-1">
                <Zap className="w-3 h-3 text-sky-400 fill-sky-400/20" />
                Velocity
              </span>
              <span className="text-lg font-mono font-bold text-sky-400">{txPerMin} <span className="text-xs text-slate-400 font-sans font-normal">tx/min</span></span>
            </div>

            <div className="px-4 py-2 bg-muted/30 rounded-xl border border-border/60 min-w-[160px]">
              <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider block flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-rose-400" />
                At Risk Flagged
              </span>
              <span className="text-lg font-mono font-bold text-rose-400">₹{totalAtRiskAmount.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Table Container */}
      <div className="flex-1 overflow-auto p-6 md:p-8">
        <div className="max-w-7xl mx-auto">
          {sortedTransactions.length > 0 ? (
            <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[900px]">
                  <thead>
                    <tr className="bg-muted/60 text-[10px] uppercase tracking-wider font-semibold text-slate-400 border-b border-border/80 select-none">
                      <th className="py-3 px-4">Tx ID</th>
                      <th className="py-3 px-4 text-center">Time</th>
                      <th className="py-3 px-4 text-center">Channel</th>
                      <th className="py-3 px-4">Sender → Receiver</th>
                      <th className="py-3 px-4 text-right">Amount</th>
                      <th className="py-3 px-4 text-center">Risk Score</th>
                      <th className="py-3 px-4 text-left">Reason / Intelligence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTransactions.map((tx) => (
                      <tr 
                        key={tx.tx_id} 
                        onClick={() => handleTxClick(tx)}
                        className={getRowClass(tx)}
                      >
                        <td className="py-3.5 px-4 font-mono text-xs font-semibold text-slate-200">
                          {role === "admin" ? tx.tx_id : "••••••••"}
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono text-xs text-slate-400">
                          {formatTime(tx.timestamp)}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/60 uppercase">
                            {tx.channel}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2 text-xs font-mono">
                            <span className="text-sky-400 font-medium">
                              {role === "admin" ? tx.sender_account : maskAccount(tx.sender_account)}
                            </span>
                            <ArrowRight className="w-3 h-3 text-slate-500 shrink-0" />
                            <span className="text-sky-400 font-medium">
                              {role === "admin" ? tx.receiver_account : maskAccount(tx.receiver_account)}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-sm font-semibold text-slate-100">
                          ₹{tx.amount.toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <RiskBadge score={tx.risk_score} />
                        </td>
                        <td className="py-3.5 px-4">
                          {tx.reason ? (
                            <span className="text-xs text-slate-300 truncate max-w-[260px] block font-medium">
                              {tx.reason}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-600 italic">No flag triggers</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Professional Empty State */
            <div className="flex flex-col items-center justify-center p-16 border border-dashed border-border/80 rounded-2xl bg-card/40 text-center max-w-xl mx-auto my-12 shadow-xl">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-5 shadow-inner">
                <Activity className="w-7 h-7 text-primary animate-pulse" />
              </div>
              <h3 className="text-base font-bold text-slate-100 tracking-tight mb-1">
                Waiting for incoming transactions...
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed max-w-sm mb-4">
                The real-time fraud monitoring pipeline is active and scanning payment channels.
              </p>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/60 border border-slate-700/60 text-[11px] font-mono text-slate-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Listening on WebSocket ws://localhost:8000/ws
              </div>
            </div>
          )}
        </div>
      </div>

      <InvestigationSidebar 
        isOpen={sidebarState.isOpen}
        selectedTransaction={sidebarState.tx}
        selectedCase={sidebarState.case ? cases.find(c => c.case_id === sidebarState.case.case_id) : null}
        actions={sidebarState.case ? actions.filter(a => a.case_id === sidebarState.case.case_id) : []}
        onClose={() => setSidebarState({ ...sidebarState, isOpen: false })}
        role={role}
      />
    </div>
  );
};

export default Feed;

