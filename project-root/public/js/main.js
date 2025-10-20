const NAV_STORAGE_KEY = 'sorrni.drawer.openGroup';

const debounce = (fn, wait = 100) => {
  let timeout;
  return (...args) => {
    window.clearTimeout(timeout);
    timeout = window.setTimeout(() => fn.apply(null, args), wait);
  };
};

document.addEventListener('DOMContentLoaded', () => {
  setupTopbarHeight();
  setupNavigationHighlight();
  setupTopNavMenus();
  setupDrawer();
  setupDrawerGroups();
  setupConfirmPrompts();
  setupFilterToggle();
  initChartResizeObserver();
  initDonutCharts();
  initLocationsTable();
  initUploadExperience();
  initDailyLineChart();
  initCustomerInsightCharts();
  initProcurementDialogs();
  initDynamicItemRows();
  initMockAnalyticsControls();
  initCollapsiblePanels();
  initDashboardAnchors();
  initMockDailySummaryControls();
  initLiveSelectSearch();
  initLiveTableSearch();
  initCodeToggles();
});

window.addEventListener('resize', debounce(setupTopbarHeight, 150));

function setupTopbarHeight() {
  const topbar = document.querySelector('.topbar');
  const height = topbar ? topbar.offsetHeight : 0;
  if (height) {
    document.documentElement.style.setProperty('--topbar-h', `${height}px`);
  }
}

function setupNavigationHighlight() {
  const currentPath = location.pathname.replace(/\/+$/, '') || '/admin';
  const topnavLinks = document.querySelectorAll('.topnav a[href]');
  const drawerLinks = document.querySelectorAll('.drawer-group__list a[href]');

  const isMatch = (href) => {
    if (!href) return false;
    const normalized = href.replace(/\/+$/, '');
    if (normalized === currentPath) return true;
    if (normalized.startsWith('/admin/tools') && currentPath.startsWith('/admin/tools')) return true;
    return false;
  };

  topnavLinks.forEach((link) => {
    if (isMatch(link.getAttribute('href'))) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
      const group = link.closest('.topnav-group');
      if (group) group.classList.add('active');
    }
  });

  drawerLinks.forEach((link) => {
    if (isMatch(link.getAttribute('href'))) {
      link.classList.add('is-active');
      link.setAttribute('aria-current', 'page');
      const group = link.closest('[data-drawer-group]');
      if (group) {
        openDrawerGroup(group, false);
      }
    }
  });
}

function initDashboardAnchors() {
  const links = document.querySelectorAll('[data-scroll-group]');
  if (!links.length) return;

  const groups = new Map();

  links.forEach((link) => {
    const group = link.getAttribute('data-scroll-group');
    if (!group) return;

    if (!groups.has(group)) {
      groups.set(group, []);
    }
    groups.get(group).push(link);

    link.addEventListener('click', () => {
      const siblings = groups.get(group) || [];
      siblings.forEach((item) => {
        item.classList.remove('is-active');
        item.removeAttribute('aria-current');
      });
      link.classList.add('is-active');
      link.setAttribute('aria-current', 'true');
    });
  });
}

function setupTopNavMenus() {
  const menus = document.querySelectorAll('[data-topnav-menu]');
  if (!menus.length) return;

  const closeAll = (except) => {
    menus.forEach((menu) => {
      if (menu === except) return;
      const trigger = menu.querySelector('[data-menu-trigger]');
      const list = menu.querySelector('[data-menu-list]');
      menu.classList.remove('is-open');
      trigger?.setAttribute('aria-expanded', 'false');
      if (list) list.setAttribute('hidden', '');
    });
  };

  menus.forEach((menu) => {
    const trigger = menu.querySelector('[data-menu-trigger]');
    const list = menu.querySelector('[data-menu-list]');
    if (!trigger || !list) return;

    let hoverTimeout = null;

    const setOpen = (open) => {
      window.clearTimeout(hoverTimeout);
      if (open) {
        menu.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
        list.removeAttribute('hidden');
        closeAll(menu);
      } else {
        menu.classList.remove('is-open');
        if (!menu.classList.contains('is-active')) {
          trigger.setAttribute('aria-expanded', 'false');
        }
        list.setAttribute('hidden', '');
      }
    };

    const isPointerFine = window.matchMedia('(pointer: fine)').matches;

    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      const open = menu.classList.contains('is-open');
      setOpen(!open);
    });

    if (isPointerFine) {
      menu.addEventListener('mouseenter', () => {
        window.clearTimeout(hoverTimeout);
        setOpen(true);
      });
      menu.addEventListener('mouseleave', () => {
        hoverTimeout = window.setTimeout(() => setOpen(false), 150);
      });
      list.addEventListener('mouseenter', () => window.clearTimeout(hoverTimeout));
      list.addEventListener('mouseleave', () => {
        hoverTimeout = window.setTimeout(() => setOpen(false), 150);
      });
    }
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('[data-topnav-menu]')) {
      closeAll();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeAll();
    }
  });
}

