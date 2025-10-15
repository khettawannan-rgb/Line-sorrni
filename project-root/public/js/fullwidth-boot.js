/* fullwidth-boot.js – enable full-width layout helpers */
(() => {
  // 1) เปิดโหมดเต็มจอทั้งแอป
  document.body.classList.add('use-fullwidth');

  // 2) ช่วยเติมคลาสกริดให้ส่วนที่เป็นกราฟ/ตาราง หากยังไม่มี
  const selectors = [
    '.widgets', '.kpi-grid', '.dashboard-cards', '.card-grid',
    '.charts', '.tables', '.report-grid'
  ];
  const nodes = selectors.flatMap((sel) => Array.from(document.querySelectorAll(sel)));

  nodes.forEach((node) => {
    const cs = getComputedStyle(node);
    if (cs.display !== 'grid') {
      node.classList.add('grid-2');
    }
  });

  // 3) Force 3 columns on mid-sized desktops for better density
  const force3 = () => {
    const w = window.innerWidth;
    const should3 = w >= 1200 && w <= 1440;
    nodes.forEach((node) => {
      node.classList.toggle('grid-3', should3);
    });
  };

  force3();
  addEventListener('resize', force3);
})();
