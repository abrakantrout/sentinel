import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import GraphCanvas from './GraphCanvas';
import TransactionDetailModal from './TransactionDetailModal';
import EntityDetailModal from './EntityDetailModal';
import './GraphModule.css';

import { 
  ZoomIn, ZoomOut, Maximize2, RotateCcw, 
  Copy, Check, Play, Square, Compass, Clock, Network
} from 'lucide-react';

const TOPOLOGY_LABELS = {
  FAN_IN: 'Aggregator Fan-In',
  FAN_OUT: 'Fan-Out Distribution',
  CIRCULAR_LOOP: 'Circular Flow',
  STRUCTURING_PASS_THROUGH: 'Structured Layering',
  LINEAR_CHAIN: 'Mule Chain',
  DIRECT_CASHOUT: 'Direct Terminal Cashout',
  MULTI_HOP_DAG: 'Multi-Hop DAG'
};

const GraphModule = ({ caseData, actions = [], onAction, connectionStatus, newTransactionEvent }) => {
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [copiedCase, setCopiedCase] = useState(false);
  const [isTracing, setIsTracing] = useState(false);
  const [traceProgress, setTraceProgress] = useState(null);

  const canvasRef = useRef(null);

  const rawNodes = useMemo(() => Array.isArray(caseData?.nodes) ? caseData.nodes : [], [caseData?.nodes]);
  const rawEdges = useMemo(() => Array.isArray(caseData?.edges) ? caseData.edges : [], [caseData?.edges]);
  
  const rawTopo = caseData?.topology_type || 'DIRECT_CASHOUT';
  const humanTopology = TOPOLOGY_LABELS[rawTopo] || rawTopo.replace(/_/g, ' ');
  const caseId = caseData?.case_id || 'CASE-15323124';
  const primaryTx = caseData?.primary_tx_id || (rawEdges[0] ? (rawEdges[0].tx_id || rawEdges[0].id) : 'TX-E6B7D984');
  const riskScore = caseData?.risk_score !== undefined ? caseData.risk_score : 100;
  const caseStatus = caseData?.status || 'HIGH_RISK';

  // Suspicious Flow Calculation
  const suspiciousFlowAmount = useMemo(() => {
    const susp = rawEdges.filter(e => e.suspicious);
    const pool = susp.length > 0 ? susp : rawEdges;
    return pool.reduce((acc, e) => acc + Number(e.amount || 0), 0);
  }, [rawEdges]);

  // Metrics
  const metrics = useMemo(() => {
    const totalNodes = rawNodes.length;
    const totalEdges = rawEdges.length;
    const maxHops = Math.max(...rawNodes.map(n => Number(n.layer || 0)), ...rawEdges.map(e => Number(e.hop_number || 1)), 1);
    return { totalNodes, totalEdges, maxHops };
  }, [rawNodes, rawEdges]);

  // Lead / Active Selected Node for Bottom Card
  const activeSelectedNode = useMemo(() => {
    if (selectedNode) return selectedNode;
    // Default to first mule or first suspect node
    const suspect = rawNodes.find(n => 
      (n.node_type || n.account_type || '').toLowerCase().includes('mule') ||
      (n.node_type || n.account_type || '').toLowerCase().includes('suspect')
    );
    return suspect || rawNodes[1] || rawNodes[0] || null;
  }, [selectedNode, rawNodes]);

  const handleCopyCaseId = () => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(caseId);
      setCopiedCase(true);
      setTimeout(() => setCopiedCase(false), 2000);
    }
  };

  const handleTrace = () => {
    if (isTracing) {
      canvasRef.current?.clearHighlight();
      setIsTracing(false);
      setTraceProgress(null);
      return;
    }
    setIsTracing(true);
    canvasRef.current?.tracePath(
      (p) => setTraceProgress(p),
      () => {
        setIsTracing(false);
        setTraceProgress(null);
      }
    );
  };

  if (!caseData) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-[#060B14] text-slate-400 font-mono text-xs">
        LOADING INVESTIGATION GRAPH...
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full overflow-hidden select-none bg-[#060B14] text-[#F8FAFC]" style={{ height: '100vh', maxHeight: '100vh' }}>
      {/* ── TOP INVESTIGATION HEADER (EXACT SENTINEL SPEC) ──────────────────── */}
      <div className="h-12 border-b border-[#131F33] bg-[#070D1A] flex items-center justify-between px-4 shrink-0 font-['JetBrains_Mono'] text-[11px]">
        <div className="flex items-center gap-4 overflow-x-auto">
          {/* Case Identifier + Copy */}
          <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-[#0B1528] border border-[#1A2C4A]">
            <span className="text-slate-400 text-[10px] font-semibold tracking-wider">CASE</span>
            <span className="text-white font-bold tracking-tight">{caseId}</span>
            <button 
              onClick={handleCopyCaseId}
              className="text-slate-400 hover:text-sky-400 transition-colors ml-0.5"
              title="Copy Case ID"
            >
              {copiedCase ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>

          {/* Risk Level Badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-red-500/50 bg-red-950/30 text-red-400 font-bold text-[10px]">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span>{riskScore} CRITICAL</span>
          </div>

          {/* Case Status Badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-emerald-500/50 bg-emerald-950/30 text-emerald-400 font-bold text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>{caseStatus}</span>
          </div>

          {/* Primary Transaction ID */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 text-[10px] uppercase tracking-wider font-semibold">PRIMARY TX</span>
            <span className="text-slate-200 font-bold">{primaryTx}</span>
          </div>

          {/* Suspicious Flow Amount */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 text-[10px] uppercase tracking-wider font-semibold">SUSPICIOUS FLOW</span>
            <span className="text-amber-400 font-bold tracking-tight">
              ₹{Number(suspiciousFlowAmount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          {/* Topology Hops & Entities */}
          <div className="flex items-center gap-1.5 text-slate-300">
            <Network className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-slate-300">{metrics.maxHops} Hops · {metrics.totalNodes} Entities</span>
          </div>

          {/* SLA Window Remaining */}
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-red-400" />
            <span className="text-slate-500 text-[10px] uppercase tracking-wider font-semibold">SLA WINDOW</span>
            <span className="text-red-400 font-bold">20m Remaining</span>
          </div>
        </div>
      </div>

      {/* ── GRAPH WORKSPACE CANVAS ────────────────────────────────────────── */}
      <div className="relative w-full overflow-hidden sentinel-dot-grid flex flex-col" style={{ height: 'calc(100vh - 48px)', minHeight: 0 }}>
        {/* TOP FLOATING CONTROLS BAR */}
        <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
          {/* Left: Compact Zoom Controls + Trace Path */}
          <div className="pointer-events-auto flex items-center gap-1 bg-[#070D1A]/95 border border-[#1E2E4A] rounded-lg p-1 shadow-2xl backdrop-blur-md">
            <button 
              onClick={() => canvasRef.current?.zoomIn()}
              className="p-1.5 text-slate-400 hover:text-sky-400 hover:bg-[#0E1B33] rounded transition-all" 
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button 
              onClick={() => canvasRef.current?.zoomOut()}
              className="p-1.5 text-slate-400 hover:text-sky-400 hover:bg-[#0E1B33] rounded transition-all" 
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button 
              onClick={() => canvasRef.current?.fit()}
              className="p-1.5 text-slate-400 hover:text-sky-400 hover:bg-[#0E1B33] rounded transition-all" 
              title="Fit to Screen"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button 
              onClick={() => canvasRef.current?.reset()}
              className="p-1.5 text-slate-400 hover:text-sky-400 hover:bg-[#0E1B33] rounded transition-all" 
              title="Reset View"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-4 bg-[#1E2E4A] mx-1" />
            <button
              onClick={handleTrace}
              className={`px-3 py-1 rounded text-[11px] font-['JetBrains_Mono'] font-bold flex items-center gap-1.5 transition-all ${
                isTracing
                  ? 'text-red-400 bg-red-950/40 border border-red-500/50 animate-pulse'
                  : 'text-sky-400 hover:text-sky-300 hover:bg-sky-950/20'
              }`}
            >
              {isTracing ? (
                <>
                  <Square className="w-3 h-3 fill-current" />
                  <span>HOP {traceProgress?.step || 1}/{traceProgress?.totalSteps || '?'}</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 fill-current" />
                  <span>TRACE PATH</span>
                </>
              )}
            </button>
          </div>

          {/* Right: Topology Info Pill */}
          <div className="pointer-events-auto flex items-center gap-2 bg-[#070D1A]/95 border border-[#1E2E4A] rounded-lg px-3.5 py-1.5 shadow-2xl backdrop-blur-md">
            <span className="text-[11px] font-['JetBrains_Mono'] font-bold text-sky-400 tracking-wide">
              TOPOLOGY: <span className="text-slate-100 font-semibold">{humanTopology} ({rawNodes.length} Nodes · {rawEdges.length} Flows)</span>
            </span>
          </div>
        </div>

        {/* CYTOSCAPE GRAPH CANVAS */}
        <GraphCanvas
          ref={canvasRef}
          nodes={rawNodes}
          edges={rawEdges}
          onNodeClick={(n) => {
            setSelectedNode(n);
            setSelectedEdge(null);
          }}
          onEdgeClick={(e) => {
            setSelectedEdge(e);
            setSelectedNode(null);
          }}
          onSelectionChange={() => {}}
        />

        {/* ── BOTTOM OVERLAYS ──────────────────────────────────────────────── */}
        <div className="absolute bottom-4 left-4 right-4 z-20 flex items-end justify-between pointer-events-none">
          {/* BOTTOM-LEFT: ENTITY GEOMETRIES LEGEND */}
          <div className="pointer-events-auto bg-[#070D1A]/95 border border-[#1E2E4A] rounded-xl p-3 shadow-2xl backdrop-blur-md font-['JetBrains_Mono'] text-[10px] w-48 space-y-2">
            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider pb-1 border-b border-[#1E2E4A]">
              ENTITY GEOMETRIES
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#1D4ED8] border border-[#38BDF8]" />
                <span className="text-slate-300">Victim Account</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#991B1B] border border-[#EF4444]" />
                <span className="text-slate-300">Mule Account</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#065F46] border border-[#10B981]" />
                <span className="text-slate-300">Merchant Outlet</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rotate-45 bg-[#6B21A8] border border-[#C084FC]" />
                <span className="text-slate-300">UPI Handle</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#92400E] border border-[#F59E0B]" />
                <span className="text-slate-300">Cashout Terminal</span>
              </div>
            </div>
            <div className="pt-1.5 border-t border-[#1E2E4A] space-y-1">
              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                FLOW PATHS
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 border-t-2 border-dashed border-red-500" />
                <span className="text-red-400 text-[9px]">Suspicious Flow</span>
              </div>
            </div>
          </div>

          {/* BOTTOM-MIDDLE: SELECTED NODE INFORMATION */}
          {activeSelectedNode && (
            <div className="pointer-events-auto bg-[#070D1A]/95 border border-[#1E2E4A] rounded-xl p-3 shadow-2xl backdrop-blur-md font-['JetBrains_Mono'] text-[11px] min-w-72 space-y-2">
              <div className="flex items-center justify-between gap-3 pb-1 border-b border-[#1E2E4A]">
                <span className="font-bold text-slate-100">
                  {activeSelectedNode.displayLabel || activeSelectedNode.accountId || activeSelectedNode.id}
                </span>
                <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${
                  (activeSelectedNode.node_type || activeSelectedNode.account_type || '').toLowerCase().includes('mule')
                    ? 'bg-red-950/40 text-red-400 border-red-500/40'
                    : (activeSelectedNode.node_type || activeSelectedNode.account_type || '').toLowerCase().includes('victim')
                    ? 'bg-blue-950/40 text-blue-400 border-blue-500/40'
                    : 'bg-amber-950/40 text-amber-400 border-amber-500/40'
                }`}>
                  {activeSelectedNode.node_type || activeSelectedNode.account_type || 'MULE'}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-400 text-[10.5px]">
                <span>Assessed Risk:</span>
                <span className="text-red-400 font-bold">{activeSelectedNode.risk_score || 98}/100</span>
              </div>
              <div className="flex items-center justify-between text-slate-400 text-[10.5px]">
                <span>Flow Activity:</span>
                <span className="text-slate-200 font-semibold">
                  ₹{Number(activeSelectedNode.total_inbound || 80852).toLocaleString('en-IN')} ➔ ₹{Number(activeSelectedNode.total_outbound || 79235).toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          )}

          {/* BOTTOM-RIGHT: CANVAS MINIMAP */}
          <div className="pointer-events-auto bg-[#070D1A]/95 border border-[#1E2E4A] rounded-xl p-2.5 shadow-2xl backdrop-blur-md w-52 h-32 flex flex-col font-['JetBrains_Mono']">
            <div className="flex items-center justify-between text-[9.5px] text-slate-400 pb-1.5 border-b border-[#1E2E4A]">
              <div className="flex items-center gap-1 font-semibold text-slate-300">
                <Compass className="w-3 h-3 text-sky-400" />
                <span>CANVAS MINIMAP</span>
              </div>
              <span className="text-slate-500 font-medium">{rawNodes.length} Nodes</span>
            </div>
            <div className="flex-1 w-full relative pt-1.5 flex items-center justify-center">
              <svg className="w-full h-full" viewBox="0 0 160 55">
                {/* Dynamically render lines between nodes */}
                {rawEdges.map((e, idx) => {
                  const total = Math.max(rawNodes.length - 1, 1);
                  const x1 = Math.min(15 + (idx % total) * (130 / total), 140);
                  const y1 = 28 + ((idx % 3) - 1) * 12;
                  const x2 = Math.min(15 + ((idx + 1) % total) * (130 / total), 145);
                  const y2 = 28 + (((idx + 1) % 3) - 1) * 12;
                  return (
                    <line
                      key={`ml-${idx}`}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={e.suspicious ? '#EF4444' : '#38BDF8'}
                      strokeWidth="1.2"
                      opacity="0.75"
                    />
                  );
                })}
                {/* Dynamically render dots for nodes */}
                {rawNodes.map((n, idx) => {
                  const total = Math.max(rawNodes.length - 1, 1);
                  const cx = 15 + idx * (130 / total);
                  const cy = 28 + ((idx % 3) - 1) * 12;
                  const isVictim = (n.node_type || n.account_type || '').toLowerCase().includes('victim');
                  const isMule = (n.node_type || n.account_type || '').toLowerCase().includes('mule');
                  const fill = isVictim ? '#38BDF8' : isMule ? '#EF4444' : '#F59E0B';
                  return (
                    <circle
                      key={`mn-${idx}`}
                      cx={cx}
                      cy={cy}
                      r="3.5"
                      fill={fill}
                    />
                  );
                })}
              </svg>
            </div>
          </div>
        </div>

        {/* MODALS */}
        {selectedEdge && (
          <TransactionDetailModal edge={selectedEdge} onClose={() => setSelectedEdge(null)} />
        )}

        {selectedNode && (
          <EntityDetailModal node={selectedNode} onClose={() => setSelectedNode(null)} />
        )}
      </div>
    </div>
  );
};

export default GraphModule;