function setupDrawer() {
  const drawer = document.querySelector('[data-nav-drawer]');
  const toggles = document.querySelectorAll('[data-nav-toggle]');
  const closeBtn = drawer?.querySelector('[data-drawer-close]');
  const backdrop = document.querySelector('[data-drawer-backdrop]');
  if (!drawer || !toggles.length) return;

  const focusableSelector = 'a[href]:not([tabindex="-1"]), button:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])';
  let lastFocused = null;

  const setDrawerState = (isOpen) => {
    drawer.setAttribute('data-open', String(isOpen));
    drawer.setAttribute('aria-hidden', String(!isOpen));
    document.body.classList.toggle('is-drawer-open', isOpen);
    toggles.forEach((btn) => btn.setAttribute('aria-expanded', String(isOpen)));
    if (!isOpen && lastFocused) {
      requestAnimationFrame(() => lastFocused.focus());
    }
    if (isOpen) {
      const focusables = drawer.querySelectorAll(focusableSelector);
      const first = focusables[0];
      if (first) first.focus();
    }
  };

  const openDrawer = () => {
    if (drawer.getAttribute('data-open') === 'true') return;
    lastFocused = document.activeElement;
    setDrawerState(true);
  };

  const closeDrawer = () => {
    if (drawer.getAttribute('data-open') !== 'true') return;
    setDrawerState(false);
  };

  toggles.forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      const open = drawer.getAttribute('data-open') === 'true';
      if (open) {
        closeDrawer();
      } else {
        openDrawer();
      }
    });
  });

  closeBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    closeDrawer();
  });

  backdrop?.addEventListener('click', closeDrawer);

  drawer.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeDrawer();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusables = drawer.querySelectorAll(focusableSelector);
    if (!focusables.length) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && drawer.getAttribute('data-open') === 'true') {
      closeDrawer();
    }
  });

  drawer.querySelectorAll('a[href]').forEach((link) => {
    link.addEventListener('click', () => closeDrawer());
  });
}

function setupDrawerGroups() {
  const groups = document.querySelectorAll('[data-drawer-group]');
  if (!groups.length) return;

  let stored = null;
  try {
    stored = localStorage.getItem(NAV_STORAGE_KEY);
  } catch (err) {
    stored = null;
  }

  const alreadyExpanded = Array.from(groups).some((group) => {
    const toggle = group.querySelector('.drawer-group__toggle');
    return toggle?.getAttribute('aria-expanded') === 'true';
  });

  groups.forEach((group, index) => {
    const toggle = group.querySelector('.drawer-group__toggle');
    if (!toggle) return;

    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      if (expanded) {
        closeDrawerGroup(group);
        try {
          localStorage.removeItem(NAV_STORAGE_KEY);
        } catch (err) {
          /* no-op */
        }
      } else {
        groups.forEach((other) => {
          if (other !== group) closeDrawerGroup(other);
        });
        openDrawerGroup(group, true);
      }
    });

    if ((stored && stored === group.dataset.groupKey) || (!stored && !alreadyExpanded && index === 0)) {
      openDrawerGroup(group, false);
    }
  });
}

function openDrawerGroup(group, persist) {
  const toggle = group.querySelector('.drawer-group__toggle');
  const list = group.querySelector('.drawer-group__list');
  if (!toggle || !list) return;
  toggle.setAttribute('aria-expanded', 'true');
  list.hidden = false;
  if (persist) {
    try {
      localStorage.setItem(NAV_STORAGE_KEY, group.dataset.groupKey || '');
    } catch (err) {
      /* ignore */
    }
  }
}

function closeDrawerGroup(group) {
  const toggle = group.querySelector('.drawer-group__toggle');
  const list = group.querySelector('.drawer-group__list');
  if (!toggle || !list) return;
  toggle.setAttribute('aria-expanded', 'false');
  list.hidden = true;
}

function setupConfirmPrompts() {
  document.querySelectorAll('[data-confirm]').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      if (!confirm(btn.getAttribute('data-confirm'))) {
        event.preventDefault();
      }
    });
  });
}

function setupFilterToggle() {
  const filterToggle = document.querySelector('[data-filter-toggle]');
  const filterSection = document.querySelector('[data-filter-section]');
  const filterWrapper = document.querySelector('[data-filter-wrapper]');
  const insightRoot = document.querySelector('[data-behavior-root]');

  if (insightRoot && !insightRoot.dataset.filters) {
    insightRoot.dataset.filters = 'expanded';
  }

  if (filterToggle && filterSection) {
    filterToggle.addEventListener('click', () => {
      const collapsed = filterSection.classList.toggle('is-collapsed');
      filterToggle.setAttribute('aria-expanded', String(!collapsed));
      filterToggle.textContent = collapsed ? 'แสดงฟิลเตอร์' : 'ซ่อนฟิลเตอร์';
      if (filterWrapper) {
        filterWrapper.classList.toggle('is-collapsed', collapsed);
      }
      if (insightRoot) {
        insightRoot.dataset.filters = collapsed ? 'collapsed' : 'expanded';
      }
    });
  }
}

function initChartResizeObserver() {
  if (typeof ResizeObserver === 'undefined') return;
  const areas = document.querySelectorAll('.chart-card__body');
  if (!areas.length) return;

  const triggerResize = debounce(() => {
    window.dispatchEvent(new Event('resize'));
  }, 100);

  const observer = new ResizeObserver(() => triggerResize());
  areas.forEach((area) => observer.observe(area));
}

function initDonutCharts() {
  if (typeof Chart === 'undefined') return;

  const palette = [
    '#6366f1',
    '#ec4899',
    '#10b981',
    '#f97316',
    '#38bdf8',
    '#a855f7',
    '#facc15',
    '#0ea5e9',
  ];

  document.querySelectorAll('.donut-wrap[data-chart="product"]').forEach((wrap) => {
    const raw = wrap.dataset.chartPayload || '[]';
    let payload = [];
    try {
      payload = JSON.parse(raw);
    } catch (err) {
      console.warn('[DASHBOARD] product chart JSON parse error', err);
      payload = [];
    }

    const dataset = Array.isArray(payload)
      ? payload.filter((item) => Number(item?.totalTons || 0) > 0)
      : [];
    if (!dataset.length) return;

    const labels = dataset.map((item) => item.product || 'ไม่ระบุ');
    const data = dataset.map((item) => Number(item.totalTons || 0));
    const colors = dataset.map((_, idx) => palette[idx % palette.length]);

    const ctx = wrap.querySelector('canvas');
    if (!ctx) return;

    const tooltipEl = getOrCreateDonutTooltip(wrap);

    new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: colors,
            borderWidth: 4,
            borderColor: '#f8fafc',
            hoverOffset: 6,
            spacing: 2,
            cutout: '72%',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: false,
            external: (ctx) => renderDonutTooltip(ctx, tooltipEl),
          },
        },
      },
    });

    const legendDots = wrap.closest('.donut-layout')?.querySelectorAll('.donut-legend__dot[data-color-index]') || [];
    legendDots.forEach((dot) => {
      const idx = Number(dot.dataset.colorIndex || 0);
      const color = colors[idx % colors.length];
      dot.style.backgroundColor = color;
    });
  });
}

