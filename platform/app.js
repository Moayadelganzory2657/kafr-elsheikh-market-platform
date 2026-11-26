/* ==========================================================================
   منصة كفر الشيخ الذكية لدراسة السوق والأنشطة التجارية — V4
   Main Application Logic (Defensive, Zero-Dependency Vanilla JS + Chart.js + Leaflet)
   ========================================================================== */

(function () {
  'use strict';

  const state = {
    data: null,
    activeView: 'dashboard',
    map: null,
    mapLayerGroup: null,
    mapMode: 'markaz', // 'markaz' | 'points'
    mapSector: '__ALL__',
    compareMode: 'activities', // 'activities' | 'markaz'
    charts: {},
    modalActivity: null,
    dirFiltered: [],
    dirPage: 1,
    dirPageSize: 25
  };

  /* -------------------- Defensive Utilities -------------------- */
  function safeStr(val, fallback = '—') {
    if (val === null || val === undefined) return fallback;
    const s = String(val).trim();
    return s.length ? s : fallback;
  }

  function safeNum(val, fallback = 0) {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtNum(val) {
    return safeNum(val).toLocaleString('ar-EG');
  }

  function fmtEGP(val) {
    const n = safeNum(val);
    if (n >= 1000000) {
      return (n / 1000000).toLocaleString('ar-EG', { maximumFractionDigits: 2 }) + ' مليون ج.م';
    }
    return n.toLocaleString('ar-EG') + ' ج.م';
  }

  function asList(val) {
    if (Array.isArray(val)) return val.map(v => String(v).trim()).filter(Boolean);
    if (typeof val === 'string' && val.trim()) {
      return val.split(/[،,;•\n]+/).map(s => s.trim()).filter(Boolean);
    }
    return [];
  }

  function getOppColor(score) {
    const s = safeNum(score);
    if (s >= 70) return '#10b981';
    if (s >= 45) return '#f59e0b';
    return '#f43f5e';
  }

  function getStatusBadgeClass(status) {
    const s = safeStr(status, '');
    if (s.includes('جديد')) return 'badge-emerald';
    if (s.includes('غير مضاف') || s.includes('ناقص')) return 'badge-amber';
    if (s.includes('مكتمل')) return 'badge-teal';
    return 'badge-slate';
  }

  function getSatBadgeClass(sat) {
    const s = safeStr(sat, '');
    if (s.includes('منخفض')) return 'badge-emerald';
    if (s.includes('متوسط')) return 'badge-amber';
    if (s.includes('مرتفع') || s.includes('عالي')) return 'badge-rose';
    return 'badge-slate';
  }

  function chartColors() {
    const isLight = document.body.classList.contains('theme-light');
    return {
      text: isLight ? '#334155' : '#cbd5e1',
      grid: isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(148, 163, 184, 0.12)'
    };
  }

  function destroyChart(key) {
    if (state.charts[key]) {
      state.charts[key].destroy();
      delete state.charts[key];
    }
  }

  /* -------------------- Data Loading -------------------- */
  async function loadData() {
    if (window.PLATFORM_DATA && typeof window.PLATFORM_DATA === 'object') {
      return window.PLATFORM_DATA;
    }
    const resp = await fetch('./platform_data.json');
    if (!resp.ok) {
      throw new Error(`فشل تحميل ملف البيانات (HTTP ${resp.status})`);
    }
    return await resp.json();
  }

  /* -------------------- Navigation & Theme -------------------- */
  function switchView(viewId) {
    state.activeView = viewId;
    document.querySelectorAll('.nav-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewId);
    });
    document.querySelectorAll('.view-section').forEach(sec => {
      sec.classList.toggle('active', sec.id === `view-${viewId}`);
    });

    if (viewId === 'map') {
      initMapIfNeeded();
      setTimeout(() => {
        if (state.map) state.map.invalidateSize();
      }, 120);
    } else if (viewId === 'compare') {
      renderCompare();
    } else if (viewId === 'feasibility') {
      runFeasibility();
    }
  }

  function initThemeToggle() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const isLight = document.body.classList.toggle('theme-light');
      btn.textContent = isLight ? '🌙 داكن' : '☀️ فاتح';
      renderDashboardCharts();
      if (state.activeView === 'compare') renderCompare();
    });
  }

  /* ==================== 1. DASHBOARD ==================== */
  function renderDashboard() {
    const { meta = {}, activities_catalog = [] } = state.data;
    if (meta.title) {
      const titleEl = document.getElementById('platform-title');
      if (titleEl) titleEl.textContent = meta.title;
    }

    const sortedActs = [...activities_catalog].sort(
      (a, b) => safeNum(b.opportunity_score) - safeNum(a.opportunity_score)
    );
    const topAct = sortedActs[0] || null;

    const kpis = [
      {
        label: 'إجمالي الأنشطة الموثقة',
        value: fmtNum(meta.total_businesses || (state.data.businesses || []).length),
        sub: `${fmtNum(meta.total_localities || 0)} مدينة وقرية`,
        accent: '#14b8a6'
      },
      {
        label: 'القطاعات الموحدة',
        value: fmtNum(meta.total_sectors || (state.data.sectors_summary || []).length),
        sub: 'تصنيف سوقي موحد',
        accent: '#38bdf8'
      },
      {
        label: 'أنشطة دليل دراسة السوق',
        value: fmtNum(meta.total_activities_catalog || activities_catalog.length),
        sub: 'نشاط وفرصة مدروسة',
        accent: '#10b981'
      },
      {
        label: 'المراكز والأقسام',
        value: fmtNum(meta.total_markaz || (state.data.markaz_info || []).length),
        sub: `${fmtNum(meta.geocoded_points || (state.data.geocoded_points || []).length)} نقطة موثقة بالإحداثيات`,
        accent: '#f59e0b'
      },
      {
        label: 'أعلى فرصة استثمارية',
        value: topAct ? safeStr(topAct.name) : '—',
        sub: topAct ? `مؤشر الفرص: ${safeNum(topAct.opportunity_score)} / 100` : '',
        accent: '#818cf8',
        isText: true
      }
    ];

    const kpiContainer = document.getElementById('dashboard-kpis');
    kpiContainer.innerHTML = kpis.map(k => `
      <div class="kpi-card" style="--kpi-accent: ${k.accent};">
        <div class="kpi-label">${escapeHtml(k.label)}</div>
        <div class="kpi-value ${k.isText ? 'kpi-text' : ''}">${escapeHtml(k.value)}</div>
        <div class="kpi-sub">${escapeHtml(k.sub)}</div>
      </div>
    `).join('');

    renderDashboardCharts();
    renderSpotlight(sortedActs.slice(0, 6));
  }

  function renderDashboardCharts() {
    if (!state.data || typeof Chart === 'undefined') return;
    const { sectors_summary = [], markaz_info = [] } = state.data;
    const c = chartColors();
    Chart.defaults.font.family = "'Tajawal', 'Cairo', sans-serif";

    // 1. Sectors Horizontal Bar
    destroyChart('sectors');
    const secSorted = [...sectors_summary].sort((a, b) => safeNum(b.count) - safeNum(a.count));
    const ctxSec = document.getElementById('chart-sectors');
    if (ctxSec) {
      state.charts.sectors = new Chart(ctxSec, {
        type: 'bar',
        data: {
          labels: secSorted.map(s => safeStr(s.sector)),
          datasets: [{
            label: 'عدد الأنشطة',
            data: secSorted.map(s => safeNum(s.count)),
            backgroundColor: 'rgba(20, 184, 166, 0.78)',
            borderColor: '#14b8a6',
            borderWidth: 1,
            borderRadius: 6
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => ` ${fmtNum(ctx.raw)} نشاط`
              }
            }
          },
          scales: {
            x: { ticks: { color: c.text }, grid: { color: c.grid } },
            y: { ticks: { color: c.text, font: { size: 11 } }, grid: { display: false } }
          }
        }
      });
    }

    // 2. Markaz Grouped Bar (Business Count vs Opportunity Score)
    destroyChart('markaz');
    const mkzSorted = [...markaz_info].sort((a, b) => safeNum(b.business_count) - safeNum(a.business_count));
    const ctxMkz = document.getElementById('chart-markaz');
    if (ctxMkz) {
      state.charts.markaz = new Chart(ctxMkz, {
        type: 'bar',
        data: {
          labels: mkzSorted.map(m => safeStr(m.name)),
          datasets: [
            {
              label: 'عدد الأنشطة القائمة',
              data: mkzSorted.map(m => safeNum(m.business_count)),
              backgroundColor: 'rgba(56, 189, 248, 0.75)',
              borderRadius: 5,
              yAxisID: 'y'
            },
            {
              label: 'مؤشر الفرص (0-100)',
              data: mkzSorted.map(m => safeNum(m.opportunity_score)),
              backgroundColor: 'rgba(245, 158, 11, 0.85)',
              borderRadius: 5,
              yAxisID: 'y1'
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: c.text } }
          },
          scales: {
            x: { ticks: { color: c.text, maxRotation: 45, minRotation: 25, font: { size: 10 } }, grid: { display: false } },
            y: {
              position: 'right',
              ticks: { color: c.text },
              grid: { color: c.grid },
              title: { display: true, text: 'عدد الأنشطة', color: c.text }
            },
            y1: {
              position: 'left',
              min: 0,
              max: 100,
              ticks: { color: '#f59e0b' },
              grid: { drawOnChartArea: false },
              title: { display: true, text: 'مؤشر الفرص', color: '#f59e0b' }
            }
          }
        }
      });
    }

    // 3. Saturation vs Opportunity Bubble Chart
    destroyChart('bubble');
    const ctxBub = document.getElementById('chart-bubble');
    if (ctxBub) {
      const maxCount = Math.max(1, ...sectors_summary.map(s => safeNum(s.count)));
      const bubbleData = sectors_summary.map(s => ({
        x: safeNum(s.avg_saturation),
        y: safeNum(s.opportunity_score),
        r: Math.max(8, Math.min(28, Math.sqrt(safeNum(s.count) / maxCount) * 28)),
        sector: safeStr(s.sector),
        count: safeNum(s.count)
      }));

      state.charts.bubble = new Chart(ctxBub, {
        type: 'bubble',
        data: {
          datasets: [{
            label: 'القطاعات التجارية',
            data: bubbleData,
            backgroundColor: bubbleData.map(d => getOppColor(d.y) + 'aa'),
            borderColor: bubbleData.map(d => getOppColor(d.y)),
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => {
                  const d = ctx.raw;
                  return `${d.sector} | التشبع: ${d.x} | الفرص: ${d.y} | الأنشطة: ${fmtNum(d.count)}`;
                }
              }
            }
          },
          scales: {
            x: {
              title: { display: true, text: 'متوسط مؤشر التشبع (أقل = منافسة أقل)', color: c.text },
              ticks: { color: c.text },
              grid: { color: c.grid }
            },
            y: {
              title: { display: true, text: 'مؤشر الفرص الاستثمارية (أعلى = أفضل)', color: c.text },
              ticks: { color: c.text },
              grid: { color: c.grid }
            }
          }
        }
      });
    }
  }

  function renderSpotlight(topActs) {
    const container = document.getElementById('dashboard-spotlight');
    if (!topActs.length) {
      container.innerHTML = '<div class="empty-state">لا توجد بيانات فرص متاحة حالياً.</div>';
      return;
    }
    container.innerHTML = topActs.map(act => `
      <div class="card opp-card" data-act-id="${escapeHtml(act.id)}">
        <div class="opp-card-top">
          <div>
            <span class="badge ${getStatusBadgeClass(act.status)}">${escapeHtml(safeStr(act.status))}</span>
            <h3 style="font-size: 1.02rem; margin-top: 0.4rem;">${escapeHtml(safeStr(act.name))}</h3>
            <div style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(safeStr(act.sector))}</div>
          </div>
          <span class="opp-score-badge">${safeNum(act.opportunity_score)} / 100</span>
        </div>
        <div class="activity-metrics">
          <div class="metric-item">
            <span>رأس المال المبدئي</span>
            <strong>${escapeHtml(fmtEGP(act.capital_min_egp))}</strong>
          </div>
          <div class="metric-item">
            <span>فترة الاسترداد</span>
            <strong>${fmtNum(act.payback_months)} شهر</strong>
          </div>
        </div>
        <div style="font-size: 0.8rem; color: var(--accent-teal); font-weight: 600;">
          أفضل المراكز: ${escapeHtml(asList(act.best_markaz).slice(0, 3).join('، ') || 'كافة المراكز')}
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.opp-card').forEach(card => {
      card.addEventListener('click', () => {
        const act = (state.data.activities_catalog || []).find(a => String(a.id) === card.dataset.actId);
        if (act) openActivityModal(act);
      });
    });
  }

  /* ==================== 2. INTERACTIVE MAP ==================== */
  function initMapControls() {
    const { sectors_summary = [], geocoded_points = [] } = state.data;
    const badge = document.getElementById('geocoded-count-badge');
    if (badge) badge.textContent = fmtNum(geocoded_points.length);

    const sel = document.getElementById('map-sector-filter');
    sel.innerHTML = '<option value="__ALL__">جميع القطاعات (المؤشر العام)</option>' +
      sectors_summary.map(s => `<option value="${escapeHtml(s.sector)}">${escapeHtml(s.sector)} (${fmtNum(s.count)})</option>`).join('');

    sel.addEventListener('change', () => {
      state.mapSector = sel.value;
      renderMapLayers();
    });

    document.querySelectorAll('#map-mode-toggle .segmented-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#map-mode-toggle .segmented-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.mapMode = btn.dataset.mode;
        renderMapLayers();
      });
    });
  }

  function initMapIfNeeded() {
    if (state.map || typeof L === 'undefined') return;
    state.map = L.map('market-map', { zoomControl: true }).setView([31.25, 30.94], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap'
    }).addTo(state.map);
    state.mapLayerGroup = L.layerGroup().addTo(state.map);
    renderMapLayers();
  }

  function getMarkazMetricsForSector(mkz, sector) {
    const matrix = state.data.matrix || {};
    if (sector !== '__ALL__' && matrix[mkz.name] && matrix[mkz.name][sector]) {
      const cell = matrix[mkz.name][sector];
      return {
        count: safeNum(cell.count),
        saturation: safeNum(cell.saturation),
        opportunity: safeNum(cell.opportunity)
      };
    }
    return {
      count: safeNum(mkz.business_count),
      saturation: safeNum(mkz.saturation_index),
      opportunity: safeNum(mkz.opportunity_score)
    };
  }

  function renderMapLayers() {
    if (!state.map || !state.mapLayerGroup) return;
    state.mapLayerGroup.clearLayers();

    const { markaz_info = [], geocoded_points = [] } = state.data;
    const sector = state.mapSector;
    const summaryEl = document.getElementById('map-summary-stats');
    const listEl = document.getElementById('map-markaz-list');

    // Always update side Markaz ranking for selected sector
    const ranked = markaz_info.map(m => ({
      ...m,
      metrics: getMarkazMetricsForSector(m, sector)
    })).sort((a, b) => b.metrics.opportunity - a.metrics.opportunity);

    const totalInSector = ranked.reduce((acc, m) => acc + m.metrics.count, 0);
    summaryEl.innerHTML = `
      <div>القطاع المختار: <strong style="color: var(--text-primary);">${escapeHtml(sector === '__ALL__' ? 'جميع القطاعات' : sector)}</strong></div>
      <div>إجمالي الأنشطة: <strong style="color: var(--accent-teal);">${fmtNum(totalInSector)}</strong></div>
    `;

    const markersByName = {};

    if (state.mapMode === 'markaz') {
      const maxCount = Math.max(1, ...ranked.map(m => m.metrics.count));
      ranked.forEach(m => {
        if (!Number.isFinite(Number(m.lat)) || !Number.isFinite(Number(m.lng))) return;
        const color = getOppColor(m.metrics.opportunity);
        const radius = Math.max(10, Math.min(34, 10 + (m.metrics.count / maxCount) * 24));
        const circle = L.circleMarker([Number(m.lat), Number(m.lng)], {
          radius,
          fillColor: color,
          color: '#ffffff',
          weight: 2,
          opacity: 0.9,
          fillOpacity: 0.72
        });

        const topSecs = (m.top_sectors || []).slice(0, 3)
          .map(ts => `${escapeHtml(ts.sector)} (${fmtNum(ts.count)})`).join('، ');

        circle.bindPopup(`
          <div class="popup-title">${escapeHtml(m.name)}</div>
          <div class="popup-row">الأنشطة (${escapeHtml(sector === '__ALL__' ? 'الإجمالي' : sector)}): <strong>${fmtNum(m.metrics.count)}</strong></div>
          <div class="popup-row">مؤشر الفرص: <strong style="color: ${color};">${m.metrics.opportunity} / 100</strong></div>
          <div class="popup-row">مؤشر التشبع: <strong>${m.metrics.saturation}</strong></div>
          <div class="popup-row">تقدير السكان: <strong>${fmtNum(m.population_est)}</strong></div>
          ${topSecs ? `<div class="popup-row" style="margin-top:4px; font-size:0.78rem;">أبرز القطاعات: ${topSecs}</div>` : ''}
        `);

        circle.addTo(state.mapLayerGroup);
        markersByName[m.name] = circle;
      });
    } else {
      const pts = sector === '__ALL__'
        ? geocoded_points
        : geocoded_points.filter(p => p.sector === sector);

      pts.forEach(p => {
        if (!Number.isFinite(Number(p.lat)) || !Number.isFinite(Number(p.lng))) return;
        const marker = L.circleMarker([Number(p.lat), Number(p.lng)], {
          radius: 7,
          fillColor: '#14b8a6',
          color: '#0f172a',
          weight: 1.5,
          fillOpacity: 0.9
        });

        marker.bindPopup(`
          <div class="popup-title">${escapeHtml(safeStr(p.name))}</div>
          <div class="popup-row">القطاع: <strong>${escapeHtml(safeStr(p.sector))}</strong></div>
          <div class="popup-row">الفئة: <strong>${escapeHtml(safeStr(p.cat))}</strong></div>
          <div class="popup-row">الموقع: <strong>${escapeHtml(safeStr(p.markaz))} — ${escapeHtml(safeStr(p.loc))}</strong></div>
          <div class="popup-row">الهاتف: <strong>${escapeHtml(safeStr(p.phone))}</strong></div>
          <div class="popup-row">التقييم: <strong>${p.rating ? `${p.rating} ⭐ (${fmtNum(p.reviews)})` : '—'}</strong> | الثقة: <strong>${escapeHtml(safeStr(p.conf))}</strong></div>
          ${p.url ? `<div style="margin-top:6px;"><a href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer">فتح في خرائط جوجل ↗</a></div>` : ''}
        `);
        marker.addTo(state.mapLayerGroup);
      });
    }

    listEl.innerHTML = ranked.map(m => `
      <div class="map-markaz-row" data-mkz="${escapeHtml(m.name)}">
        <span><strong>${escapeHtml(m.name)}</strong> <small style="color:var(--text-muted);">(${fmtNum(m.metrics.count)})</small></span>
        <span class="badge" style="background: ${getOppColor(m.metrics.opportunity)}22; color: ${getOppColor(m.metrics.opportunity)};">
          فرصة ${m.metrics.opportunity}
        </span>
      </div>
    `).join('');

    listEl.querySelectorAll('.map-markaz-row').forEach(row => {
      row.addEventListener('click', () => {
        const name = row.dataset.mkz;
        const mkz = markaz_info.find(x => x.name === name);
        if (mkz && Number.isFinite(Number(mkz.lat)) && Number.isFinite(Number(mkz.lng))) {
          state.map.setView([Number(mkz.lat), Number(mkz.lng)], 12);
          if (markersByName[name]) markersByName[name].openPopup();
        }
      });
    });
  }

  /* ==================== 3. MARKET STUDY & GAP CATALOG ==================== */
  function initCatalog() {
    const acts = state.data.activities_catalog || [];
    const sectors = [...new Set(acts.map(a => safeStr(a.sector, '')).filter(Boolean))].sort();
    const selSec = document.getElementById('cat-sector');
    selSec.innerHTML = '<option value="">جميع القطاعات</option>' +
      sectors.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');

    const maxCap = Math.max(500000, ...acts.map(a => safeNum(a.capital_min_egp, 0)));
    const slider = document.getElementById('cat-max-cap');
    slider.max = String(Math.ceil(maxCap / 100000) * 100000);
    slider.value = slider.max;

    const updateLabel = () => {
      const lbl = document.getElementById('cat-max-cap-label');
      lbl.textContent = Number(slider.value) >= Number(slider.max) ? 'الكل' : fmtEGP(slider.value);
    };
    updateLabel();

    ['cat-search', 'cat-status', 'cat-sector', 'cat-saturation'].forEach(id => {
      document.getElementById(id).addEventListener('input', renderCatalog);
      document.getElementById(id).addEventListener('change', renderCatalog);
    });
    slider.addEventListener('input', () => {
      updateLabel();
      renderCatalog();
    });

    renderCatalog();
  }

  function renderCatalog() {
    const acts = state.data.activities_catalog || [];
    const q = document.getElementById('cat-search').value.trim().toLowerCase();
    const status = document.getElementById('cat-status').value;
    const sector = document.getElementById('cat-sector').value;
    const sat = document.getElementById('cat-saturation').value;
    const slider = document.getElementById('cat-max-cap');
    const maxCapVal = Number(slider.value);
    const filterByCap = maxCapVal < Number(slider.max);

    const filtered = acts.filter(a => {
      if (q) {
        const hay = `${a.name || ''} ${a.description || ''} ${a.sector || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (status && safeStr(a.status) !== status) return false;
      if (sector && safeStr(a.sector) !== sector) return false;
      if (sat && !safeStr(a.saturation_level).includes(sat)) return false;
      if (filterByCap && safeNum(a.capital_min_egp) > maxCapVal) return false;
      return true;
    }).sort((a, b) => safeNum(b.opportunity_score) - safeNum(a.opportunity_score));

    document.getElementById('catalog-count-badge').textContent = `${fmtNum(filtered.length)} نشاط`;
    const grid = document.getElementById('catalog-grid');

    if (!filtered.length) {
      grid.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1;">لا توجد أنشطة مطابقة لمعايير التصفية الحالية.</div>';
      return;
    }

    grid.innerHTML = filtered.map(act => `
      <div class="card activity-card" data-act-id="${escapeHtml(act.id)}">
        <div>
          <div class="opp-card-top">
            <div style="display:flex; gap:0.35rem; flex-wrap:wrap;">
              <span class="badge ${getStatusBadgeClass(act.status)}">${escapeHtml(safeStr(act.status))}</span>
              <span class="badge ${getSatBadgeClass(act.saturation_level)}">تشبع: ${escapeHtml(safeStr(act.saturation_level))}</span>
            </div>
            <span class="opp-score-badge">${safeNum(act.opportunity_score)}</span>
          </div>
          <h3 style="font-size: 1.05rem; margin-top: 0.65rem;">${escapeHtml(safeStr(act.name))}</h3>
          <div style="font-size: 0.8rem; color: var(--accent-teal); margin-bottom: 0.45rem;">${escapeHtml(safeStr(act.sector))}</div>
          <p style="font-size: 0.84rem; color: var(--text-secondary); margin: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
            ${escapeHtml(safeStr(act.description, 'دراسة سوقية متكاملة للنشاط في محافظة كفر الشيخ.'))}
          </p>
        </div>

        <div class="activity-metrics">
          <div class="metric-item">
            <span>رأس المال</span>
            <strong>${escapeHtml(fmtEGP(act.capital_min_egp))}</strong>
          </div>
          <div class="metric-item">
            <span>الإيراد الشهري المتوقع</span>
            <strong>${escapeHtml(fmtEGP(act.monthly_revenue_est_egp))}</strong>
          </div>
          <div class="metric-item">
            <span>هامش الربح</span>
            <strong>${safeNum(act.profit_margin_pct)}%</strong>
          </div>
          <div class="metric-item">
            <span>الاسترداد</span>
            <strong>${fmtNum(act.payback_months)} شهر</strong>
          </div>
        </div>
      </div>
    `).join('');

    grid.querySelectorAll('.activity-card').forEach(card => {
      card.addEventListener('click', () => {
        const act = acts.find(a => String(a.id) === card.dataset.actId);
        if (act) openActivityModal(act);
      });
    });
  }

  /* -------------------- Activity Detail Modal -------------------- */
  function openActivityModal(act) {
    state.modalActivity = act;
    document.getElementById('modal-act-title').textContent = safeStr(act.name);
    document.getElementById('modal-act-sector').textContent = safeStr(act.sector);
    const stEl = document.getElementById('modal-act-status');
    stEl.textContent = safeStr(act.status);
    stEl.className = `badge ${getStatusBadgeClass(act.status)}`;
    document.getElementById('modal-act-score').textContent = `مؤشر الفرص: ${safeNum(act.opportunity_score)} / 100`;

    const licenses = asList(act.licenses);
    const factors = asList(act.success_factors);
    const risks = asList(act.risks);
    const bestMkz = asList(act.best_markaz);

    document.getElementById('modal-act-body').innerHTML = `
      <p style="font-size: 0.94rem; color: var(--text-secondary); margin-top: 0;">
        ${escapeHtml(safeStr(act.description))}
      </p>

      <div class="feas-metrics-grid" style="margin-top: 1rem;">
        <div class="detail-box">
          <h4>نطاق رأس المال</h4>
          <strong>${escapeHtml(fmtEGP(act.capital_min_egp))} — ${escapeHtml(fmtEGP(act.capital_max_egp))}</strong>
        </div>
        <div class="detail-box">
          <h4>الإيراد الشهري التقديري</h4>
          <strong>${escapeHtml(fmtEGP(act.monthly_revenue_est_egp))}</strong>
        </div>
        <div class="detail-box">
          <h4>هامش الربح / الاسترداد</h4>
          <strong>${safeNum(act.profit_margin_pct)}% | ${fmtNum(act.payback_months)} شهر</strong>
        </div>
      </div>

      <div class="modal-grid">
        <div class="detail-box">
          <h4>أفضل المراكز المقترحة</h4>
          <div>${bestMkz.length ? bestMkz.map(m => `<span class="badge badge-teal" style="margin:2px;">${escapeHtml(m)}</span>`).join('') : 'كافة المراكز'}</div>
          <div style="margin-top: 0.65rem; font-size: 0.83rem; color: var(--text-muted);">
            اتجاه الطلب: <strong style="color: var(--text-primary);">${escapeHtml(safeStr(act.demand_trend))}</strong> |
            القائم حالياً: <strong style="color: var(--text-primary);">${fmtNum(act.existing_count)}</strong>
          </div>
        </div>

        <div class="detail-box">
          <h4>الجمهور المستهدف</h4>
          <div style="font-size: 0.88rem; color: var(--text-secondary);">${escapeHtml(safeStr(act.target_audience))}</div>
        </div>

        <div class="detail-box">
          <h4>التراخيص والمستندات المطلوبة</h4>
          <ul class="detail-list">
            ${(licenses.length ? licenses : ['سجل تجاري وبطاقة ضريبية وترخيص مزاولة نشاط']).map(i => `<li>${escapeHtml(i)}</li>`).join('')}
          </ul>
        </div>

        <div class="detail-box">
          <h4>عوامل النجاح الرئيسية</h4>
          <ul class="detail-list">
            ${(factors.length ? factors : ['اختيار موقع حيوي وجودة الخدمة']).map(i => `<li>${escapeHtml(i)}</li>`).join('')}
          </ul>
        </div>
      </div>

      <div class="detail-box" style="border-color: rgba(244, 63, 94, 0.3);">
        <h4 style="color: var(--accent-rose);">المخاطر والتحديات المحتملة</h4>
        <ul class="detail-list">
          ${(risks.length ? risks : ['تقلبات أسعار الخامات والمنافسة السعرية']).map(i => `<li>${escapeHtml(i)}</li>`).join('')}
        </ul>
      </div>
    `;

    document.getElementById('activity-modal').classList.add('open');
  }

  function closeActivityModal() {
    document.getElementById('activity-modal').classList.remove('open');
  }

  function initModalEvents() {
    document.getElementById('modal-close-btn').addEventListener('click', closeActivityModal);
    document.getElementById('modal-cancel-btn').addEventListener('click', closeActivityModal);
    document.getElementById('activity-modal').addEventListener('click', e => {
      if (e.target.id === 'activity-modal') closeActivityModal();
    });
    document.getElementById('modal-sim-btn').addEventListener('click', () => {
      if (state.modalActivity) {
        const selAct = document.getElementById('feas-activity');
        selAct.value = String(state.modalActivity.id);
        document.getElementById('feas-capital').value = String(safeNum(state.modalActivity.capital_min_egp, 300000));
        closeActivityModal();
        switchView('feasibility');
      }
    });
  }

  /* ==================== 4. SIDE-BY-SIDE COMPARATOR ==================== */
  function initCompare() {
    const acts = state.data.activities_catalog || [];
    const mkz = state.data.markaz_info || [];

    const actOpts = acts.map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)} (${safeNum(a.opportunity_score)})</option>`).join('');
    ['cmp-act-1', 'cmp-act-2', 'cmp-act-3'].forEach((id, idx) => {
      const el = document.getElementById(id);
      el.innerHTML = (idx === 2 ? '<option value="">— بدون نشاط ثالث —</option>' : '') + actOpts;
      if (acts[idx]) el.value = String(acts[idx].id);
      el.addEventListener('change', renderCompareActivities);
    });

    const mkzOpts = mkz.map(m => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`).join('');
    ['cmp-mkz-1', 'cmp-mkz-2', 'cmp-mkz-3'].forEach((id, idx) => {
      const el = document.getElementById(id);
      el.innerHTML = (idx === 2 ? '<option value="">— بدون مركز ثالث —</option>' : '') + mkzOpts;
      if (mkz[idx]) el.value = mkz[idx].name;
      el.addEventListener('change', renderCompareMarkaz);
    });

    document.querySelectorAll('#compare-mode-toggle .segmented-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#compare-mode-toggle .segmented-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.compareMode = btn.dataset.mode;
        document.getElementById('compare-activities-panel').style.display = state.compareMode === 'activities' ? 'block' : 'none';
        document.getElementById('compare-markaz-panel').style.display = state.compareMode === 'markaz' ? 'block' : 'none';
        renderCompare();
      });
    });
  }

  function renderCompare() {
    if (state.compareMode === 'activities') renderCompareActivities();
    else renderCompareMarkaz();
  }

  function renderCompareActivities() {
    const acts = state.data.activities_catalog || [];
    const selectedIds = ['cmp-act-1', 'cmp-act-2', 'cmp-act-3']
      .map(id => document.getElementById(id).value)
      .filter(Boolean);
    const chosen = selectedIds.map(id => acts.find(a => String(a.id) === id)).filter(Boolean);
    if (!chosen.length) return;

    // Table
    const rows = [
      { label: 'القطاع', fn: a => safeStr(a.sector) },
      { label: 'حالة التغطية', fn: a => safeStr(a.status) },
      { label: 'مؤشر الفرص', fn: a => `${safeNum(a.opportunity_score)} / 100` },
      { label: 'مستوى التشبع', fn: a => safeStr(a.saturation_level) },
      { label: 'الحد الأدنى لرأس المال', fn: a => fmtEGP(a.capital_min_egp) },
      { label: 'الإيراد الشهري المتوقع', fn: a => fmtEGP(a.monthly_revenue_est_egp) },
      { label: 'هامش الربح', fn: a => `${safeNum(a.profit_margin_pct)}%` },
      { label: 'فترة الاسترداد', fn: a => `${fmtNum(a.payback_months)} شهر` },
      { label: 'اتجاه الطلب', fn: a => safeStr(a.demand_trend) }
    ];

    document.getElementById('compare-act-table').innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>المعيار</th>
            ${chosen.map(a => `<th>${escapeHtml(a.name)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><strong>${escapeHtml(r.label)}</strong></td>
              ${chosen.map(a => `<td>${escapeHtml(r.fn(a))}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    // Radar Chart
    destroyChart('cmpAct');
    const c = chartColors();
    const palette = ['#14b8a6', '#f59e0b', '#818cf8'];
    const maxCap = Math.max(1, ...chosen.map(a => safeNum(a.capital_min_egp)));

    state.charts.cmpAct = new Chart(document.getElementById('chart-compare-act'), {
      type: 'radar',
      data: {
        labels: ['مؤشر الفرص', 'هامش الربح', 'سرعة الاسترداد', 'ملاءمة رأس المال'],
        datasets: chosen.map((a, i) => ({
          label: a.name,
          data: [
            safeNum(a.opportunity_score),
            Math.min(100, safeNum(a.profit_margin_pct) * 2),
            Math.max(10, 100 - safeNum(a.payback_months, 24) * 2.5),
            Math.max(15, 100 - (safeNum(a.capital_min_egp) / maxCap) * 75)
          ],
          backgroundColor: palette[i % 3] + '33',
          borderColor: palette[i % 3],
          borderWidth: 2,
          pointBackgroundColor: palette[i % 3]
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: c.text } } },
        scales: {
          r: {
            min: 0,
            max: 100,
            ticks: { display: false },
            grid: { color: c.grid },
            angleLines: { color: c.grid },
            pointLabels: { color: c.text, font: { size: 12 } }
          }
        }
      }
    });
  }

  function renderCompareMarkaz() {
    const mkzList = state.data.markaz_info || [];
    const matrix = state.data.matrix || {};
    const selectedNames = ['cmp-mkz-1', 'cmp-mkz-2', 'cmp-mkz-3']
      .map(id => document.getElementById(id).value)
      .filter(Boolean);
    const chosen = selectedNames.map(n => mkzList.find(m => m.name === n)).filter(Boolean);
    if (!chosen.length) return;

    const rows = [
      { label: 'إجمالي الأنشطة القائمة', fn: m => fmtNum(m.business_count) },
      { label: 'السجلات عالية الثقة', fn: m => fmtNum(m.high_conf_count) },
      { label: 'تقدير السكان', fn: m => fmtNum(m.population_est) },
      { label: 'مؤشر التشبع العام', fn: m => String(safeNum(m.saturation_index)) },
      { label: 'مؤشر الفرص العام', fn: m => `${safeNum(m.opportunity_score)} / 100` }
    ];

    document.getElementById('compare-mkz-table').innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>المعيار</th>
            ${chosen.map(m => `<th>${escapeHtml(m.name)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><strong>${escapeHtml(r.label)}</strong></td>
              ${chosen.map(m => `<td>${escapeHtml(r.fn(m))}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    // Sector breakdown grouped bar
    destroyChart('cmpMkz');
    const c = chartColors();
    const palette = ['#14b8a6', '#f59e0b', '#818cf8'];
    const sectors = (state.data.sectors_summary || []).slice(0, 10).map(s => s.sector);

    state.charts.cmpMkz = new Chart(document.getElementById('chart-compare-mkz'), {
      type: 'bar',
      data: {
        labels: sectors,
        datasets: chosen.map((m, i) => ({
          label: m.name,
          data: sectors.map(sec => safeNum(matrix[m.name]?.[sec]?.count, 0)),
          backgroundColor: palette[i % 3] + 'cc',
          borderRadius: 5
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: c.text } } },
        scales: {
          x: { ticks: { color: c.text, maxRotation: 35, font: { size: 11 } }, grid: { display: false } },
          y: { ticks: { color: c.text }, grid: { color: c.grid } }
        }
      }
    });
  }

  /* ==================== 5. FEASIBILITY SIMULATOR ==================== */
  function initFeasibility() {
    const acts = state.data.activities_catalog || [];
    const mkz = state.data.markaz_info || [];

    const selAct = document.getElementById('feas-activity');
    selAct.innerHTML = acts.map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)} — ${escapeHtml(a.sector)}</option>`).join('');

    const selMkz = document.getElementById('feas-markaz');
    selMkz.innerHTML = mkz.map(m => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`).join('');

    const capInput = document.getElementById('feas-capital');
    if (acts[0]) capInput.value = String(safeNum(acts[0].capital_min_egp, 350000));

    document.getElementById('btn-fill-min-cap').addEventListener('click', () => {
      const act = acts.find(a => String(a.id) === selAct.value);
      if (act) {
        capInput.value = String(safeNum(act.capital_min_egp, 250000));
        runFeasibility();
      }
    });

    document.getElementById('btn-fill-mid-cap').addEventListener('click', () => {
      const act = acts.find(a => String(a.id) === selAct.value);
      if (act) {
        const mid = Math.round((safeNum(act.capital_min_egp) + safeNum(act.capital_max_egp, act.capital_min_egp)) / 2);
        capInput.value = String(mid);
        runFeasibility();
      }
    });

    selAct.addEventListener('change', runFeasibility);
    selMkz.addEventListener('change', runFeasibility);
    capInput.addEventListener('input', runFeasibility);
    document.getElementById('btn-run-feas').addEventListener('click', runFeasibility);

    runFeasibility();
  }

  function runFeasibility() {
    const acts = state.data.activities_catalog || [];
    const mkzList = state.data.markaz_info || [];
    const matrix = state.data.matrix || {};

    const actId = document.getElementById('feas-activity').value;
    const mkzName = document.getElementById('feas-markaz').value;
    const capital = safeNum(document.getElementById('feas-capital').value, 0);

    const act = acts.find(a => String(a.id) === actId);
    const mkz = mkzList.find(m => m.name === mkzName);
    const out = document.getElementById('feas-results');

    if (!act || !mkz) {
      out.innerHTML = '<div class="card empty-state">يرجى اختيار النشاط والمركز لعرض تحليل الجدوى.</div>';
      return;
    }

    const minCap = safeNum(act.capital_min_egp, 0);
    const capOk = capital >= minCap;
    const capGap = Math.max(0, minCap - capital);

    const cell = matrix[mkz.name]?.[act.sector];
    const localCount = cell ? safeNum(cell.count) : safeNum(mkz.business_count);
    const localSat = cell ? safeNum(cell.saturation) : safeNum(mkz.saturation_index);
    const localOpp = cell ? safeNum(cell.opportunity) : safeNum(mkz.opportunity_score);

    const estRev = safeNum(act.monthly_revenue_est_egp, 0);
    const margin = safeNum(act.profit_margin_pct, 20);
    const estNetProfit = Math.round(estRev * (margin / 100));
    const estPayback = estNetProfit > 0 ? Math.max(1, Math.round((capital || minCap) / estNetProfit)) : safeNum(act.payback_months, 12);

    let verdictClass = 'verdict-good';
    let verdictTitle = 'فرصة جيدة مع تميز تشغيلي';
    let verdictDesc = `النشاط مناسب في ${mkz.name} بمستوى منافسة متوسط؛ يُنصح بالتركيز على الجودة والتسويق المحلي.`;

    if (localOpp >= 68 && capOk) {
      verdictClass = 'verdict-strong';
      verdictTitle = 'موصى به بقوة — فرصة استثمارية ممتازة';
      verdictDesc = `رأس المال المتاح كافٍ، ومؤشر الفرص في ${mkz.name} مرتفع (${localOpp}/100) مع تشبع منخفض في قطاع ${act.sector}.`;
    } else if (localOpp < 45 || localSat >= 75) {
      verdictClass = 'verdict-warn';
      verdictTitle = 'سوق متشبع — فكّر في مركز بديل';
      verdictDesc = `يشهد قطاع ${act.sector} في ${mkz.name} منافسة مرتفعة (التشبع ${localSat}). يُفضل دراسة المراكز البديلة المقترحة أدناه.`;
    }

    // Top 3 alternative Markaz for this activity's sector
    const alternatives = mkzList
      .filter(m => m.name !== mkz.name)
      .map(m => {
        const c = matrix[m.name]?.[act.sector];
        return {
          name: m.name,
          count: c ? safeNum(c.count) : safeNum(m.business_count),
          sat: c ? safeNum(c.saturation) : safeNum(m.saturation_index),
          opp: c ? safeNum(c.opportunity) : safeNum(m.opportunity_score)
        };
      })
      .sort((a, b) => b.opp - a.opp || a.sat - b.sat)
      .slice(0, 3);

    out.innerHTML = `
      <div class="verdict-banner ${verdictClass}">
        <div style="font-family: var(--font-display); font-size: 1.15rem; font-weight: 800; margin-bottom: 0.25rem;">
          ${escapeHtml(verdictTitle)}
        </div>
        <div style="font-size: 0.9rem; color: var(--text-secondary);">${escapeHtml(verdictDesc)}</div>
      </div>

      <div class="feas-metrics-grid">
        <div class="card">
          <div class="kpi-label">مدى ملاءمة رأس المال</div>
          <div class="kpi-value kpi-text" style="color: ${capOk ? 'var(--accent-emerald)' : 'var(--accent-rose)'};">
            ${capOk ? 'كافٍ للتأسيس ✓' : 'يحتاج تمويل إضافي'}
          </div>
          <div class="kpi-sub">
            ${capOk ? `الحد الأدنى المطلوب: ${fmtEGP(minCap)}` : `الفجوة التمويلية: ${fmtEGP(capGap)}`}
          </div>
        </div>

        <div class="card">
          <div class="kpi-label">التشبع والمنافسة في ${escapeHtml(mkz.name)}</div>
          <div class="kpi-value kpi-text" style="color: ${getOppColor(localOpp)};">
            فرصة ${localOpp} / 100
          </div>
          <div class="kpi-sub">التشبع: ${localSat} | منافسون بالقطاع: ${fmtNum(localCount)}</div>
        </div>

        <div class="card">
          <div class="kpi-label">العائد والاسترداد التقريبي</div>
          <div class="kpi-value kpi-text" style="color: var(--accent-teal);">
            ${escapeHtml(fmtEGP(estNetProfit))} / شهر
          </div>
          <div class="kpi-sub">إيراد: ${fmtEGP(estRev)} | استرداد: ~${fmtNum(estPayback)} شهر</div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">
          <span>أفضل 3 مراكز بديلة لنشاط «${escapeHtml(act.name)}»</span>
          <span class="badge badge-emerald">اضغط للتبديل الفوري</span>
        </div>
        <div class="alt-markaz-grid">
          ${alternatives.map(alt => `
            <div class="alt-card" data-alt-mkz="${escapeHtml(alt.name)}">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
                <strong>${escapeHtml(alt.name)}</strong>
                <span class="badge badge-emerald">فرصة ${alt.opp}</span>
              </div>
              <div style="font-size: 0.8rem; color: var(--text-muted);">
                التشبع: ${alt.sat} | الأنشطة القائمة بالقطاع: ${fmtNum(alt.count)}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    out.querySelectorAll('.alt-card').forEach(card => {
      card.addEventListener('click', () => {
        document.getElementById('feas-markaz').value = card.dataset.altMkz;
        runFeasibility();
      });
    });
  }

  /* ==================== 6. FULL BUSINESS DIRECTORY ==================== */
  function initDirectory() {
    const businesses = state.data.businesses || [];
    const markazSet = [...new Set(businesses.map(b => safeStr(b[3], '')).filter(Boolean))].sort();
    const sectorSet = [...new Set(businesses.map(b => safeStr(b[1], '')).filter(Boolean))].sort();
    const confSet = [...new Set(businesses.map(b => safeStr(b[8], '')).filter(Boolean))].sort();

    document.getElementById('dir-markaz').innerHTML = '<option value="">جميع المراكز</option>' +
      markazSet.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
    document.getElementById('dir-sector').innerHTML = '<option value="">جميع القطاعات</option>' +
      sectorSet.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
    document.getElementById('dir-conf').innerHTML = '<option value="">كافة مستويات الثقة</option>' +
      confSet.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');

    const onFilterChange = () => {
      state.dirPage = 1;
      applyDirectoryFilters();
    };

    ['dir-search', 'dir-markaz', 'dir-sector', 'dir-conf', 'dir-phone-only'].forEach(id => {
      document.getElementById(id).addEventListener('input', onFilterChange);
      document.getElementById(id).addEventListener('change', onFilterChange);
    });

    document.getElementById('dir-prev-btn').addEventListener('click', () => {
      if (state.dirPage > 1) {
        state.dirPage--;
        renderDirectoryPage();
      }
    });

    document.getElementById('dir-next-btn').addEventListener('click', () => {
      const totalPages = Math.max(1, Math.ceil(state.dirFiltered.length / state.dirPageSize));
      if (state.dirPage < totalPages) {
        state.dirPage++;
        renderDirectoryPage();
      }
    });

    document.getElementById('btn-export-csv').addEventListener('click', exportDirectoryCSV);
    applyDirectoryFilters();
  }

  function applyDirectoryFilters() {
    const businesses = state.data.businesses || [];
    const q = document.getElementById('dir-search').value.trim().toLowerCase();
    const mkz = document.getElementById('dir-markaz').value;
    const sec = document.getElementById('dir-sector').value;
    const conf = document.getElementById('dir-conf').value;
    const phoneOnly = document.getElementById('dir-phone-only').checked;

    state.dirFiltered = businesses.filter(row => {
      if (mkz && safeStr(row[3], '') !== mkz) return false;
      if (sec && safeStr(row[1], '') !== sec) return false;
      if (conf && safeStr(row[8], '') !== conf) return false;
      if (phoneOnly && !safeStr(row[6], '')) return false;
      if (q) {
        const hay = `${row[0] || ''} ${row[2] || ''} ${row[4] || ''} ${row[5] || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    document.getElementById('dir-count-badge').textContent = `${fmtNum(state.dirFiltered.length)} سجل`;
    renderDirectoryPage();
  }

  function renderDirectoryPage() {
    const tbody = document.getElementById('dir-table-body');
    const total = state.dirFiltered.length;
    const totalPages = Math.max(1, Math.ceil(total / state.dirPageSize));
    const start = (state.dirPage - 1) * state.dirPageSize;
    const slice = state.dirFiltered.slice(start, start + state.dirPageSize);

    if (!slice.length) {
      tbody.innerHTML = '<tr><td colspan="10" class="empty-state">لا توجد سجلات مطابقة لمعايير البحث.</td></tr>';
    } else {
      tbody.innerHTML = slice.map((r, idx) => `
        <tr>
          <td>${fmtNum(start + idx + 1)}</td>
          <td><strong>${escapeHtml(safeStr(r[0]))}</strong></td>
          <td><span class="badge badge-teal">${escapeHtml(safeStr(r[1]))}</span></td>
          <td>${escapeHtml(safeStr(r[2]))}</td>
          <td>${escapeHtml(safeStr(r[3]))}</td>
          <td>${escapeHtml(safeStr(r[4]))}</td>
          <td>${escapeHtml(safeStr(r[5]))}</td>
          <td dir="ltr" style="text-align:right;">${escapeHtml(safeStr(r[6]))}</td>
          <td>${r[7] ? `${escapeHtml(r[7])} ⭐` : '—'}</td>
          <td><span class="badge badge-slate">${escapeHtml(safeStr(r[8]))}</span></td>
        </tr>
      `).join('');
    }

    document.getElementById('dir-page-info').textContent =
      `صفحة ${fmtNum(state.dirPage)} من ${fmtNum(totalPages)} (إجمالي ${fmtNum(total)} سجل)`;
    document.getElementById('dir-prev-btn').disabled = state.dirPage <= 1;
    document.getElementById('dir-next-btn').disabled = state.dirPage >= totalPages;
  }

  function exportDirectoryCSV() {
    const headers = ['اسم النشاط', 'القطاع الموحد', 'الفئة الرئيسية', 'المركز', 'المدينة/القرية', 'الشارع', 'الهاتف', 'التقييم', 'مستوى الثقة'];
    const escapeCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [headers.map(escapeCell).join(',')];
    state.dirFiltered.forEach(row => {
      lines.push([0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => escapeCell(row[i])).join(','));
    });

    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kafr_elsheikh_directory_${state.dirFiltered.length}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* -------------------- Bootstrap -------------------- */
  async function init() {
    try {
      state.data = await loadData();

      document.querySelectorAll('.nav-tab').forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
      });
      const gotoCat = document.getElementById('btn-goto-catalog');
      if (gotoCat) gotoCat.addEventListener('click', () => switchView('catalog'));

      initThemeToggle();
      initModalEvents();
      renderDashboard();
      initMapControls();
      initCatalog();
      initCompare();
      initFeasibility();
      initDirectory();

      const overlay = document.getElementById('loading-overlay');
      if (overlay) overlay.style.display = 'none';
    } catch (err) {
      console.error(err);
      const errEl = document.getElementById('loading-error');
      if (errEl) {
        errEl.style.display = 'block';
        errEl.textContent = `تعذر تحميل بيانات المنصة: ${err.message}. تأكد من وجود ملف platform_data.json بجانب index.html.`;
      }
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
