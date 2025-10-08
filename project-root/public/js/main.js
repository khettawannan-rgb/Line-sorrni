// ไฮไลต์เมนูตาม URL ปัจจุบัน + ปุ่มยืนยันอันตราย
document.addEventListener('DOMContentLoaded', () => {
  const here = location.pathname.replace(/\/+$/, '');
  const navLinks = document.querySelectorAll('.nav a');
  document.querySelectorAll('.nav a').forEach((a) => {
    const href = (a.getAttribute('href') || '').replace(/\/+$/, '');
    if (href && here === href) a.classList.add('active');
    const group = a.closest('.nav-group');
    if (a.classList.contains('active') && group) {
      group.classList.add('active');
    }
  });

  const navGroups = document.querySelectorAll('.nav-group');
  navGroups.forEach((group) => {
    const button = group.querySelector('button');
    if (!button) return;
    button.addEventListener('click', (ev) => {
      ev.preventDefault();
      const isOpen = group.classList.toggle('open');
      if (isOpen) {
        navGroups.forEach((g) => { if (g !== group) g.classList.remove('open'); });
      }
    });
  });

  document.addEventListener('click', (ev) => {
    const target = ev.target;
    if (!target.closest('.nav-group')) {
      navGroups.forEach((group) => group.classList.remove('open'));
    }
  });

  const navToggles = document.querySelectorAll('[data-nav-toggle]');
  const navBackdrop = document.querySelector('[data-nav-backdrop]');
  const setNavExpanded = (isOpen) => {
    document.body.classList.toggle('nav-open', isOpen);
    navToggles.forEach((btn) => btn.setAttribute('aria-expanded', String(isOpen)));
    if (!isOpen) navGroups.forEach((group) => group.classList.remove('open'));
  };

  navToggles.forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      const next = !document.body.classList.contains('nav-open');
      setNavExpanded(next);
    });
  });

  if (navBackdrop) {
    navBackdrop.addEventListener('click', () => setNavExpanded(false));
  }

  navLinks.forEach((link) => {
    link.addEventListener('click', () => {
      if (window.matchMedia('(max-width: 960px)').matches) {
        setNavExpanded(false);
      }
    });
  });

  document.querySelectorAll('[data-confirm]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      if (!confirm(btn.getAttribute('data-confirm'))) e.preventDefault();
    });
  });

  initDonutCharts();
  initLocationsTable();
  initUploadExperience();
  initDailyLineChart();
  initCustomerInsightCharts();
  initProcurementDialogs();
  initDynamicItemRows();
});

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
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99,102,241,0.18)',
                borderWidth: 3,
                tension: 0.35,
                fill: true,
                pointRadius: 3,
                yAxisID: 'y',
              },
              {
                label: 'ผู้ใช้',
                data: userSeries,
                borderColor: '#ec4899',
                backgroundColor: 'rgba(236,72,153,0.15)',
                borderWidth: 3,
                tension: 0.35,
                fill: false,
                pointRadius: 3,
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
      }
    }
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
