const severityColor = {
  high: '#ef4444',
  medium: '#f97316',
  low: '#22c55e',
};

const badgeText = {
  high: 'เสี่ยงสูง',
  medium: 'เฝ้าระวัง',
  low: 'เหมาะสม'
};

export function buildFlexWeatherAdvice(advice) {
  if (!advice) return null;
  const severity = advice.overallSeverity || (advice.risks?.find?.((r) => r.severity === 'high') ? 'high' : advice.risks?.find?.((r) => r.severity === 'medium') ? 'medium' : 'low');
  const color = severityColor[severity] || '#0ea5e9';

  const riskContents = (advice.risks || []).slice(0, 4).map((risk) => ({
    type: 'box',
    layout: 'vertical',
    spacing: 'xs',
    contents: [
      {
        type: 'text',
        text: `${risk.tag === 'OK' ? '✅' : '•'} ${risk.reason}`,
        wrap: true,
        color: '#0f172a',
        size: 'sm',
      },
      {
        type: 'text',
        text: `ทีมหน้างาน: ${risk.actionsSite?.join(' / ') || '-'}`,
        wrap: true,
        color: '#475569',
        size: 'xs',
      },
      {
        type: 'text',
        text: `แพลนท์: ${risk.actionsPlant?.join(' / ') || '-'}`,
        wrap: true,
        color: '#475569',
        size: 'xs',
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
      backgroundColor: color,
      contents: [
        { type: 'text', text: 'สภาพอากาศ', color: '#ffffff', weight: 'bold', size: 'lg' },
        { type: 'text', text: badgeText[severity] || 'สรุป', color: '#e0f2fe', size: 'xs' },
        { type: 'text', text: advice.summary, color: '#ffffff', wrap: true, size: 'sm' }
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: riskContents.length ? riskContents : [{ type: 'text', text: 'ไม่มีความเสี่ยงสำคัญ', color: '#0f172a', wrap: true }],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: '#0ea5e9',
          action: { type: 'message', label: 'ขอสรุปตุนวัสดุ', text: 'แจ้งเตือนสต็อก' },
        }
      ],
    },
  };
}