function initLocationsTable() {
  const table = document.querySelector('.locations-table tbody');
  const frame = document.querySelector('#location-preview');
  if (!table || !frame) return;

  table.querySelectorAll('tr[data-lat]').forEach((row) => {
    row.addEventListener('click', () => {
      const lat = row.dataset.lat;
      const lng = row.dataset.lng;
      if (lat && lng) {
        frame.src = `https://www.google.com/maps?q=${lat},${lng}&z=15&output=embed`;
      }
      table.querySelectorAll('tr.active').forEach((el) => el.classList.remove('active'));
      row.classList.add('active');
    });
  });
}

function getOrCreateDonutTooltip(wrap) {
  let el = wrap.querySelector('.donut-tooltip');
  if (!el) {
    el = document.createElement('div');
    el.className = 'donut-tooltip hidden';
    wrap.appendChild(el);
  }
  return el;
}

function renderDonutTooltip(context, tooltipEl) {
  const tooltipModel = context.tooltip;
  if (!tooltipModel || tooltipModel.opacity === 0) {
    tooltipEl.classList.add('hidden');
    return;
  }

  const dataPoint = tooltipModel.dataPoints && tooltipModel.dataPoints[0];
  if (!dataPoint) {
    tooltipEl.classList.add('hidden');
    return;
  }

  const value = dataPoint.parsed || 0;
  const total = dataPoint.dataset.data.reduce((sum, v) => sum + v, 0) || 1;
  const percent = ((value / total) * 100).toFixed(2);

  tooltipEl.innerHTML = `
    <strong>${dataPoint.label || '-'}</strong>
    <span>${value.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ตัน (${percent}%)</span>
  `;
  tooltipEl.classList.remove('hidden');
}

function initUploadExperience() {
  const form = document.querySelector('[data-upload-form]');
  const dropzone = document.querySelector('[data-upload-dropzone]');
  const input = document.querySelector('[data-upload-input]');
  const triggers = document.querySelectorAll('[data-upload-trigger]');
  const queue = document.querySelector('[data-upload-queue]');
  const emptyState = queue?.querySelector('[data-upload-empty]');
  const summary = document.querySelector('#upload-summary');
  const clearToggle = document.querySelector('[data-upload-clear]');

  if (!dropzone || !input || !queue) return;

  if (form) {
    form.addEventListener('submit', (event) => {
      if (!form.dataset.forceSubmit) {
        event.preventDefault();
      }
    });
  }

  const uploads = new Map();

  const setEmptyState = () => {
    const active = queue.querySelectorAll('.upload-item').length === 0;
    if (emptyState) emptyState.style.display = active ? '' : 'none';
  };
  setEmptyState();

  const handleFiles = (fileList) => {
    if (!fileList || !fileList.length) return;
    const files = Array.from(fileList).filter((file) => /\.xl[stx]{1,2}$/i.test(file.name));
    if (!files.length) {
      alert('กรุณาเลือกไฟล์ Excel (.xlsx หรือ .xls)');
      return;
    }
    files.forEach((file) => queueUpload(file));
    input.value = '';
  };

  triggers.forEach((btn) => btn.addEventListener('click', () => input.click()));
  dropzone.addEventListener('click', () => input.click());
  dropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.classList.add('is-dragover');
  });
  ['dragleave', 'dragend'].forEach((evt) => {
    dropzone.addEventListener(evt, () => dropzone.classList.remove('is-dragover'));
  });
  dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropzone.classList.remove('is-dragover');
    handleFiles(event.dataTransfer.files);
  });
  input.addEventListener('change', () => handleFiles(input.files));

  const queueUpload = (file) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const item = document.createElement('div');
    item.className = 'upload-item';
    item.dataset.uploadId = id;
    item.innerHTML = `
      <div class="upload-item__icon">📦</div>
      <div class="upload-item__body">
        <div class="upload-item__title">${file.name}<small>${formatBytes(file.size)}</small></div>
        <div class="upload-progress"><div class="upload-progress__bar" data-progress></div></div>
        <div class="upload-item__meta">
          <span class="upload-item__status" data-status>กำลังเตรียมอัปโหลด…</span>
          <span data-percent>0%</span>
        </div>
      </div>
      <div class="upload-item__actions">
        <button type="button" data-action="retry" hidden>ลองใหม่</button>
        <button type="button" data-action="remove">ลบ</button>
      </div>
    `;
    queue.appendChild(item);
    setEmptyState();

    const controls = {
      el: item,
      file,
      progressBar: item.querySelector('[data-progress]'),
      statusEl: item.querySelector('[data-status]'),
      percentEl: item.querySelector('[data-percent]'),
      retryBtn: item.querySelector('[data-action="retry"]'),
      removeBtn: item.querySelector('[data-action="remove"]'),
    };
    uploads.set(id, controls);

    controls.removeBtn.addEventListener('click', () => {
      uploads.delete(id);
      item.remove();
      setEmptyState();
    });

    controls.retryBtn.addEventListener('click', () => {
      controls.retryBtn.hidden = true;
      item.classList.remove('is-error');
      controls.statusEl.textContent = 'กำลังเตรียมอัปโหลด…';
      controls.percentEl.textContent = '0%';
      controls.progressBar.style.width = '0%';
      uploadFile(id, controls);
    });

    uploadFile(id, controls);
  };

  const uploadFile = (id, controls) => {
    const formData = new FormData();
    formData.append('file', controls.file);
    if (clearToggle?.checked) {
      formData.append('clearExisting', 'on');
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/admin/upload', true);
    xhr.responseType = 'json';
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

    xhr.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.round((event.loaded / event.total) * 100);
      controls.progressBar.style.width = `${percent}%`;
      controls.percentEl.textContent = `${percent}%`;
      controls.statusEl.textContent = percent >= 100 ? 'กำลังประมวลผล…' : 'กำลังอัปโหลด…';
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300 && xhr.response?.ok) {
        controls.progressBar.style.width = '100%';
        controls.percentEl.textContent = '100%';
        controls.statusEl.textContent = 'อัปโหลดสำเร็จ';
        controls.el.classList.add('is-success');
        controls.removeBtn.hidden = false;
        updateUploadSummary(xhr.response.html || '');
      } else {
        handleFailure(xhr.response?.error || 'อัปโหลดไม่สำเร็จ');
      }
    });

    xhr.addEventListener('error', () => {
      handleFailure('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    });

    xhr.send(formData);

    function handleFailure(message) {
      controls.el.classList.add('is-error');
      controls.statusEl.textContent = message;
      controls.retryBtn.hidden = false;
      controls.percentEl.textContent = '0%';
      controls.progressBar.style.width = '100%';
    }
  };

  const updateUploadSummary = (html) => {
    if (!summary) return;
    if (!html) {
      summary.innerHTML = '';
      return;
    }
    summary.innerHTML = html;
  };
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, idx);
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function initDailyLineChart() {
  if (typeof Chart === 'undefined') return;
  const card = document.querySelector('.line-card[data-chart="daily-lines"]');
  if (!card) return;

  let series = [];
  try {
    series = JSON.parse(card.dataset.chartPayload || '[]');
  } catch (err) {
    console.warn('[DASHBOARD] daily lines parse error', err);
    series = [];
  }
  if (!Array.isArray(series) || !series.length) return;

  series = series
    .filter((row) => row && row.date)
    .sort((a, b) => (a.date > b.date ? 1 : -1));
  if (!series.length) return;

  const labels = series.map((row) => row.date);
  const buyData = series.map((row) => Number(row.buyTons || 0));
  const sellData = series.map((row) => Number(row.sellTons || 0));

  const canvas = card.querySelector('canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const buildGradient = (colors) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, colors[0]);
    gradient.addColorStop(1, colors[1]);
    return gradient;
  };

  new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'BUY',
          data: buyData,
          tension: 0.45,
          borderWidth: 3,
          borderColor: '#6366f1',
          pointBackgroundColor: '#6366f1',
          backgroundColor: buildGradient(['rgba(99,102,241,0.35)', 'rgba(99,102,241,0)']),
          fill: true,
        },
        {
          label: 'SELL',
          data: sellData,
          tension: 0.45,
          borderWidth: 3,
          borderColor: '#f97316',
          pointBackgroundColor: '#f97316',
          backgroundColor: buildGradient(['rgba(249,115,22,0.3)', 'rgba(249,115,22,0)']),
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          labels: {
            boxWidth: 12,
            usePointStyle: true,
            color: '#475569',
          },
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const value = context.parsed.y || 0;
              return `${context.dataset.label}: ${value.toLocaleString('th-TH', { maximumFractionDigits: 2 })} ตัน`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#64748b' },
        },
        y: {
          grid: { color: 'rgba(148, 163, 184, 0.2)', drawBorder: false },
          ticks: {
            color: '#94a3b8',
            callback: (value) => value.toLocaleString('th-TH', { maximumFractionDigits: 0 }),
          },
        },
      },
    },
  });
}

