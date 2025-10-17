// project-root/src/flex/gameMenu.js

export function buildGameMenuFlex(urls) {
  const ci = {
    primary: process.env.CI_PRIMARY || '#0ea5e9',
    text: process.env.CI_TEXT || '#0f172a',
    soft: process.env.CI_SOFT || '#eef2ff',
  };

  const header = {
    type: 'box',
    layout: 'vertical',
    contents: [
      { type: 'text', text: 'Mini Games', weight: 'bold', size: 'xl', color: ci.text },
      { type: 'text', text: 'เล่นครบชนะรับของรางวัล!', size: 'sm', color: ci.text, margin: 'sm' },
    ],
  };

  const button = (label, uri) => ({
    type: 'button',
    style: 'primary',
    color: ci.primary,
    height: 'sm',
    action: { type: 'uri', label, uri },
  });

  const body = {
    type: 'box',
    layout: 'vertical',
    spacing: 'md',
    backgroundColor: ci.soft,
    paddingAll: '16px',
    contents: [
      header,
      { type: 'separator', margin: 'lg' },
      { type: 'text', text: 'เลือกเกม', weight: 'bold', size: 'sm', color: ci.text, margin: 'md' },
      button('1) Road Builder Quiz', urls.quizUrl),
      button('2) Asphalt Runner', urls.runnerUrl),
      button('3) Guess the Road Sign', urls.signUrl),
    ],
  };

  return {
    type: 'flex',
    altText: 'เมนูมินิเกม',
    contents: { type: 'bubble', body },
  };
}

export default { buildGameMenuFlex };

