// ── SENTINEL INVESTIGATION GRAPH STYLES ──────────────────────────────────────
// High-fidelity dark navy SOC visual system matching reference design

const makeSvgUri = (svgStr) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgStr)}`;

export const SVG_USER = makeSvgUri('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>');
export const SVG_ALERT = makeSvgUri('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#F87171" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>');
export const SVG_CARD = makeSvgUri('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>');
export const SVG_STORE = makeSvgUri('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#34D399" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/></svg>');
export const SVG_UPI = makeSvgUri('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#C084FC" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 12l10 10 10-10L12 2z"/></svg>');

export const graphStyles = [
  {
    selector: 'node',
    style: {
      'shape': (node) => {
        const t = (node.data('node_type') || node.data('account_type') || '').toLowerCase();
        if (t.includes('victim') || t.includes('source')) return 'ellipse';
        if (t.includes('upi')) return 'diamond';
        return 'round-rectangle';
      },
      'width': 64,
      'height': 64,
      'background-color': (node) => {
        const t = (node.data('node_type') || node.data('account_type') || '').toLowerCase();
        if (t.includes('victim') || t.includes('source')) return '#163B7C';
        if (t.includes('mule') || t.includes('suspect')) return '#6B1717';
        if (t.includes('cashout') || t.includes('atm') || t.includes('destination') || t.includes('collector')) return '#63310B';
        if (t.includes('merchant')) return '#064E3B';
        if (t.includes('upi')) return '#4C1D95';
        return '#163B7C';
      },
      'background-opacity': 0.95,
      'border-width': 2.5,
      'border-color': (node) => {
        const t = (node.data('node_type') || node.data('account_type') || '').toLowerCase();
        if (t.includes('victim') || t.includes('source')) return '#38BDF8';
        if (t.includes('mule') || t.includes('suspect')) return '#EF4444';
        if (t.includes('cashout') || t.includes('atm') || t.includes('destination') || t.includes('collector')) return '#F59E0B';
        if (t.includes('merchant')) return '#10B981';
        if (t.includes('upi')) return '#A855F7';
        return '#38BDF8';
      },
      'background-image': 'data(bgImg)',
      'background-fit': 'none',
      'background-width': 26,
      'background-height': 26,
      'background-position-x': '50%',
      'background-position-y': '50%',

      // Label below node
      'label': (node) => {
        const id = node.data('displayLabel') || node.data('accountId') || node.data('id') || '';
        const status = node.data('status') || '';
        const short = String(id).length > 18 ? String(id).slice(0, 16) + '…' : String(id);
        return status === 'withdrawn' ? `${short} ✕` : short;
      },
      'text-valign': 'bottom',
      'text-halign': 'center',
      'text-margin-y': 10,
      'color': '#F1F5F9',
      'font-family': 'JetBrains Mono, monospace',
      'font-size': 11,
      'font-weight': 'bold',
      'text-background-color': '#070D1A',
      'text-background-opacity': 0.95,
      'text-background-padding': 4,
      'text-border-color': '#1E3A5F',
      'text-border-width': 1,
      'text-border-opacity': 0.95,
      'overlay-opacity': 0,
      'transition-property': 'background-color, border-color, border-width, width, height, opacity',
      'transition-duration': '0.2s'
    }
  },
  {
    selector: 'edge',
    style: {
      'label': (edge) => {
        const amt = Math.round(Number(edge.data('amount') || 0)).toLocaleString('en-IN');
        const ch = edge.data('channel') || 'UPI';
        return `₹${amt} • ${ch}`;
      },
      'width': 2.5,
      'line-color': (edge) => edge.data('suspicious') ? '#EF4444' : '#38BDF8',
      'target-arrow-color': (edge) => edge.data('suspicious') ? '#EF4444' : '#38BDF8',
      'target-arrow-shape': 'triangle',
      'arrow-scale': 1.2,
      'line-style': (edge) => edge.data('suspicious') ? 'dashed' : 'solid',
      'line-dash-pattern': [7, 4],
      'curve-style': 'bezier',
      'control-point-step-size': 40,
      'font-family': 'JetBrains Mono, monospace',
      'font-size': 10,
      'font-weight': 'bold',
      'color': (edge) => edge.data('suspicious') ? '#FCA5A5' : '#CBD5E1',
      'text-rotation': 'none',
      'text-margin-y': -10,
      'text-background-color': '#070D1A',
      'text-background-opacity': 0.95,
      'text-background-padding': 4,
      'text-border-color': (edge) => edge.data('suspicious') ? '#EF4444' : '#1E293B',
      'text-border-width': 1,
      'opacity': 0.95,
      'overlay-opacity': 0,
      'transition-property': 'line-color, target-arrow-color, width, opacity',
      'transition-duration': '0.2s'
    }
  },
  {
    // Selected node - highlighted glowing border
    selector: 'node:selected',
    style: {
      'border-width': 4,
      'border-color': '#38BDF8',
      'width': 70,
      'height': 70,
      'z-index': 50
    }
  },
  {
    // Selected edge
    selector: 'edge:selected',
    style: {
      'width': 4,
      'line-color': '#38BDF8',
      'target-arrow-color': '#38BDF8',
      'z-index': 50
    }
  },
  {
    selector: 'node.path-highlight',
    style: {
      'border-width': 4.5,
      'border-color': '#38BDF8',
      'opacity': 1,
      'z-index': 60
    }
  },
  {
    selector: 'edge.path-highlight',
    style: {
      'width': 4.5,
      'line-color': '#38BDF8',
      'target-arrow-color': '#38BDF8',
      'opacity': 1,
      'z-index': 60,
      'text-background-color': '#0C4A6E',
      'text-border-color': '#38BDF8',
      'text-border-width': 1.5,
      'color': '#E0F2FE'
    }
  },
  {
    selector: 'edge.new-transaction-pulse',
    style: {
      'width': 5,
      'line-color': '#EF4444',
      'target-arrow-color': '#EF4444',
      'opacity': 1,
      'z-index': 100,
      'text-background-color': '#7F1D1D',
      'text-border-color': '#EF4444',
      'text-border-width': 1.5
    }
  },
  {
    selector: '.dimmed',
    style: {
      'opacity': 0.15
    }
  }
];