function initCustomerInsightCharts() {
  if (typeof Chart === 'undefined') return;

  Chart.defaults.font.family =
    "'IBM Plex Sans Thai', 'Noto Sans Thai', 'Prompt', ui-sans-serif, system-ui";
  Chart.defaults.font.size = 12;
  Chart.defaults.color = '#475569';
  Chart.defaults.plugins.legend.labels.font = { size: 11, family: Chart.defaults.font.family };
  Chart.defaults.plugins.tooltip.titleFont = { size: 11, family: Chart.defaults.font.family };
  Chart.defaults.plugins.tooltip.bodyFont = { size: 11, family: Chart.defaults.font.family };

  const parseDataset = (el, attr, fallback) => {
    try {
      const raw = el.getAttribute(attr);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (err) {
      console.warn('[DASHBOARD] insight dataset parse error', attr, err);
      return fallback;
    }
  };

  const markReady = (canvas) => {
    if (!canvas) return;
    const frame = canvas.closest('.chart-frame');
    if (frame) frame.classList.add('chart-ready');
  };

  const trendCard = document.querySelector('.insight-chart[data-chart-trend]');
  if (trendCard) {
    const payload = parseDataset(trendCard, 'data-chart-trend', []);
    if (Array.isArray(payload) && payload.length) {
      const ctx = trendCard.querySelector('#chat-trend-chart')?.getContext('2d');
      if (ctx) {
        const labels = payload.map((row) => {
          const iso = typeof row.date === 'string' ? row.date : '';
          const date = iso ? new Date(`${iso}T00:00:00+07:00`) : null;
          return date
            ? date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
            : row.date || '';
        });
        const messageSeries = payload.map((row) => Number(row.messageCount || 0));
        const userSeries = payload.map((row) => Number(row.uniqueUsers || 0));

        new Chart(ctx, {
          type: 'line',
          data: {
            labels,
            datasets: [
              {
                label: 'ข้อความ',
                data: messageSeries,
                borderColor: '#4f46e5',
                borderWidth: 2,
                tension: 0.3,
                fill: false,
                pointRadius: 2,
                yAxisID: 'y',
              },
              {
                label: 'ผู้ใช้',
                data: userSeries,
                borderColor: '#ec4899',
                borderWidth: 2,
                tension: 0.3,
                fill: false,
                pointRadius: 2,
                yAxisID: 'y1',
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: {
                labels: { usePointStyle: true, color: '#475569' },
              },
              tooltip: {
                mode: 'index',
                intersect: false,
              },
            },
            scales: {
              y: {
                position: 'left',
                beginAtZero: true,
                ticks: { color: '#1f2937' },
              },
              y1: {
                position: 'right',
                beginAtZero: true,
                grid: { drawOnChartArea: false },
                ticks: { color: '#1f2937' },
              },
              x: {
                ticks: { color: '#475569' },
                grid: { display: false },
              },
            },
          },
        });
        markReady(ctx.canvas);
      }
    }
  }

  const consentCard = document.querySelector('.insight-chart[data-consent-status]');
  if (consentCard) {
    const payload = parseDataset(consentCard, 'data-consent-status', {});
    const entries = Object.entries(payload)
      .filter(([key]) => key !== 'total')
      .map(([key, value]) => [key, Number(value || 0)]);
    if (entries.length) {
      const ctx = consentCard.querySelector('#consent-status-chart')?.getContext('2d');
      if (ctx) {
        const labels = entries.map(([key]) => key);
        const data = entries.map(([, value]) => value);
        const colorMap = {
          granted: '#22c55e',
          pending: '#f97316',
          revoked: '#ef4444',
          rejected: '#ef4444',
          none: '#94a3b8',
        };
        const colors = labels.map((label) => colorMap[label] || '#94a3b8');

        new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels,
            datasets: [
              {
                data,
                backgroundColor: colors,
                borderColor: '#ffffff',
                borderWidth: 4,
                hoverOffset: 6,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'bottom',
                labels: { usePointStyle: true, color: '#475569' },
              },
            },
          },
        });
        markReady(ctx.canvas);
      }
    }
  }

  const topicCard = document.querySelector('.insight-chart[data-topic-payload]');
  if (topicCard) {
    const payload = parseDataset(topicCard, 'data-topic-payload', []);
    if (Array.isArray(payload) && payload.length) {
      const ctx = topicCard.querySelector('#topic-bar-chart')?.getContext('2d');
      if (ctx) {
        const labels = payload.map((row) => row.label || row.key || '-');
        const data = payload.map((row) => Number(row.count || 0));
        const palette = ['#6366f1', '#ec4899', '#f97316', '#10b981', '#38bdf8'];
        const colors = labels.map((_, idx) => palette[idx % palette.length]);

        new Chart(ctx, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              {
                label: 'ข้อความ',
                data,
                backgroundColor: colors,
                borderRadius: 10,
                maxBarThickness: 38,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
            },
            scales: {
              x: {
                ticks: { color: '#475569' },
                grid: { display: false },
              },
              y: {
                beginAtZero: true,
                ticks: { color: '#475569', precision: 0 },
                grid: { color: 'rgba(148,163,184,0.25)' },
              },
            },
          },
        });
        markReady(ctx.canvas);
      }
    }
  }

  const heatmapCard = document.querySelector('.insight-chart[data-heatmap]');
  if (heatmapCard) {
    const payload = parseDataset(heatmapCard, 'data-heatmap', []);
    if (Array.isArray(payload) && payload.length) {
      const ctx = heatmapCard.querySelector('#chat-heatmap-chart')?.getContext('2d');
      if (ctx) {
        const dayLabels = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
        const maxVolume = payload.reduce(
          (max, row) => Math.max(max, Number(row.volume ?? row.count ?? row.value ?? 0)),
          1,
        );
        const bubbleData = payload.map((row) => {
          const rawVolume = Number(row.volume ?? row.count ?? row.value ?? 0);
          const dow = Number(row.dow ?? row.day ?? row.weekday ?? 0);
          const hour = Number(row.hour ?? row.h ?? row.timeslot ?? 0);
          const label = dayLabels[dow] || `D${dow}`;
          return {
            x: label,
            y: hour,
            r: Math.max(5, (rawVolume / maxVolume) * 18),
            volume: rawVolume,
          };
        });

        new Chart(ctx, {
          type: 'bubble',
          data: {
            datasets: [
              {
                label: 'ปริมาณข้อความ',
                data: bubbleData,
                backgroundColor: 'rgba(99,102,241,0.68)',
                borderColor: 'rgba(99,102,241,0.9)',
                borderWidth: 1,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (context) => {
                    const label = context.raw.x;
                    const hour = context.raw.y;
                    const volume = context.raw.volume || 0;
                    return `${label} ${hour}:00 · ${volume.toLocaleString('th-TH')} ข้อความ`;
                  },
                },
              },
            },
            scales: {
              x: {
                type: 'category',
                labels: dayLabels,
                grid: { display: false },
                ticks: { color: '#475569' },
              },
              y: {
                beginAtZero: false,
                ticks: { color: '#475569', stepSize: 2 },
                grid: { color: 'rgba(148,163,184,0.25)' },
                title: { display: true, text: 'ชั่วโมง', color: '#475569' },
              },
            },
          },
        });
        markReady(ctx.canvas);
      }
    }
  }

  const sentimentCard = document.querySelector('.insight-chart[data-sentiment]');
  if (sentimentCard) {
    const payload = parseDataset(sentimentCard, 'data-sentiment', []);
    if (Array.isArray(payload) && payload.length) {
      const pieCtx = sentimentCard.querySelector('#sentiment-pie-chart')?.getContext('2d');
      const totals = payload.reduce(
        (acc, row) => {
          acc.positive += Number(row.positive ?? row.pos ?? 0);
          acc.neutral += Number(row.neutral ?? row.neu ?? 0);
          acc.negative += Number(row.negative ?? row.neg ?? 0);
          return acc;
        },
        { positive: 0, neutral: 0, negative: 0 },
      );

      if (pieCtx) {
        new Chart(pieCtx, {
          type: 'doughnut',
          data: {
            labels: ['Positive', 'Neutral', 'Negative'],
            datasets: [
              {
                data: [totals.positive, totals.neutral, totals.negative],
                backgroundColor: ['#22c55e', '#94a3b8', '#ef4444'],
                borderColor: '#ffffff',
                borderWidth: 4,
                hoverOffset: 6,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
            },
          },
        });
        markReady(pieCtx.canvas);
      }

      // mini trend removed to simplify layout
    }
  }

  const intentStackCard = document.querySelector('.insight-chart[data-intent-stack]');
  if (intentStackCard) {
    const payload = parseDataset(intentStackCard, 'data-intent-stack', []);
    if (Array.isArray(payload) && payload.length) {
      const ctx = intentStackCard.querySelector('#intent-stack-chart')?.getContext('2d');
      if (ctx) {
        const weeks = Array.from(
          new Set(payload.map((row) => row.week || row.period || row.label || 'Unknown')),
        );
        const categories = Array.from(
          new Set(payload.map((row) => row.category || row.intent || 'อื่น ๆ')),
        );
        const palette = ['#6366f1', '#ec4899', '#f97316', '#10b981', '#38bdf8', '#facc15', '#8b5cf6'];
        const datasets = categories.map((category, idx) => ({
          label: category,
          data: weeks.map((week) => {
            return payload
              .filter((row) =>
                (row.week || row.period || row.label || 'Unknown') === week &&
                (row.category || row.intent || 'อื่น ๆ') === category,
              )
              .reduce((sum, row) => sum + Number(row.count ?? row.volume ?? 0), 0);
          }),
          backgroundColor: palette[idx % palette.length],
          stack: 'intent',
        }));

        new Chart(ctx, {
          type: 'bar',
          data: { labels: weeks, datasets },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: {
                stacked: true,
                ticks: { color: '#475569' },
                grid: { display: false },
              },
              y: {
                stacked: true,
                beginAtZero: true,
                ticks: { color: '#475569' },
                grid: { color: 'rgba(148,163,184,0.25)' },
              },
            },
            plugins: {
              legend: {
                position: 'bottom',
                labels: { usePointStyle: true, color: '#475569' },
              },
            },
          },
        });
        markReady(ctx.canvas);
      }
    }
  }

  const funnelCard = document.querySelector('.funnel-card[data-funnel]');
  if (funnelCard) {
    const payload = parseDataset(funnelCard, 'data-funnel', []);
    if (Array.isArray(payload) && payload.length) {
      const ctx = funnelCard.querySelector('#conversion-funnel-chart')?.getContext('2d');
      if (ctx) {
        const stageOrder = ['Inquiry', 'Quote', 'PurchaseOrder', 'Payment', 'Delivered'];
        const stageLabelMap = {
          Inquiry: 'Inquiry',
          Quote: 'Quote',
          PurchaseOrder: 'PO',
          Payment: 'Payment',
          Delivered: 'Delivered',
        };
        const stageTotals = stageOrder.map((stage) =>
          payload
            .filter((row) => (row.stage || row.status || '').toLowerCase() === stage.toLowerCase())
            .reduce((sum, row) => sum + Number(row.count ?? row.value ?? 0), 0),
        );

        new Chart(ctx, {
          type: 'bar',
          data: {
            labels: stageOrder.map((stage) => stageLabelMap[stage] || stage),
            datasets: [
              {
                label: 'จำนวนรายการ',
                data: stageTotals,
                backgroundColor: '#6366f1',
                borderRadius: 12,
              },
            ],
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: {
                beginAtZero: true,
                ticks: { color: '#475569' },
                grid: { color: 'rgba(148,163,184,0.2)' },
              },
              y: {
                ticks: { color: '#475569' },
                grid: { display: false },
              },
            },
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (context) => `${context.raw.toLocaleString('th-TH')} รายการ`,
                },
              },
            },
          },
        });
        markReady(ctx.canvas);
      }
    }
  }

  const agentResponseCard = document.querySelector('.insight-chart[data-agent-response]');
  if (agentResponseCard) {
    const payload = parseDataset(agentResponseCard, 'data-agent-response', []);
    if (Array.isArray(payload) && payload.length) {
      const ctx = agentResponseCard.querySelector('#agent-response-chart')?.getContext('2d');
      if (ctx) {
        const labels = payload.map((row) => row.name || row.agent_id || '-');
        const avg = payload.map((row) => Number(row.avgFirstReplySec ?? row.avg ?? 0));
        const median = payload.map((row) => Number(row.medianFirstReplySec ?? row.median ?? 0));
        const sla = payload.map((row) => Number(row.slaPct ?? row.sla ?? 0) * 100);
        const palette = ['#6366f1', '#ec4899'];

        new Chart(ctx, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              {
                label: 'Avg (วินาที)',
                data: avg,
                backgroundColor: palette[0],
                borderRadius: 10,
                maxBarThickness: 18,
              },
              {
                label: 'Median (วินาที)',
                data: median,
                backgroundColor: palette[1],
                borderRadius: 10,
                maxBarThickness: 18,
              },
              {
                type: 'line',
                label: 'SLA%',
                data: sla,
                yAxisID: 'y1',
                borderColor: '#f59e0b',
                backgroundColor: '#f59e0b',
                tension: 0.2,
                pointRadius: 4,
                fill: false,
              },
            ],
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: {
                ticks: { color: '#475569' },
                grid: { color: 'rgba(148,163,184,0.2)' },
              },
              y: {
                ticks: { color: '#475569' },
                grid: { display: false },
              },
              y1: {
                position: 'right',
                beginAtZero: true,
                max: 100,
                ticks: { color: '#f59e0b', callback: (value) => `${value}%` },
                grid: { drawOnChartArea: false },
              },
            },
            plugins: {
              legend: {
                position: 'bottom',
                labels: { usePointStyle: true, color: '#475569' },
              },
              tooltip: {
                callbacks: {
                  label: (context) => {
                    if (context.dataset.label.includes('SLA')) {
                      return `${context.parsed.y.toFixed(1)}% SLA`;
                    }
                    return `${context.dataset.label}: ${context.parsed.x.toLocaleString('th-TH')} วินาที`;
                  },
                },
              },
            },
          },
        });
        markReady(ctx.canvas);
      }
    }
  }

  const retentionCard = document.querySelector('.insight-chart[data-retention]');
  if (retentionCard) {
    const payload = parseDataset(retentionCard, 'data-retention', []);
    if (Array.isArray(payload) && payload.length) {
      const ctx = retentionCard.querySelector('#retention-cohort-chart')?.getContext('2d');
      if (ctx) {
        const offsets = Array.from(new Set(payload.map((row) => Number(row.weekOffset ?? row.offset ?? 0)))).sort((a, b) => a - b);
        const cohorts = Array.from(new Set(payload.map((row) => row.cohort || row.week || row.label || 'Cohort')));
        const palette = ['#6366f1', '#ec4899', '#10b981', '#f97316', '#38bdf8', '#8b5cf6', '#facc15'];
        const datasets = cohorts.map((cohort, idx) => ({
          label: cohort,
          data: offsets.map((offset) => {
            const match = payload.find(
              (row) =>
                (row.cohort || row.week || row.label || 'Cohort') === cohort &&
                Number(row.weekOffset ?? row.offset ?? 0) === offset,
            );
            return match ? Number(match.rate ?? match.returningRate ?? 0) : null;
          }),
          borderColor: palette[idx % palette.length],
          backgroundColor: 'transparent',
          fill: false,
          tension: 0.3,
          pointRadius: 3,
          spanGaps: true,
        }));

        new Chart(ctx, {
          type: 'line',
          data: { labels: offsets.map((off) => `สัปดาห์ ${off}`), datasets },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: {
                beginAtZero: true,
                suggestedMax: 1,
                ticks: {
                  color: '#475569',
                  callback: (value) => `${(value * 100).toFixed(0)}%`,
                },
                grid: { color: 'rgba(148,163,184,0.25)' },
              },
              x: {
                ticks: { color: '#475569' },
                grid: { display: false },
              },
            },
            plugins: {
              legend: {
                position: 'bottom',
                labels: { usePointStyle: true, color: '#475569' },
              },
              tooltip: {
                callbacks: {
                  label: (context) => `${(context.parsed.y * 100).toFixed(1)}% กลับมาใช้งาน`,
                },
              },
            },
          },
        });
        markReady(ctx.canvas);
      }
    }
  }

  const keywordHost = document.getElementById('keyword-cloud');
  if (keywordHost) {
    const payload = parseDataset(keywordHost, 'data-keyword-cloud', []);
    if (Array.isArray(payload) && payload.length) {
      const maxWeight = payload.reduce((max, item) => Math.max(max, Number(item.weight ?? item.score ?? 0)), 1);
      keywordHost.innerHTML = '';
      payload.forEach((item) => {
        const span = document.createElement('span');
        span.textContent = item.text || item.keyword || item.term || '-';
        const weight = Number(item.weight ?? item.score ?? 0);
        const scale = maxWeight ? 0.85 + (weight / maxWeight) * 0.75 : 1;
        span.style.fontSize = `${Math.min(2.1, scale).toFixed(2)}rem`;
        keywordHost.appendChild(span);
      });
    }
  }

  const sentimentWrap = document.querySelector('.sentiment-cloud-wrap[data-sentiment-cloud]');
  if (sentimentWrap) {
    const payload = parseDataset(sentimentWrap, 'data-sentiment-cloud', { positive: [], negative: [] });
    const pushWords = (targetSelector, words, baseColor) => {
      const column = sentimentWrap.querySelector(targetSelector);
      if (!column) return;
      const list = column.querySelector('.cloud-list');
      if (!list) return;
      list.innerHTML = '';
      const max = words.reduce((maxValue, item) => Math.max(maxValue, Number(item.weight ?? item.score ?? 0)), 1);
      words.forEach((item) => {
        const span = document.createElement('span');
        span.textContent = item.text || item.term || '-';
        const weight = Number(item.weight ?? item.score ?? 0);
        const scale = max ? 0.85 + (weight / max) * 0.65 : 1;
        span.style.fontSize = `${Math.min(1.6, scale).toFixed(2)}rem`;
        list.appendChild(span);
      });
    };

    pushWords('[data-sentiment="positive"]', payload.positive || [], '#16a34a');
    pushWords('[data-sentiment="negative"]', payload.negative || [], '#dc2626');
  }
}

