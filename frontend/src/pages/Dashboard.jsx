import { useMemo, useState } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import CaseCard from '../components/CaseCard';
import InvestigationSidebar from '../components/InvestigationSidebar';
import { getRole } from '../roleStore';
import { Shield, TrendingUp, PieChart as PieIcon, BarChart3, ShieldCheck, DollarSign } from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  BarChart, Bar
} from 'recharts';

const Dashboard = () => {
  const { cases, actions, transactions } = useWebSocket();
  const [sidebarState, setSidebarState] = useState({ isOpen: false, case: null, tx: null, actions: [] });
  const role = getRole();

  // Urgency Score Logic: risk_level * (1 + 1 / max(golden_window_minutes, 1))
  const calculateUrgency = (caseData) => {
    const risk = caseData.risk_level;
    const window = Math.max(caseData.golden_window_minutes, 1);
    return risk * (1 + 1 / window);
  };

  // Sort cases by urgency_score (descending)
  const sortedCases = [...cases].sort((a, b) => {
    return calculateUrgency(b) - calculateUrgency(a);
  });

  const handleAnalyze = (c, tx) => {
    const relatedActions = actions.filter(a => a.case_id === c.case_id);
    setSidebarState({ isOpen: true, case: c, tx, actions: relatedActions });
  };

  // --- Analytics Data Preparation ---
  
  // 1. Risk Trend (Latest 20 transactions)
  const riskTrendData = [...transactions].reverse().slice(-20).map((tx, idx) => ({
    name: idx,
    score: tx.risk_score,
    id: String(tx.tx_id || '').slice(-4)
  }));

  // 2. Channel Distribution
  const channels = ['UPI', 'IMPS', 'NEFT', 'CARD'];
  const channelData = channels.map(name => ({
    name,
    value: transactions.filter(tx => tx.channel === name).length
  }));
  const COLORS = ['#38bdf8', '#10b981', '#f59e0b', '#ef4444'];

  // 3. Recovery Totals
  const totalFraud = useMemo(() => cases.reduce((sum, c) => sum + (c.total_fraud_amount || 0), 0), [cases]);
  const totalRecoverable = useMemo(() => cases.reduce((sum, c) => sum + (c.recoverable_amount || 0), 0), [cases]);
  const estimatedLoss = totalFraud - totalRecoverable;

  // 4. Risk Factor Frequency
  const factorMap = {};
  transactions.forEach(tx => {
    tx.risk_factors?.forEach(f => {
      factorMap[f.name] = (factorMap[f.name] || 0) + 1;
    });
  });
  const factorData = Object.entries(factorMap)
    .map(([name, count]) => ({ name: name.replace(/_/g, ' '), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return (
    <div className="p-8 bg-background min-h-screen font-sans overflow-x-hidden">
      {/* Header */}
      <header className="mb-10 max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
              <Shield className="w-6 h-6 text-sky-400" />
              Fraud Analytics & Case Operations
            </h1>
            <p className="text-xs text-slate-400 mt-1">Real-time risk velocity, recovery metrics, and priority case queues</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            <span>Active Urgency Sorting</span>
          </div>
        </div>
      </header>

      {/* Case Grid Section */}
      <section className="mb-16 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6 pb-2 border-b border-border/60">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <span>Active Investigations</span>
            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono text-[10px]">
              {sortedCases.length}
            </span>
          </h2>
        </div>

        {sortedCases.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedCases.map((c) => (
              <CaseCard 
                key={c.case_id} 
                caseData={c} 
                onAnalyze={handleAnalyze}
                transactions={transactions}
                role={role}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-16 border border-dashed border-border/80 rounded-2xl bg-card/40 text-center max-w-md mx-auto my-8 shadow-lg">
            <ShieldCheck className="w-10 h-10 text-emerald-400 mb-3" />
            <h3 className="text-base font-semibold text-slate-100 tracking-tight">No active cases</h3>
            <p className="text-xs text-slate-400 mt-1">The system is currently secure and monitoring incoming events.</p>
          </div>
        )}
      </section>

      {/* Operational Intelligence Section */}
      <section className="max-w-7xl mx-auto pt-10 border-t border-border/60">
        <header className="mb-8">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-sky-400" />
            Operational Intelligence & Telemetry
          </h2>
          <p className="text-xs text-slate-400 mt-1">Live analytics, channel breakdown, and top fraud indicators</p>
        </header>

        {/* Financial Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-10">
          {[
            { label: 'Total Exposure', value: `₹${(totalFraud/100000).toFixed(1)}L`, color: 'text-slate-100' },
            { label: 'Recoverable Assets', value: `₹${(totalRecoverable/100000).toFixed(1)}L`, color: 'text-emerald-400' },
            { label: 'Frozen Assets', value: `₹${(totalRecoverable * 0.8 / 100000).toFixed(1)}L`, color: 'text-sky-400' },
            { label: 'Estimated Loss', value: `₹${(estimatedLoss/100000).toFixed(1)}L`, color: 'text-rose-400' },
          ].map((stat, i) => (
            <div key={i} className="bg-card border border-border/80 p-5 rounded-xl shadow-sm">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{stat.label}</span>
              <p className={`text-2xl font-mono font-bold mt-1.5 ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Risk Velocity Trend Line Chart */}
          <div className="lg:col-span-2 bg-card border border-border/80 rounded-2xl p-6 shadow-xl">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-6 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-sky-400" />
              Risk Velocity Trend (Recent Stream)
            </h3>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={riskTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="id" hide />
                  <YAxis domain={[0, 100]} stroke="#64748b" fontSize={11} fontFamily="JetBrains Mono" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0e1626', borderColor: '#1e293b', borderRadius: '10px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)' }}
                    itemStyle={{ fontSize: '11px', color: '#38bdf8', fontFamily: 'JetBrains Mono' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="score" 
                    stroke="#38bdf8" 
                    strokeWidth={3} 
                    dot={{ fill: '#38bdf8', r: 3 }} 
                    activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
                    animationDuration={800}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Channel Distribution Pie Chart */}
          <div className="bg-card border border-border/80 rounded-2xl p-6 shadow-xl">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-6 flex items-center gap-2">
              <PieIcon className="w-4 h-4 text-sky-400" />
              Channel Volume
            </h3>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={channelData}
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {channelData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#0e1626', borderColor: '#1e293b', borderRadius: '10px' }} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Risk Factors Bar Chart */}
          <div className="lg:col-span-3 bg-card border border-border/80 rounded-2xl p-6 shadow-xl">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-6 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-rose-400" />
              Top Fraud Indicators & Trigger Frequency
            </h3>
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={factorData} layout="vertical">
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={11} width={130} />
                  <Tooltip 
                    cursor={{ fill: 'rgba(255, 255, 255, 0.03)' }}
                    contentStyle={{ backgroundColor: '#0e1626', borderColor: '#1e293b', borderRadius: '10px' }}
                  />
                  <Bar dataKey="count" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>
      </section>

      {/* Page Footer */}
      <footer className="max-w-7xl mx-auto mt-20 pt-8 pb-10 border-t border-border/60 flex justify-between items-center text-xs text-slate-500 font-mono">
        <span>SENTINEL Operational Intelligence Engine v1.4.0</span>
        <div className="flex gap-4">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" /> Pipeline Operational
          </span>
        </div>
      </footer>

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

export default Dashboard;

