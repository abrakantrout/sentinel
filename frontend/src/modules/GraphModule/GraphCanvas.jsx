import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import cytoscape from 'cytoscape';
import { graphStyles, SVG_USER, SVG_ALERT, SVG_CARD, SVG_STORE, SVG_UPI } from './graphStyles';
import { getRole } from '../../roleStore';
import { maskAccount } from '../../utils/maskAccount';

const formatTransactionLabel = (edge) => {
  const amount = Math.round(Number(edge.amount || 0));
  const formattedAmount = new Intl.NumberFormat('en-IN').format(amount);
  const ch = edge.channel || 'UPI';
  return `₹${formattedAmount} • ${ch}`;
};

const applyHierarchicalDagLayout = (cy, nodes, edges) => {
  if (!cy || cy.nodes().length === 0) return;

  const cyNodes = cy.nodes();
  const cyEdges = cy.edges();

  const inDegree = {};
  const adj = {};
  cyNodes.forEach((n) => {
    const id = n.id();
    inDegree[id] = 0;
    adj[id] = [];
  });

  cyEdges.forEach((e) => {
    const src = e.source().id();
    const tgt = e.target().id();
    if (adj[src]) adj[src].push(tgt);
    if (inDegree[tgt] !== undefined) inDegree[tgt] += 1;
  });

  const rankMap = {};
  const queue = [];

  cyNodes.forEach((n) => {
    const id = n.id();
    const nodeLayer = n.data('layer');
    if (nodeLayer !== undefined && nodeLayer !== null && !isNaN(Number(nodeLayer))) {
      rankMap[id] = Number(nodeLayer);
    } else if (inDegree[id] === 0) {
      queue.push({ id, depth: 0 });
    }
  });

  if (queue.length === 0 && cyNodes.length > 0 && Object.keys(rankMap).length === 0) {
    queue.push({ id: cyNodes[0].id(), depth: 0 });
  }

  const visited = new Set();
  while (queue.length > 0) {
    const { id, depth } = queue.shift();
    if (visited.has(id) || depth > 8) continue;
    visited.add(id);
    if (rankMap[id] === undefined) {
      rankMap[id] = depth;
    }
    const neighbors = adj[id] || [];
    neighbors.forEach((nxt) => {
      if (!visited.has(nxt)) {
        queue.push({ id: nxt, depth: depth + 1 });
      }
    });
  }

  // Ensure every node has a column rank
  cyNodes.forEach((n) => {
    const id = n.id();
    if (rankMap[id] === undefined) {
      rankMap[id] = 0;
    }
  });

  const columns = {};
  cyNodes.forEach((n) => {
    const id = n.id();
    const r = rankMap[id] !== undefined ? rankMap[id] : 0;
    if (!columns[r]) columns[r] = [];
    columns[r].push(id);
  });

  const colKeys = Object.keys(columns).map(Number).sort((a, b) => a - b);

  const rankSep = 260;
  const nodeSep = 145;
  const startX = 140;
  const centerY = 320;

  colKeys.forEach((colKey, colIdx) => {
    const colNodeIds = columns[colKey];
    const totalInCol = colNodeIds.length;
    const startY = centerY - ((totalInCol - 1) * nodeSep) / 2;

    colNodeIds.forEach((id, rowIdx) => {
      const cyNode = cy.getElementById(id);
      if (cyNode.length > 0) {
        cyNode.position({
          x: startX + colIdx * rankSep,
          y: startY + rowIdx * nodeSep
        });
      }
    });
  });

  setTimeout(() => {
    if (cy && !cy.destroyed()) {
      cy.resize();
      if (cy.elements().length > 0) {
        cy.fit(cy.elements(), 80);
      }
    }
  }, 100);
};