function initProcurementDialogs() {
  const triggers = document.querySelectorAll('[data-dialog-open]');
  const closeButtons = document.querySelectorAll('[data-dialog-close]');
  if (!triggers.length && !closeButtons.length) return;

  const toggleDialog = (dialog, open) => {
    if (!dialog) return;
    if (open) {
      dialog.removeAttribute('hidden');
      dialog.classList.add('open');
    } else {
      dialog.classList.remove('open');
      dialog.setAttribute('hidden', 'hidden');
    }
  };

  triggers.forEach((trigger) => {
    const targetId = trigger.getAttribute('data-dialog-open');
    const dialog = document.getElementById(targetId);
    if (!dialog) return;
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      toggleDialog(dialog, true);
    });
  });

  closeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const dialog = btn.closest('.dialog');
      toggleDialog(dialog, false);
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      document.querySelectorAll('.dialog.open').forEach((dialog) => toggleDialog(dialog, false));
    }
  });
}

function initDynamicItemRows() {
  document.querySelectorAll('[data-add-row]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const form = btn.closest('form');
      const container = form?.querySelector('[data-item-list]');
      const template = container?.querySelector('.item-row');
      if (!container || !template) return;

      const clone = template.cloneNode(true);
      clone.querySelectorAll('input').forEach((input) => {
        if (input.type === 'number') {
          input.value = '';
        } else if (input.name === 'unit') {
          // keep default unit
        } else {
          input.value = '';
        }
      });
      container.appendChild(clone);
    });
  });
}

