export const STATUS_STYLES = {
  active: { bg: '#3B82F6', border: '#1D4ED8', icon: '' },
  flagged: { bg: '#F97316', border: '#EA580C', icon: '\u26A0' },
  frozen: { bg: '#9CA3AF', border: '#6B7280', icon: '\uD83D\uDD12' },
  withdrawn: { bg: '#EF4444', border: '#B91C1C', icon: '\u2715' }
};

export const TYPE_STYLES = {
  SOURCE: { bg: '#2563EB', border: '#1D4ED8' },
  MULE: { bg: '#DC2626', border: '#991B1B' },
  INTERMEDIARY: { bg: '#D97706', border: '#B45309' },
  DESTINATION: { bg: '#7C3AED', border: '#5B21B6' }
};

export const graphStyles = [
  {
    selector: 'node',
    style: {
      'label': (node) => {
        const label = node.data('displayLabel') || node.data('id');
        const status = node.data('status');
        const icon = STATUS_STYLES[status]?.icon || '';
        return icon ? `${label} ${icon}` : label;
      },
      'background-color': (node) => {
        const type = node.data('account_type');
        if (TYPE_STYLES[type]) return TYPE_STYLES[type].bg;
        return STATUS_STYLES[node.data('status')]?.bg || STATUS_STYLES.active.bg;
      },
      'border-width': 2,
      'border-color': (node) => {
        const type = node.data('account_type');
        if (TYPE_STYLES[type]) return TYPE_STYLES[type].border;
        return STATUS_STYLES[node.data('status')]?.border || STATUS_STYLES.active.border;
      },
      'border-style': (node) => node.data('status') === 'withdrawn' ? 'dashed' : 'solid',
      'color': '#fff',
      'text-valign': 'center',
      'text-halign': 'center',
      'font-size': 12,
      'width': 64,
      'height': 64,
      'text-outline-width': 2,
      'text-outline-color': '#1e293b'
    }
  },
  {
    selector: 'edge',
    style: {
      'label': 'data(label)',
      'width': 2.5,
      'line-color': '#64748B',
      'target-arrow-color': '#64748B',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      'font-size': 9,
      'color': '#334155',
      'text-rotation': 'autorotate',
      'text-margin-y': -12,
      'text-background-color': '#F8FAFC',
      'text-background-opacity': 0.95,
      'text-background-padding': 3,
      'text-border-color': '#CBD5E1',
      'text-border-width': 1,
      'text-border-opacity': 0.8,
      'opacity': 0.85,
      'arrow-scale': 1.1,
      'transition-property': 'line-color, target-arrow-color, opacity, width',
      'transition-duration': '0.2s'
    }
  },
  {
    selector: 'edge.show-label',
    style: {
      'width': 3.5,
      'line-color': '#334155',
      'target-arrow-color': '#334155',
      'opacity': 1,
      'z-index': 30
    }
  },
  {
    selector: 'edge.path-highlight',
    style: {
      'width': 4.5,
      'line-color': '#F59E0B',
      'target-arrow-color': '#F59E0B',
      'opacity': 1.0,
      'z-index': 50,
      'text-background-color': '#FEF3C7',
      'text-border-color': '#F59E0B',
      'text-border-width': 1.5
    }
  },
  {
    selector: 'node.path-highlight',
    style: {
      'border-width': 5,
      'border-color': '#F59E0B',
      'z-index': 50
    }
  }
];