const GraphCanvas = forwardRef(({ nodes = [], edges = [], onNodeClick, onEdgeClick, onSelectionChange }, ref) => {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const isInitializedRef = useRef(false);
  const onNodeClickRef = useRef(onNodeClick);
  const onEdgeClickRef = useRef(onEdgeClick);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const traceTimerRef = useRef(null);

  const [tooltip, setTooltip] = useState(null);

  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
    onEdgeClickRef.current = onEdgeClick;
    onSelectionChangeRef.current = onSelectionChange;
  }, [onNodeClick, onEdgeClick, onSelectionChange]);

  useImperativeHandle(ref, () => ({
    fit: () => {
      if (cyRef.current) {
        cyRef.current.fit(cyRef.current.elements(), 60);
      }
    },
    reset: () => {
      if (cyRef.current) {
        cyRef.current.reset();
        applyHierarchicalDagLayout(cyRef.current, nodes, edges);
      }
    },
    zoomIn: () => {
      if (cyRef.current) {
        cyRef.current.zoom({
          level: cyRef.current.zoom() * 1.25,
          renderedPosition: { x: containerRef.current.clientWidth / 2, y: containerRef.current.clientHeight / 2 }
        });
      }
    },
    zoomOut: () => {
      if (cyRef.current) {
        cyRef.current.zoom({
          level: cyRef.current.zoom() * 0.8,
          renderedPosition: { x: containerRef.current.clientWidth / 2, y: containerRef.current.clientHeight / 2 }
        });
      }
    },
    centerOn: (id) => {
      const cy = cyRef.current;
      if (!cy) return;
      const ele = cy.getElementById(String(id));
      if (ele.length > 0) {
        cy.center(ele);
        cy.zoom({ level: 1.3, renderedPosition: { x: containerRef.current.clientWidth / 2, y: containerRef.current.clientHeight / 2 } });
      }
    },
    clearHighlight: () => {
      const cy = cyRef.current;
      if (!cy) return;
      if (traceTimerRef.current) {
        clearInterval(traceTimerRef.current);
        traceTimerRef.current = null;
      }
      cy.elements().removeClass('path-highlight dimmed new-transaction-pulse');
      onSelectionChangeRef.current?.(null);
    },
    tracePath: (onStepCallback, onCompleteCallback) => {
      const cy = cyRef.current;
      if (!cy) return;

      if (traceTimerRef.current) {
        clearInterval(traceTimerRef.current);
        traceTimerRef.current = null;
      }

      cy.elements().removeClass('path-highlight dimmed');
      const sortedEdges = cy.edges().sort((a, b) => (a.data('hop_number') || 1) - (b.data('hop_number') || 1));
      
      if (sortedEdges.length === 0) return;

      cy.elements().addClass('dimmed');
      let stepIndex = 0;

      traceTimerRef.current = setInterval(() => {
        if (stepIndex >= sortedEdges.length) {
          clearInterval(traceTimerRef.current);
          traceTimerRef.current = null;
          onCompleteCallback?.();
          return;
        }

        const currentEdge = sortedEdges[stepIndex];
        const sourceNode = currentEdge.source();
        const targetNode = currentEdge.target();

        currentEdge.removeClass('dimmed').addClass('path-highlight');
        sourceNode.removeClass('dimmed').addClass('path-highlight');
        targetNode.removeClass('dimmed').addClass('path-highlight');

        onStepCallback?.({
          step: stepIndex + 1,
          totalSteps: sortedEdges.length,
          edgeId: currentEdge.id(),
          source: sourceNode.id(),
          target: targetNode.id(),
          amount: currentEdge.data('amount'),
          hop: currentEdge.data('hop_number') || (stepIndex + 1)
        });

        stepIndex++;
      }, 450);
    }
  }));

  // 1. Cytoscape Setup
  useEffect(() => {
    if (!containerRef.current || isInitializedRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      elements: [],
      style: graphStyles,
      userZoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: false
    });

    cyRef.current = cy;
    window.cy = cy;
    isInitializedRef.current = true;

    // Node & Edge Hover Tooltips (Section 6 & 7)
    cy.on('mouseover', 'node', (evt) => {
      const node = evt.target;
      const data = node.data();
      const pos = evt.renderedPosition;
      setTooltip({
        type: 'node',
        x: pos.x + 20,
        y: pos.y - 20,
        id: data.accountId || data.id,
        entityType: (data.node_type || data.account_type || 'ACCOUNT').toUpperCase(),
        layer: data.layer || 0,
        status: data.status || 'ACTIVE',
        balance: data.balance || 0,
        inbound: data.total_inbound || 0,
        outbound: data.total_outbound || 0
      });
    });

    cy.on('mouseover', 'edge', (evt) => {
      const edge = evt.target;
      const data = edge.data();
      const pos = evt.renderedPosition;
      setTooltip({
        type: 'edge',
        x: pos.x + 20,
        y: pos.y - 20,
        id: data.tx_id || data.id,
        amount: data.amount || 0,
        channel: data.channel || 'UPI',
        hop: data.hop_number || 1,
        totalHops: data.total_hops || 1,
        suspicious: data.suspicious || false
      });
    });

    cy.on('mouseout', 'node edge', () => {
      setTooltip(null);
    });

    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      cy.elements().removeClass('path-highlight dimmed');

      const pathElements = node.successors().union(node.predecessors()).union(node);
      pathElements.addClass('path-highlight');
      cy.elements().difference(pathElements).addClass('dimmed');

      const edgeCount = pathElements.edges().length;
      onSelectionChangeRef.current?.({ type: 'node', id: node.id(), hops: edgeCount || 1 });
      onNodeClickRef.current?.(node.data());
    });

    cy.on('tap', 'edge', (evt) => {
      const edge = evt.target;
      cy.elements().removeClass('path-highlight dimmed');

      const sourceNode = edge.source();
      const pathElements = sourceNode.successors().union(sourceNode.predecessors()).union(sourceNode).union(edge);
      pathElements.addClass('path-highlight');
      cy.elements().difference(pathElements).addClass('dimmed');

      onSelectionChangeRef.current?.({
        type: 'edge',
        id: edge.id(),
        hops: edge.data('total_hops') || 1
      });
      onEdgeClickRef.current?.(edge.data());
    });

    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        cy.elements().removeClass('path-highlight dimmed');
        onSelectionChangeRef.current?.(null);
        onNodeClickRef.current?.(null);
        onEdgeClickRef.current?.(null);
        setTooltip(null);
      }
    });

    return () => {
      if (traceTimerRef.current) {
        clearInterval(traceTimerRef.current);
      }
      cyRef.current?.destroy();
      cyRef.current = null;
      isInitializedRef.current = false;
    };
  }, []);

  // 2. Data Sync & Hierarchical Left-to-Right Layout
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !isInitializedRef.current) return;

    cy.batch(() => {
      const role = getRole();
      const currentIds = new Set();

      nodes.forEach((item) => {
        const nodeId = String(item.accountId || item.id);
        currentIds.add(nodeId);
        const displayLabel = role === "admin" ? nodeId : maskAccount(nodeId);
        
        const t = (item.node_type || item.account_type || '').toLowerCase();
        let bgImg = SVG_USER;
        if (t.includes('mule') || t.includes('suspect')) bgImg = SVG_ALERT;
        else if (t.includes('cashout') || t.includes('atm') || t.includes('destination') || t.includes('collector')) bgImg = SVG_CARD;
        else if (t.includes('merchant')) bgImg = SVG_STORE;
        else if (t.includes('upi')) bgImg = SVG_UPI;

        const nodeData = { ...item, id: nodeId, displayLabel, bgImg };
        const existing = cy.getElementById(nodeId);
        if (existing.length > 0) {
          existing.data(nodeData);
        } else {
          cy.add({
            data: nodeData
          });
        }
      });

      edges.forEach((edge) => {
        const edgeId = String(edge.id || edge.tx_id || `${edge.source || edge.from}-${edge.target || edge.to}`);
        currentIds.add(edgeId);
        
        const existing = cy.getElementById(edgeId);
        if (existing.length > 0) {
          existing.data({ ...edge, label: edge.label || formatTransactionLabel(edge) });
        } else {
          const addedEdge = cy.add({
            data: {
              ...edge,
              id: edgeId,
              source: String(edge.source || edge.from),
              target: String(edge.target || edge.to),
              label: edge.label || formatTransactionLabel(edge)
            }
          });
          addedEdge.addClass('new-transaction-pulse');
          setTimeout(() => {
            addedEdge.removeClass('new-transaction-pulse');
          }, 2500);
        }
      });

      cy.elements().forEach((ele) => {
        if (!currentIds.has(ele.id())) {
          ele.remove();
        }
      });
    });

    if (nodes.length > 0) {
      applyHierarchicalDagLayout(cy, nodes, edges);
    }
  }, [nodes, edges]);

  return (
    <div className="relative w-full h-full" style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        ref={containerRef}
        className="graph-canvas"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          background: 'transparent',
          textAlign: 'left'
        }}
      />

      {/* FLOATING HOVER TOOLTIP POPOVER (SECTION 6 & 7) */}
      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 bg-slate-950/95 border border-slate-700/80 rounded-xl p-3 shadow-2xl backdrop-blur-md font-mono text-[11px] text-slate-200 min-w-48 space-y-1"
          style={{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }}
        >
          {tooltip.type === 'node' ? (
            <>
              <div className="flex justify-between items-center pb-1 border-b border-slate-800 font-bold text-sky-400">
                <span>{tooltip.id}</span>
                <span className="text-[9px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">{tooltip.status}</span>
              </div>
              <div className="flex justify-between text-slate-400"><span>Type:</span><span className="text-purple-400 font-bold">{tooltip.entityType}</span></div>
              <div className="flex justify-between text-slate-400"><span>Hop Layer:</span><span className="text-sky-300">Layer {tooltip.layer}</span></div>
              <div className="flex justify-between text-slate-400"><span>Inbound:</span><span className="text-emerald-400">₹{Number(tooltip.inbound).toLocaleString('en-IN')}</span></div>
              <div className="flex justify-between text-slate-400"><span>Outbound:</span><span className="text-rose-400">₹{Number(tooltip.outbound).toLocaleString('en-IN')}</span></div>
            </>
          ) : (
            <>
              <div className="flex justify-between items-center pb-1 border-b border-slate-800 font-bold text-emerald-400">
                <span>{tooltip.id}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded ${tooltip.suspicious ? 'bg-rose-950 text-rose-300 border border-rose-600/50' : 'bg-slate-800 text-slate-300'}`}>
                  {tooltip.suspicious ? 'SUSPICIOUS' : 'NORMAL'}
                </span>
              </div>
              <div className="flex justify-between text-slate-400"><span>Amount:</span><span className="text-emerald-300 font-bold">₹{Number(tooltip.amount).toLocaleString('en-IN')}</span></div>
              <div className="flex justify-between text-slate-400"><span>Channel:</span><span className="text-purple-300">{tooltip.channel}</span></div>
              <div className="flex justify-between text-slate-400"><span>Hop Position:</span><span className="text-sky-300">Hop {tooltip.hop}/{tooltip.totalHops}</span></div>
            </>
          )}
        </div>
      )}
    </div>
  );
});

export default React.memo(GraphCanvas);