function initMockDailySummaryControls() {
  const btn = document.getElementById('btnPreviewDailyFlex');
  const pre = document.getElementById('daily-flex-pre');
  const idxEl = document.getElementById('dailyFlexIndex');
  if (!btn || !pre) return;
  btn.addEventListener('click', async () => {
    try {
      const res = await fetch('/admin/ai/mock/daily/preview', { headers: { 'Accept': 'application/json' } });
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.flex) {
        pre.textContent = JSON.stringify(data.flex, null, 2);
      }
      if (idxEl && typeof data?.index === 'number' && typeof data?.summary === 'object') {
        const total = Number(document.body.getAttribute('data-daily-total')) || 10;
        idxEl.textContent = `Report ${data.index + 1}/${total}`;
      }
    } catch (err) {
      // no-op
    }
  });
}

// ---- Live search for selects (auto-enable when many options) ----
function initLiveSelectSearch() {
  const MIN_OPTIONS = 8;
  const selects = Array.from(document.querySelectorAll('select')).filter(
    (el) => !el.hasAttribute('data-no-live-search') && el.options && el.options.length >= MIN_OPTIONS,
  );
  if (!selects.length) return;

  selects.forEach((select) => {
    // Avoid duplicate search input
    if (select.previousElementSibling && select.previousElementSibling.classList?.contains('select-search')) return;

    const wrap = document.createElement('div');
    wrap.className = 'field';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'ค้นหา…';
    input.className = 'select-search';
    input.style.marginBottom = '6px';
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(input);
    wrap.appendChild(select);

    const normalize = (s) => String(s || '').toLowerCase().trim();
    const filter = () => {
      const q = normalize(input.value);
      const opts = Array.from(select.options);
      if (!q) {
        opts.forEach((opt) => (opt.hidden = false));
        return;
      }
      opts.forEach((opt) => {
        const label = normalize(opt.textContent + ' ' + opt.value);
        opt.hidden = !label.includes(q);
      });
    };

    input.addEventListener('input', filter);
  });
}

