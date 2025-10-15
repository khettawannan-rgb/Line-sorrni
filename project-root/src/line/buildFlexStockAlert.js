export function buildFlexStockAlert(alert) {
  if (!alert) return null;
  const items = alert.items || [];
  const contents = items.slice(0, 5).map((item) => ({
    type: 'box',
    layout: 'vertical',
    spacing: 'xs',
    contents: [
      {
        type: 'text',
        text: `${item.status === 'URGENT' ? '🔴' : item.status === 'LOW' ? '🟠' : '🟢'} ${item.itemName}`,
        weight: 'bold',
        color: '#0f172a',
        size: 'sm',
        wrap: true,
      },
      {
        type: 'text',
        text: `คงเหลือ ${item.currentQty} · DoS ${item.dos} วัน`,
        size: 'xs',
        color: '#475569',
        wrap: true,
      },
      {
        type: 'text',
        text: item.suggestion,
        size: 'xs',
        color: '#334155',
        wrap: true,
      },
      {
        type: 'button',
        action: { type: 'uri', label: 'เปิดใบ PO', uri: item.poLink },
        style: 'primary',
        color: '#10b981',
      },
    ],
  }));

  return {
    type: 'bubble',
    size: 'giga',
    header: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '16px',
      backgroundColor: '#0f172a',
      contents: [
        { type: 'text', text: 'Safety Stock Alert', color: '#ffffff', weight: 'bold', size: 'lg' },
        { type: 'text', text: alert.siteName || 'ไซต์งาน', color: '#cbd5f5', size: 'sm' }
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: contents.length ? contents : [{ type: 'text', text: 'ไม่มีรายการใกล้หมด', color: '#0f172a' }],
    },
  };
}
