// project-root/src/flex/poStatus.js

function ci() {
  return {
    primary: process.env.CI_PRIMARY || '#0ea5e9',
    text: process.env.CI_TEXT || '#0f172a',
    soft: process.env.CI_SOFT || '#eef2ff',
    good: process.env.CI_ACCENT_GOOD || '#22c55e',
    warn: process.env.CI_ACCENT_WARN || '#f59e0b',
    gray: '#94a3b8',
  };
}

function statusBadge(s, c) {
  const map = {
    pending: { label: 'Pending', color: c.warn },
    approved: { label: 'Approved', color: c.primary },
    ordered: { label: 'Ordered', color: c.primary },
    shipped: { label: 'Shipped', color: c.primary },
    delivered: { label: 'Delivered', color: c.good },
    cancelled: { label: 'Cancelled', color: c.gray },
  };
  return map[s] || { label: s, color: c.gray };
}

export function buildPoStatusFlex(list = []) {
  const c = ci();
  const bubbles = [];

  const header = {
    type: 'bubble',
    body: {
      type: 'box', layout: 'vertical', backgroundColor: c.soft, paddingAll: '16px', contents: [
        { type: 'text', text: '📦 PO Status (Mock)', weight: 'bold', size: 'lg', color: c.text },
        { type: 'text', text: `รายการล่าสุด ${list.length} รายการ`, size: 'sm', color: '#64748b' },
      ] },
  };
  bubbles.push(header);

  (list || []).forEach((po) => {
    const badge = statusBadge(po.status, c);
    bubbles.push({
      type: 'bubble',
      body: { type: 'box', layout: 'vertical', backgroundColor: c.soft, paddingAll: '16px', contents: [
        { type: 'text', text: po.po_no, weight: 'bold', size: 'md', color: c.text },
        { type: 'text', text: po.vendor, size: 'sm', color: '#64748b' },
        { type: 'box', layout: 'horizontal', spacing: 'sm', margin: 'md', contents: [
          { type: 'text', text: 'Items', size: 'sm', color: '#64748b' },
          { type: 'text', text: String(po.item_count), size: 'sm', color: c.text, align: 'end' },
        ]},
        { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
          { type: 'text', text: 'Total', size: 'sm', color: '#64748b' },
          { type: 'text', text: `${po.total_thb.toLocaleString('th-TH')} บาท`, size: 'sm', color: c.text, align: 'end' },
        ]},
        { type: 'text', text: `อัปเดตล่าสุด: ${new Date(po.updated_at).toLocaleString('th-TH')}`, size: 'xs', color: '#64748b', margin: 'sm' },
        { type: 'box', layout: 'baseline', margin: 'md', contents: [
          { type: 'text', text: 'สถานะ', size: 'sm', color: '#64748b' },
          { type: 'text', text: badge.label, size: 'sm', weight: 'bold', color: badge.color, align: 'end', flex: 2 },
        ]},
      ] },
    });
  });

  return { type: 'flex', altText: 'PO Status', contents: { type: 'carousel', contents: bubbles.slice(0, 10) } };
}

export default { buildPoStatusFlex };