// ---- Live search for tables (first table or those with data-live-search) ----
function initLiveTableSearch() {
  const wrappers = document.querySelectorAll('.table-wrap[data-live-search], .table-wrap.auto-live-search');
  let list = Array.from(wrappers);
  if (!list.length) {
    // Heuristic: single large table on page
    const firstTableWrap = document.querySelector('.table-wrap');
    const rowCount = document.querySelectorAll('.table tbody tr').length;
    if (firstTableWrap && rowCount > 12) list = [firstTableWrap];
  }
  if (!list.length) return;

  list.forEach((wrap) => {
    if (wrap.querySelector('.table-live-search')) return;
    const box = document.createElement('div');
    box.style.display = 'flex';
    box.style.justifyContent = 'flex-end';
    box.style.padding = '8px 10px';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'ค้นหาในตาราง…';
    input.className = 'table-live-search';
    input.style.minWidth = '220px';
    box.appendChild(input);
    wrap.parentNode.insertBefore(box, wrap);

    const rows = Array.from(wrap.querySelectorAll('tbody tr'));
    const normalize = (s) => String(s || '').toLowerCase().trim();
    input.addEventListener('input', () => {
      const q = normalize(input.value);
      if (!q) {
        rows.forEach((tr) => (tr.style.display = ''));
        return;
      }
      rows.forEach((tr) => {
        const text = normalize(tr.textContent);
        tr.style.display = text.includes(q) ? '' : 'none';
      });
    });
  });
}

function initCodeToggles() {
  const blocks = document.querySelectorAll('[data-code-collapsible]');
  if (!blocks.length) return;
  blocks.forEach((wrap) => {
    const btn = wrap.querySelector('[data-code-toggle]');
    const pre = wrap.querySelector('pre');
    if (!btn || !pre) return;
    const set = (collapsed) => {
      if (collapsed) {
        pre.style.display = 'none';
        btn.textContent = 'Show JSON';
      } else {
        pre.style.display = '';
        btn.textContent = 'Hide JSON';
      }
      wrap.dataset.collapsed = collapsed ? 'true' : 'false';
    };
    // initial
    set(wrap.getAttribute('data-collapsed') === 'true');
    btn.addEventListener('click', () => {
      const now = wrap.dataset.collapsed === 'true';
      set(!now);
    });
  });
}

function initCollapsiblePanels() {
  const panels = document.querySelectorAll('.panel[data-collapsible]');
  if (!panels.length) return;

  panels.forEach((panel) => {
    const header = panel.querySelector('.panel__header');
    const body = panel.querySelector('.panel__body');
    if (!header || !body) return;

    const shouldIgnore = (el) => {
      const t = el.tagName?.toLowerCase();
      return (
        ['button', 'a', 'input', 'select', 'label', 'textarea'].includes(t) ||
        el.closest('form')
      );
    };

    header.addEventListener('click', (e) => {
      if (shouldIgnore(e.target)) return;
      const hidden = body.hasAttribute('hidden');
      if (hidden) {
        body.removeAttribute('hidden');
        panel.classList.remove('is-collapsed');
      } else {
        body.setAttribute('hidden', 'hidden');
        panel.classList.add('is-collapsed');
      }
    });
  });
}

function initMockAnalyticsControls() {
  const regenButtons = document.querySelectorAll('[data-action="regenerate-mock"]');
  if (!regenButtons.length) return;
  regenButtons.forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const seed = Date.now() % 2147483647;
        const res = await fetch('/admin/mock/analytics/regenerate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seed }),
        });
        if (res.ok) {
          window.location.assign('/admin/dashboard/engagement');
        }
      } catch (err) {
        // no-op
      }
    });
  });
}
