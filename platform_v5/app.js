/* ==========================================================================
   Kafr El-Sheikh Smart Investment Platform — V5 Institutional Investor Edition
   ========================================================================== */

(() => {
  'use strict';

  const state = {
    data: null,
    currency: 'EGP',
    fxRate: 50,
    theme: 'dark',
    activeView: 'dashboard',
    comparatorMode: 'activities',
    activeModalActivity: null,
    charts: {
      riskReturn: null,
      sectorTam: null,
      comparator: null
    },
    map: null,
    mapLayers: null,
    dir: {
      filtered: [],
      page: 1,
      pageSize: 25
    }
  };

  // ========================================================================
  // Formatting & Financial Utilities
  // ========================================================================
  function getFxRate() {
    return (state.data && state.data.meta && Number(state.data.meta.fx_rate_egp_per_usd)) || state.fxRate || 50;
  }

  function convertEgp(amountEgp) {
    const val = Number(amountEgp) || 0;
    return state.currency === 'USD' ? val / getFxRate() : val;
  }

  function formatMoney(amountEgp, compact = true) {
    const val = convertEgp(amountEgp);
    const sym = state.currency === 'USD' ? '$' : 'ج.م';
    const abs = Math.abs(val);
    const sign = val < 0 ? '-' : '';
    if (compact) {
      if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B ${sym}`;
      if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M ${sym}`;
      if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}K ${sym}`;
    }
    return `${sign}${Math.round(abs).toLocaleString('en-US')} ${sym}`;
  }

  function formatMillions(amountEgpM) {
    return formatMoney((Number(amountEgpM) || 0) * 1e6, true);
  }

  function formatPct(val, digits = 1) {
    const n = Number(val);
    if (!Number.isFinite(n)) return '--';
    return `${n.toFixed(digits)}%`;
  }

  function formatNum(val, digits = 0) {
    const n = Number(val);
    if (!Number.isFinite(n)) return '--';
    return n.toLocaleString('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function quadrantColor(q) {
    switch (q) {
      case 'الفرص الذهبية': return '#f59e0b';
      case 'نمو انتقائي': return '#38bdf8';
      case 'سيولة مستقرة': return '#10b981';
      case 'تحوط ومراقبة': return '#ef4444';
      default: return '#94a3b8';
    }
  }

  function quadrantBadgeClass(q) {
    switch (q) {
      case 'الفرص الذهبية': return 'badge-gold';
      case 'نمو انتقائي': return 'badge-cyan';
      case 'سيولة مستقرة': return 'badge-emerald';
      case 'تحوط ومراقبة': return 'badge-red';
      default: return 'badge-info';
    }
  }

  function confBadgeClass(conf) {
    if (conf === 'High') return 'badge-high';
    if (conf === 'Medium') return 'badge-med';
    return 'badge-low';
  }

  function getChartColors() {
    const isLight = state.theme === 'light';
    return {
      text: isLight ? '#334155' : '#cbd5e1',
      grid: isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(148, 163, 184, 0.14)',
      tooltipBg: isLight ? '#0f172a' : '#1e293b'
    };
  }

  // 5-Year IRR via Bisection (robust for any cash flow sign)
  function computeIrr5Yr(capex, annualCf) {
    if (capex <= 0 || annualCf <= 0) return -100;
    if (annualCf * 5 <= capex) {
      return ((annualCf * 5 - capex) / capex) * 20;
    }
    let low = -0.5;
    let high = 3.0;
    for (let i = 0; i < 40; i++) {
      const mid = (low + high) / 2;
      let npv = -capex;
      for (let t = 1; t <= 5; t++) {
        npv += annualCf / Math.pow(1 + mid, t);
      }
      if (npv > 0) low = mid;
      else high = mid;
    }
    return ((low + high) / 2) * 100;
  }

  function computeNpv5Yr(capex, annualCf, discountRatePct) {
    const r = (Number(discountRatePct) || 18) / 100;
    let npv = -capex;
    for (let t = 1; t <= 5; t++) {
      npv += annualCf / Math.pow(1 + r, t);
    }
    return npv;
  }

  // Normalize activity fields defensively (supports both V5 & V4 fallback)
  function getActCapex(a) {
    return Number(a.capex_egp) || Math.round(((Number(a.capital_min_egp) || 500000) + (Number(a.capital_max_egp) || 1500000)) / 2);
  }
  function getActMonthlyRev(a) {
    return Number(a.monthly_revenue_est_egp) || 150000;
  }
  function getActMonthlyOpex(a) {
    if (Number.isFinite(Number(a.monthly_opex_egp))) return Number(a.monthly_opex_egp);
    const margin = (Number(a.ebitda_margin_pct) || Number(a.profit_margin_pct) || 20) / 100;
    return getActMonthlyRev(a) * (1 - margin);
  }
  function getActIrr(a) {
    if (Number.isFinite(Number(a.irr_5yr_pct))) return Number(a.irr_5yr_pct);
    const annualProfit = (getActMonthlyRev(a) - getActMonthlyOpex(a)) * 12;
    return computeIrr5Yr(getActCapex(a), annualProfit);
  }
  function getActRoi(a) {
    if (Number.isFinite(Number(a.roi_annual_pct))) return Number(a.roi_annual_pct);
    const annualProfit = (getActMonthlyRev(a) - getActMonthlyOpex(a)) * 12;
    return (annualProfit / getActCapex(a)) * 100;
  }
  function getActNpv(a) {
    if (Number.isFinite(Number(a.npv_egp))) return Number(a.npv_egp);
    const annualProfit = (getActMonthlyRev(a) - getActMonthlyOpex(a)) * 12;
    return computeNpv5Yr(getActCapex(a), annualProfit, 18);
  }
  function getActPayback(a) {
    return Number(a.break_even_months) || Number(a.payback_months) || 24;
  }
  function getActRisk(a) {
    return Number.isFinite(Number(a.risk_score)) ? Number(a.risk_score) : Math.max(15, 100 - (Number(a.opportunity_score) || 70));
  }
  function getActQuadrant(a) {
    if (a.quadrant) return a.quadrant;
    const irr = getActIrr(a);
    const risk = getActRisk(a);
    if (irr >= 35 && risk <= 45) return 'الفرص الذهبية';
    if (irr >= 35 && risk > 45) return 'نمو انتقائي';
    if (irr < 35 && risk <= 45) return 'سيولة مستقرة';
    return 'تحوط ومراقبة';
  }

  // ========================================================================
  // Data Loading & Initialization
  // ========================================================================
  async function loadData() {
    if (window.PLATFORM_DATA) {
      return window.PLATFORM_DATA;
    }
    const resp = await fetch('./platform_data_v5.json');
    if (!resp.ok) {
      throw new Error(`فشل تحميل ملف البيانات (${resp.status})`);
    }
    return await resp.json();
  }

  async function init() {
    try {
      state.data = await loadData();
      state.fxRate = getFxRate();
      populateFilters();
      bindEvents();
      renderAll();
      document.getElementById('loadingOverlay').classList.add('hidden');
    } catch (err) {
      console.error(err);
      document.getElementById('loadingOverlay').innerHTML = `
        <div class="loading-card">
          <div class="loading-title" style="color:#ef4444;">تعذر تحميل بيانات المنصة</div>
          <div class="loading-sub">${escapeHtml(err.message)}</div>
        </div>
      `;
    }
  }

  function renderAll() {
    renderTopbar();
    renderDashboard();
    renderExplorer();
    renderComparator();
    renderSimulator();
    renderDirectory();
    if (state.map) {
      renderMapLayers();
    }
    if (state.activeModalActivity) {
      openTearSheet(state.activeModalActivity);
    }
  }

  // ========================================================================
  // Topbar & Navigation
  // ========================================================================
  function renderTopbar() {
    const meta = state.data.meta || {};
    const avgQ = meta.avg_data_quality_score ?? 78.5;
    document.getElementById('topQualityScore').textContent = formatNum(avgQ, 1);
    document.getElementById('fxRateLabel').textContent = `1 USD = ${formatNum(getFxRate(), 1)} EGP`;
  }

  function switchView(viewName) {
    state.activeView = viewName;
    document.querySelectorAll('.nav-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });
    document.querySelectorAll('.view-section').forEach(sec => {
      sec.classList.toggle('active', sec.id === `view-${viewName}`);
    });
    if (viewName === 'map') {
      initMapIfNeeded();
      setTimeout(() => {
        if (state.map) state.map.invalidateSize();
      }, 80);
    }
  }

  // ========================================================================
  // VIEW 1: EXECUTIVE DASHBOARD
  // ========================================================================
  function renderDashboard() {
    const { meta = {}, markaz_info = [], sectors_summary = [], activities_catalog = [], businesses = [] } = state.data;

    // KPI 1: Total Businesses
    const totalBiz = meta.total_businesses || businesses.length;
    document.getElementById('kpiTotalBusinesses').textContent = formatNum(totalBiz);
    document.getElementById('kpiBusinessesMeta').textContent = `عبر ${meta.total_markaz || markaz_info.length} مركزاً و${meta.total_localities || '--'} وحدة محلية`;

    // KPI 2: Total TAM
    const totalTamM = meta.total_tam_egp_m || sectors_summary.reduce((s, x) => s + (Number(x.tam_egp_m) || 0), 0);
    document.getElementById('kpiTotalTam').textContent = formatMillions(totalTamM);

    // KPI 3: Avg IRR
    const avgIrr = activities_catalog.length
      ? activities_catalog.reduce((s, a) => s + getActIrr(a), 0) / activities_catalog.length
      : 0;
    document.getElementById('kpiAvgIrr').textContent = formatPct(avgIrr, 1);

    // KPI 4: Data Quality
    const avgQ = meta.avg_data_quality_score ?? 78.5;
    document.getElementById('kpiDataQuality').textContent = `${formatNum(avgQ, 1)}%`;

    // KPI 5: Top Opportunity
    const topAct = [...activities_catalog].sort((a, b) => (b.opportunity_score || 0) - (a.opportunity_score || 0))[0];
    if (topAct) {
      document.getElementById('kpiTopOppName').textContent = topAct.name;
      document.getElementById('kpiTopOppMeta').textContent = `فرصة ${topAct.opportunity_score}/100 • IRR ${formatPct(getActIrr(topAct), 1)}`;
    }

    // KPI 6: Sectors
    document.getElementById('kpiTotalSectors').textContent = formatNum(meta.total_sectors || sectors_summary.length);
    document.getElementById('kpiCatalogCount').textContent = `${activities_catalog.length} نموذج نشاط استثماري`;

    // Governance counts
    let hi = 0, med = 0, lo = 0;
    for (const b of businesses) {
      const c = b[8];
      if (c === 'High') hi++;
      else if (c === 'Medium') med++;
      else lo++;
    }
    document.getElementById('govHighCount').textContent = `${formatNum(hi)} سجل (${formatPct(totalBiz ? (hi / totalBiz) * 100 : 0)})`;
    document.getElementById('govMedCount').textContent = `${formatNum(med)} سجل (${formatPct(totalBiz ? (med / totalBiz) * 100 : 0)})`;
    document.getElementById('govLowCount').textContent = `${formatNum(lo)} سجل (${formatPct(totalBiz ? (lo / totalBiz) * 100 : 0)})`;
    document.getElementById('govAvgScore').textContent = `متوسط الجودة: ${formatNum(avgQ, 1)}%`;

    renderRiskReturnChart(activities_catalog);
    renderSectorTamChart(sectors_summary);
    renderMarkazTable(markaz_info);
  }

  function renderRiskReturnChart(activities) {
    const ctx = document.getElementById('riskReturnChart');
    if (!ctx) return;
    if (state.charts.riskReturn) state.charts.riskReturn.destroy();

    const colors = getChartColors();
    const quadrants = ['الفرص الذهبية', 'نمو انتقائي', 'سيولة مستقرة', 'تحوط ومراقبة'];
    const datasets = quadrants.map(q => ({
      label: q,
      backgroundColor: quadrantColor(q) + 'cc',
      borderColor: quadrantColor(q),
      borderWidth: 1.5,
      pointRadius: 7,
      pointHoverRadius: 10,
      data: activities
        .filter(a => getActQuadrant(a) === q)
        .map(a => ({
          x: getActRisk(a),
          y: Number(getActIrr(a).toFixed(1)),
          activity: a
        }))
    }));

    state.charts.riskReturn = new Chart(ctx, {
      type: 'scatter',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (evt, elements) => {
          if (elements && elements.length > 0) {
            const el = elements[0];
            const pt = state.charts.riskReturn.data.datasets[el.datasetIndex].data[el.index];
            if (pt && pt.activity) openTearSheet(pt.activity);
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: colors.tooltipBg,
            callbacks: {
              label: (ctxItem) => {
                const a = ctxItem.raw.activity;
                return [
                  `${a.name}`,
                  `IRR: ${formatPct(getActIrr(a))} | المخاطرة: ${getActRisk(a)}/100`,
                  `CAPEX: ${formatMoney(getActCapex(a))} | انقر للتفاصيل`
                ];
              }
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: 'درجة المخاطرة (Risk Score)', color: colors.text },
            ticks: { color: colors.text },
            grid: { color: colors.grid }
          },
          y: {
            title: { display: true, text: 'معدل العائد الداخلي IRR (%)', color: colors.text },
            ticks: { color: colors.text },
            grid: { color: colors.grid }
          }
        }
      }
    });
  }

  function renderSectorTamChart(sectors) {
    const ctx = document.getElementById('sectorTamChart');
    if (!ctx) return;
    if (state.charts.sectorTam) state.charts.sectorTam.destroy();

    const colors = getChartColors();
    const top10 = [...sectors]
      .sort((a, b) => (Number(b.tam_egp_m) || b.count || 0) - (Number(a.tam_egp_m) || a.count || 0))
      .slice(0, 10);

    const fx = state.currency === 'USD' ? getFxRate() : 1;
    const unit = state.currency === 'USD' ? 'مليون $' : 'مليون ج.م';

    state.charts.sectorTam = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: top10.map(s => s.sector.length > 22 ? s.sector.slice(0, 22) + '…' : s.sector),
        datasets: [
          {
            label: `TAM (${unit})`,
            data: top10.map(s => Number(((Number(s.tam_egp_m) || 0) / fx).toFixed(2))),
            backgroundColor: '#38bdf8cc'
          },
          {
            label: `SAM (${unit})`,
            data: top10.map(s => Number(((Number(s.sam_egp_m) || 0) / fx).toFixed(2))),
            backgroundColor: '#10b981cc'
          },
          {
            label: `SOM (${unit})`,
            data: top10.map(s => Number(((Number(s.som_egp_m) || 0) / fx).toFixed(2))),
            backgroundColor: '#f59e0bcc'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: colors.text, font: { family: 'Cairo' } } },
          tooltip: { backgroundColor: colors.tooltipBg }
        },
        scales: {
          x: { ticks: { color: colors.text, font: { size: 11 } }, grid: { display: false } },
          y: { ticks: { color: colors.text }, grid: { color: colors.grid } }
        }
      }
    });
  }

  function renderMarkazTable(markazList) {
    const tbody = document.getElementById('markazSummaryBody');
    const sorted = [...markazList].sort((a, b) => (b.opportunity_score || 0) - (a.opportunity_score || 0));
    tbody.innerHTML = sorted.map(m => {
      const oppClass = (m.opportunity_score || 0) >= 75 ? 'badge-emerald' : (m.opportunity_score || 0) >= 60 ? 'badge-gold' : 'badge-red';
      const hhi = Number(m.hhi_index) || 0;
      const density = Number(m.per_10k_density) || (m.population_est ? (m.business_count / m.population_est) * 10000 : 0);
      return `
        <tr>
          <td><strong>${escapeHtml(m.name)}</strong></td>
          <td class="num">${formatNum(m.population_est)}</td>
          <td class="num">${formatNum(m.business_count)}</td>
          <td class="num">${formatNum(density, 1)}</td>
          <td class="num">${formatNum(hhi, 0)}</td>
          <td class="num">${formatMillions(m.tam_egp_m || 0)}</td>
          <td><span class="badge ${oppClass} num">${formatNum(m.opportunity_score, 0)}/100</span></td>
          <td class="num">${formatNum(m.data_quality_score ?? 78, 1)}%</td>
        </tr>
      `;
    }).join('');
  }

  // ========================================================================
  // VIEW 2: INTERACTIVE MAP (LEAFLET)
  // ========================================================================
  function initMapIfNeeded() {
    if (state.map) return;
    state.map = L.map('marketMap', { zoomControl: true }).setView([31.25, 30.92], 10);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 18
    }).addTo(state.map);
    state.mapLayers = L.layerGroup().addTo(state.map);
    renderMapLayers();
  }

  function renderMapLayers() {
    if (!state.map || !state.mapLayers) return;
    state.mapLayers.clearLayers();

    const mode = document.getElementById('mapLayerMode').value;
    const sectorFilter = document.getElementById('mapSectorFilter').value;
    const { markaz_info = [], geocoded_points = [] } = state.data;
    let countShown = 0;

    if (mode !== 'gps') {
      markaz_info.forEach(m => {
        if (!m.lat || !m.lng) return;
        let metricVal = m.opportunity_score || 50;
        let color = '#10b981';
        let label = `مؤشر الفرصة: ${metricVal}/100`;

        if (mode === 'saturation') {
          metricVal = m.saturation_index || 50;
          color = metricVal > 70 ? '#ef4444' : metricVal > 45 ? '#f59e0b' : '#10b981';
          label = `مؤشر التشبع: ${metricVal}/100`;
        } else if (mode === 'hhi') {
          metricVal = Number(m.hhi_index) || 1200;
          color = metricVal > 2000 ? '#ef4444' : metricVal > 1400 ? '#f59e0b' : '#38bdf8';
          label = `مؤشر التركز HHI: ${formatNum(metricVal)}`;
        } else {
          color = metricVal >= 75 ? '#10b981' : metricVal >= 60 ? '#f59e0b' : '#38bdf8';
        }

        const radius = Math.max(1200, Math.min(5200, (m.business_count || 100) * 6));
        const circle = L.circle([m.lat, m.lng], {
          color,
          fillColor: color,
          fillOpacity: 0.3,
          weight: 2,
          radius
        });
        circle.bindPopup(`
          <div style="direction:rtl;font-family:Cairo,sans-serif;min-width:190px;">
            <strong>${escapeHtml(m.name)}</strong><br/>
            <span>${label}</span><br/>
            <span>الأنشطة: ${formatNum(m.business_count)}</span><br/>
            <span>TAM: ${formatMillions(m.tam_egp_m || 0)}</span>
          </div>
        `);
        circle.addTo(state.mapLayers);
        countShown++;
      });
    }

    if (mode === 'gps' || mode === 'both') {
      const pts = geocoded_points.filter(p => sectorFilter === 'ALL' || p.Normalized_Sector === sectorFilter);
      pts.forEach(p => {
        if (!p.lat || !p.lng) return;
        const marker = L.circleMarker([p.lat, p.lng], {
          radius: 6,
          color: '#ffffff',
          weight: 1.5,
          fillColor: '#f59e0b',
          fillOpacity: 0.92
        });
        marker.bindPopup(`
          <div style="direction:rtl;font-family:Cairo,sans-serif;min-width:190px;">
            <strong>${escapeHtml(p.name)}</strong><br/>
            <span style="color:#64748b;">${escapeHtml(p.Normalized_Sector || p.cat)}</span><br/>
            <span>المركز: ${escapeHtml(p.markaz)}</span><br/>
            ${p.phone ? `<span>الهاتف: ${escapeHtml(p.phone)}</span><br/>` : ''}
            ${p.rating ? `<span>التقييم: ⭐ ${escapeHtml(p.rating)} (${escapeHtml(p.reviews || 0)})</span>` : ''}
          </div>
        `);
        marker.addTo(state.mapLayers);
        countShown++;
      });
    }

    document.getElementById('mapPointsCount').textContent = formatNum(countShown);
  }

  // ========================================================================
  // VIEW 3: MARKET & DEAL EXPLORER + TEAR SHEET MODAL
  // ========================================================================
  function renderExplorer() {
    const qText = document.getElementById('expSearch').value.trim().toLowerCase();
    const quad = document.getElementById('expQuadrant').value;
    const status = document.getElementById('expStatus').value;
    const sector = document.getElementById('expSector').value;
    const maxCap = Number(document.getElementById('expMaxCap').value);

    document.getElementById('expMaxCapLabel').textContent = maxCap >= 15000000 ? 'الكل' : formatMoney(maxCap);

    const list = (state.data.activities_catalog || []).filter(a => {
      if (quad !== 'ALL' && getActQuadrant(a) !== quad) return false;
      if (status !== 'ALL' && a.status !== status) return false;
      if (sector !== 'ALL' && a.sector !== sector) return false;
      if (maxCap < 15000000 && getActCapex(a) > maxCap) return false;
      if (qText) {
        const hay = `${a.name} ${a.sector} ${a.description || ''}`.toLowerCase();
        if (!hay.includes(qText)) return false;
      }
      return true;
    });

    document.getElementById('explorerCount').textContent = formatNum(list.length);
    const grid = document.getElementById('explorerGrid');

    if (!list.length) {
      grid.innerHTML = `<div class="panel" style="grid-column:1/-1;text-align:center;color:var(--text-secondary);">لا توجد أنشطة مطابقة لمعايير التصفية الحالية.</div>`;
      return;
    }

    grid.innerHTML = list.map(a => {
      const q = getActQuadrant(a);
      return `
        <article class="deal-card" data-act-id="${escapeHtml(a.id)}">
          <div>
            <div class="deal-card-top">
              <span class="badge ${quadrantBadgeClass(q)}">${escapeHtml(q)}</span>
              <span class="badge badge-info num">فرصة ${a.opportunity_score}/100</span>
            </div>
            <h3 class="deal-title">${escapeHtml(a.name)}</h3>
            <div class="deal-sector">${escapeHtml(a.sector)} • ${escapeHtml(a.status)}</div>
          </div>
          <div class="deal-metrics">
            <div class="deal-metric-item">
              <div class="deal-metric-label">IRR 5Y</div>
              <div class="deal-metric-val num accent-emerald-text">${formatPct(getActIrr(a))}</div>
            </div>
            <div class="deal-metric-item">
              <div class="deal-metric-label">ROI سنوي</div>
              <div class="deal-metric-val num accent-cyan-text">${formatPct(getActRoi(a))}</div>
            </div>
            <div class="deal-metric-item">
              <div class="deal-metric-label">الاسترداد</div>
              <div class="deal-metric-val num">${getActPayback(a)} شهر</div>
            </div>
            <div class="deal-metric-item">
              <div class="deal-metric-label">CAPEX</div>
              <div class="deal-metric-val num">${formatMoney(getActCapex(a))}</div>
            </div>
          </div>
          <div class="deal-footer">
            <span>المراكز: ${escapeHtml((a.best_markaz || []).slice(0, 2).join('، '))}</span>
            <span style="color:var(--emerald);font-weight:700;">فتح بطاقة الاستثمار ←</span>
          </div>
        </article>
      `;
    }).join('');

    grid.querySelectorAll('.deal-card').forEach(card => {
      card.addEventListener('click', () => {
        const act = state.data.activities_catalog.find(x => x.id === card.dataset.actId);
        if (act) openTearSheet(act);
      });
    });
  }

  function openTearSheet(a) {
    state.activeModalActivity = a;
    const modal = document.getElementById('tearSheetModal');
    const q = getActQuadrant(a);

    document.getElementById('tsBadges').innerHTML = `
      <span class="badge ${quadrantBadgeClass(q)}">${escapeHtml(q)}</span>
      <span class="badge badge-info">${escapeHtml(a.status)}</span>
      <span class="badge badge-emerald num">مؤشر الفرصة: ${a.opportunity_score}/100</span>
      <span class="badge badge-violet num">المخاطرة: ${getActRisk(a)}/100</span>
    `;
    document.getElementById('tsTitle').textContent = a.name;
    document.getElementById('tsSector').textContent = `${a.sector} • اتجاه الطلب: ${a.demand_trend || 'مستقر'}`;
    document.getElementById('tsDescription').textContent = a.description || '';

    const capex = getActCapex(a);
    const opex = getActMonthlyOpex(a);
    const ebitda = a.ebitda_margin_pct ?? a.profit_margin_pct ?? 22;

    document.getElementById('tsFinancialGrid').innerHTML = `
      <div class="ts-metric"><div class="ts-metric-label">رأس المال (CAPEX)</div><div class="ts-metric-val num">${formatMoney(capex)}</div></div>
      <div class="ts-metric"><div class="ts-metric-label">التشغيل الشهري (OPEX)</div><div class="ts-metric-val num">${formatMoney(opex)}</div></div>
      <div class="ts-metric"><div class="ts-metric-label">هامش EBITDA</div><div class="ts-metric-val num accent-cyan-text">${formatPct(ebitda)}</div></div>
      <div class="ts-metric"><div class="ts-metric-label">IRR (5 سنوات)</div><div class="ts-metric-val num accent-emerald-text">${formatPct(getActIrr(a))}</div></div>
      <div class="ts-metric"><div class="ts-metric-label">صافي القيمة (NPV)</div><div class="ts-metric-val num">${formatMoney(getActNpv(a))}</div></div>
      <div class="ts-metric"><div class="ts-metric-label">العائد السنوي (ROI)</div><div class="ts-metric-val num accent-gold-text">${formatPct(getActRoi(a))}</div></div>
      <div class="ts-metric"><div class="ts-metric-label">فترة الاسترداد</div><div class="ts-metric-val num">${getActPayback(a)} شهر</div></div>
      <div class="ts-metric"><div class="ts-metric-label">الإيراد الشهري المتوقع</div><div class="ts-metric-val num">${formatMoney(getActMonthlyRev(a))}</div></div>
    `;

    document.getElementById('tsTamGrid').innerHTML = `
      <div class="ts-metric"><div class="ts-metric-label">السوق الكلي (TAM)</div><div class="ts-metric-val num">${formatMillions(a.tam_egp_m || 45)}</div></div>
      <div class="ts-metric"><div class="ts-metric-label">السوق المتاح (SAM)</div><div class="ts-metric-val num">${formatMillions(a.sam_egp_m || 18)}</div></div>
      <div class="ts-metric"><div class="ts-metric-label">الحصة المستهدفة (SOM)</div><div class="ts-metric-val num">${formatMillions(a.som_egp_m || 5)}</div></div>
    `;

    // 3 Scenarios
    const sc = a.scenarios || {};
    const rows = [
      { key: 'conservative', label: 'متحفظ (Conservative)', mult: 0.8 },
      { key: 'base', label: 'أساسي (Base Case)', mult: 1.0 },
      { key: 'optimistic', label: 'متفائل (Optimistic)', mult: 1.2 }
    ];
    document.getElementById('tsScenariosBody').innerHTML = rows.map(r => {
      const sObj = sc[r.key];
      const annRev = sObj && sObj.annual_revenue_egp ? sObj.annual_revenue_egp : getActMonthlyRev(a) * 12 * r.mult;
      const annProf = sObj && sObj.annual_profit_egp ? sObj.annual_profit_egp : Math.max(0, annRev - getActMonthlyOpex(a) * 12);
      const irr = sObj && Number.isFinite(Number(sObj.irr_pct)) ? Number(sObj.irr_pct) : computeIrr5Yr(capex, annProf);
      const pb = sObj && sObj.payback_months ? sObj.payback_months : (annProf > 0 ? Math.round((capex / annProf) * 12) : 99);
      return `
        <tr>
          <td><strong>${r.label}</strong></td>
          <td class="num">${formatMoney(annRev)}</td>
          <td class="num">${formatMoney(annProf)}</td>
          <td class="num">${formatPct(irr)}</td>
          <td class="num">${pb} شهر</td>
        </tr>
      `;
    }).join('');

    document.getElementById('tsLicenses').innerHTML = (a.licenses || []).map(x => `<li>${escapeHtml(x)}</li>`).join('');
    document.getElementById('tsSuccess').innerHTML = (a.success_factors || []).map(x => `<li>${escapeHtml(x)}</li>`).join('');
    document.getElementById('tsRisks').innerHTML = (a.risks || []).map(x => `<li>${escapeHtml(x)}</li>`).join('');
    document.getElementById('tsProvenance').textContent = a.data_provenance || 'مُعاير من بيانات السوق الميدانية لمحافظة كفر الشيخ ونماذج الجدوى القطاعية.';
    document.getElementById('tsBestMarkaz').textContent = (a.best_markaz || []).join('، ');

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeTearSheet() {
    state.activeModalActivity = null;
    const modal = document.getElementById('tearSheetModal');
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }

  // ========================================================================
  // VIEW 4: SIDE-BY-SIDE INSTITUTIONAL COMPARATOR
  // ========================================================================
  function populateComparatorSelects() {
    const s1 = document.getElementById('compSelect1');
    const s2 = document.getElementById('compSelect2');
    const s3 = document.getElementById('compSelect3');

    if (state.comparatorMode === 'activities') {
      const acts = state.data.activities_catalog || [];
      const opts = acts.map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>`).join('');
      s1.innerHTML = opts;
      s2.innerHTML = opts;
      s3.innerHTML = `<option value="">-- بدون عنصر ثالث --</option>` + opts;
      if (acts[0]) s1.value = acts[0].id;
      if (acts[1]) s2.value = acts[1].id;
      if (acts[2]) s3.value = acts[2].id;
    } else {
      const mks = state.data.markaz_info || [];
      const opts = mks.map(m => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`).join('');
      s1.innerHTML = opts;
      s2.innerHTML = opts;
      s3.innerHTML = `<option value="">-- بدون مركز ثالث --</option>` + opts;
      if (mks[0]) s1.value = mks[0].name;
      if (mks[1]) s2.value = mks[1].name;
      if (mks[2]) s3.value = mks[2].name;
    }
  }

  function renderComparator() {
    const v1 = document.getElementById('compSelect1').value;
    const v2 = document.getElementById('compSelect2').value;
    const v3 = document.getElementById('compSelect3').value;
    const ids = [v1, v2, v3].filter(Boolean);

    const thead = document.getElementById('compTableHead');
    const tbody = document.getElementById('compTableBody');
    const ctx = document.getElementById('comparatorChart');
    if (state.charts.comparator) state.charts.comparator.destroy();
    const colors = getChartColors();
    const palette = ['#10b981', '#38bdf8', '#f59e0b'];

    if (state.comparatorMode === 'activities') {
      const items = ids.map(id => state.data.activities_catalog.find(a => a.id === id)).filter(Boolean);
      if (!items.length) return;

      document.getElementById('compTableTitle').textContent = 'مقارنة الأنشطة الاستثمارية';
      document.getElementById('compChartTitle').textContent = 'مخطط الرادار للمؤشرات المؤسسية (Radar Chart)';

      thead.innerHTML = `<tr><th>المؤشر</th>${items.map(a => `<th>${escapeHtml(a.name)}</th>`).join('')}</tr>`;
      const metrics = [
        { label: 'الربع الاستثماري', fn: a => `<span class="badge ${quadrantBadgeClass(getActQuadrant(a))}">${escapeHtml(getActQuadrant(a))}</span>` },
        { label: 'رأس المال (CAPEX)', fn: a => formatMoney(getActCapex(a)) },
        { label: 'IRR (5 سنوات)', fn: a => formatPct(getActIrr(a)) },
        { label: 'صافي القيمة الحالية (NPV)', fn: a => formatMoney(getActNpv(a)) },
        { label: 'العائد السنوي (ROI)', fn: a => formatPct(getActRoi(a)) },
        { label: 'فترة الاسترداد', fn: a => `${getActPayback(a)} شهر` },
        { label: 'درجة المخاطرة', fn: a => `${getActRisk(a)}/100` },
        { label: 'مؤشر الفرصة', fn: a => `${a.opportunity_score}/100` }
      ];
      tbody.innerHTML = metrics.map(m => `<tr><td><strong>${m.label}</strong></td>${items.map(a => `<td class="num">${m.fn(a)}</td>`).join('')}</tr>`).join('');

      state.charts.comparator = new Chart(ctx, {
        type: 'radar',
        data: {
          labels: ['مؤشر الفرصة', 'IRR (%)', 'ROI (%)', 'الأمان (100-المخاطرة)', 'سرعة الاسترداد'],
          datasets: items.map((a, i) => ({
            label: a.name.slice(0, 24),
            data: [
              a.opportunity_score || 70,
              Math.min(100, Math.max(0, getActIrr(a))),
              Math.min(100, Math.max(0, getActRoi(a))),
              Math.max(0, 100 - getActRisk(a)),
              Math.max(10, 100 - getActPayback(a) * 2)
            ],
            borderColor: palette[i % 3],
            backgroundColor: palette[i % 3] + '33',
            borderWidth: 2
          }))
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: colors.text, font: { family: 'Cairo' } } } },
          scales: {
            r: {
              angleLines: { color: colors.grid },
              grid: { color: colors.grid },
              pointLabels: { color: colors.text, font: { family: 'Cairo', size: 11 } },
              ticks: { display: false }
            }
          }
        }
      });
    } else {
      const items = ids.map(name => state.data.markaz_info.find(m => m.name === name)).filter(Boolean);
      if (!items.length) return;

      document.getElementById('compTableTitle').textContent = 'مقارنة المراكز الجغرافية';
      document.getElementById('compChartTitle').textContent = 'مقارنة المؤشرات السوقية للمراكز (Bar Chart)';

      thead.innerHTML = `<tr><th>المؤشر</th>${items.map(m => `<th>${escapeHtml(m.name)}</th>`).join('')}</tr>`;
      const metrics = [
        { label: 'عدد السكان (تقديري)', fn: m => formatNum(m.population_est) },
        { label: 'الأنشطة المسجلة', fn: m => formatNum(m.business_count) },
        { label: 'حجم السوق (TAM)', fn: m => formatMillions(m.tam_egp_m || 0) },
        { label: 'الكثافة لكل 10 آلاف نسمة', fn: m => formatNum(m.per_10k_density || 0, 1) },
        { label: 'مؤشر التركز HHI', fn: m => formatNum(m.hhi_index || 0, 0) },
        { label: 'مؤشر الفرصة', fn: m => `${formatNum(m.opportunity_score, 0)}/100` },
        { label: 'جودة البيانات', fn: m => `${formatNum(m.data_quality_score ?? 78, 1)}%` }
      ];
      tbody.innerHTML = metrics.map(m => `<tr><td><strong>${m.label}</strong></td>${items.map(x => `<td class="num">${m.fn(x)}</td>`).join('')}</tr>`).join('');

      state.charts.comparator = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['مؤشر الفرصة', 'جودة البيانات %', 'الكثافة / 10 آلاف', 'التشبع'],
          datasets: items.map((m, i) => ({
            label: m.name,
            data: [
              m.opportunity_score || 0,
              m.data_quality_score ?? 78,
              Number((m.per_10k_density || 0).toFixed(1)),
              m.saturation_index || 0
            ],
            backgroundColor: palette[i % 3] + 'cc'
          }))
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: colors.text, font: { family: 'Cairo' } } } },
          scales: {
            x: { ticks: { color: colors.text }, grid: { display: false } },
            y: { ticks: { color: colors.text }, grid: { color: colors.grid } }
          }
        }
      });
    }
  }

  // ========================================================================
  // VIEW 5: PRO FINANCIAL MODELER / SIMULATOR
  // ========================================================================
  function getSimulatorResult() {
    const actId = document.getElementById('simActivity').value;
    const markazName = document.getElementById('simMarkaz').value;
    const act = state.data.activities_catalog.find(a => a.id === actId) || state.data.activities_catalog[0];
    const mk = state.data.markaz_info.find(m => m.name === markazName) || state.data.markaz_info[0];

    const capex = Math.max(100000, Number(document.getElementById('simCapital').value) || getActCapex(act));
    const salesMult = Number(document.getElementById('simSalesSlider').value) / 100;
    const opexDelta = Number(document.getElementById('simOpexSlider').value) / 100;
    const discountRate = Number(document.getElementById('simDiscountSlider').value);

    const scaleFactor = capex / Math.max(1, getActCapex(act));
    const markazBonus = mk ? 0.9 + ((mk.opportunity_score || 70) / 350) : 1.0;

    const baseAnnRev = getActMonthlyRev(act) * 12 * Math.pow(scaleFactor, 0.85) * markazBonus;
    const baseAnnOpex = getActMonthlyOpex(act) * 12 * Math.pow(scaleFactor, 0.85);

    const annRev = baseAnnRev * salesMult;
    const annOpex = baseAnnOpex * (1 + opexDelta);
    const annProfit = annRev - annOpex;

    const irr = computeIrr5Yr(capex, annProfit);
    const npv = computeNpv5Yr(capex, annProfit, discountRate);
    const roi = (annProfit / capex) * 100;
    const payback = annProfit > 0 ? Math.round((capex / annProfit) * 12) : 999;

    return { act, mk, capex, salesMult, opexDelta, discountRate, annRev, annOpex, annProfit, irr, npv, roi, payback, baseAnnRev, baseAnnOpex };
  }

  function renderSimulator() {
    const res = getSimulatorResult();
    if (!res.act) return;

    document.getElementById('simCapitalLabel').textContent = formatMoney(res.capex);
    document.getElementById('simSalesVal').textContent = `${Math.round(res.salesMult * 100)}%`;
    document.getElementById('simOpexVal').textContent = `${res.opexDelta >= 0 ? '+' : ''}${Math.round(res.opexDelta * 100)}%`;
    document.getElementById('simDiscountVal').textContent = `${res.discountRate}%`;

    document.getElementById('simOutIrr').textContent = formatPct(res.irr, 1);
    document.getElementById('simOutNpv').textContent = formatMoney(res.npv);
    document.getElementById('simOutRoi').textContent = formatPct(res.roi, 1);
    document.getElementById('simOutPayback').textContent = res.payback >= 999 ? 'غير مسترد' : `${res.payback} شهر`;

    // Smart Verdict
    const vBox = document.getElementById('simVerdictBox');
    const vBadge = document.getElementById('simVerdictBadge');
    const vTitle = document.getElementById('simVerdictTitle');
    const vText = document.getElementById('simVerdictText');

    if (res.npv > 0 && res.irr >= res.discountRate + 10) {
      vBox.style.borderRightColor = 'var(--emerald)';
      vBadge.textContent = 'توصية قوية (GO)';
      vBadge.style.background = 'var(--emerald-soft)';
      vBadge.style.color = 'var(--emerald)';
      vTitle.textContent = `فرصة مجدية مؤسسياً في ${res.mk ? res.mk.name : 'كفر الشيخ'}`;
      vText.textContent = `يتجاوز معدل العائد الداخلي (${formatPct(res.irr)}) معدل الخصم (${res.discountRate}%) بهامش أمان مرتفع وصافي قيمة حالية موجب.`;
    } else if (res.npv > 0) {
      vBox.style.borderRightColor = 'var(--gold)';
      vBadge.textContent = 'جدوى مشروطة (SELECTIVE)';
      vBadge.style.background = 'var(--gold-soft)';
      vBadge.style.color = 'var(--gold)';
      vTitle.textContent = 'مجدٍ مع ضرورة ضبط التكاليف التشغيلية';
      vText.textContent = `صافي القيمة الحالية موجب (${formatMoney(res.npv)}) لكن المشروع حساس لتقلبات الإشغال أو زيادة OPEX.`;
    } else {
      vBox.style.borderRightColor = 'var(--red)';
      vBadge.textContent = 'تحفظ / إعادة هيكلة (HOLD)';
      vBadge.style.background = 'var(--red-soft)';
      vBadge.style.color = 'var(--red)';
      vTitle.textContent = 'العائد الحالي دون تكلفة رأس المال';
      vText.textContent = `عند معدل خصم ${res.discountRate}% يكون NPV سالباً. يُنصح بخفض CAPEX أو استهداف مركز أعلى طلباً.`;
    }

    // 3-Scenario Sensitivity Table
    const scenarios = [
      { name: 'متحفظ (إشغال -15%، تشغيل +8%)', revM: 0.85, opexM: 1.08 },
      { name: 'الأساسي الحالي (Current Model)', revM: 1.0, opexM: 1.0 },
      { name: 'متفائل (إشغال +15%، تشغيل -5%)', revM: 1.15, opexM: 0.95 }
    ];
    document.getElementById('simScenarioBody').innerHTML = scenarios.map(s => {
      const r = res.annRev * s.revM;
      const p = r - (res.annOpex * s.opexM);
      const irr = computeIrr5Yr(res.capex, p);
      const npv = computeNpv5Yr(res.capex, p, res.discountRate);
      const pb = p > 0 ? `${Math.round((res.capex / p) * 12)} شهر` : 'غير مسترد';
      return `
        <tr>
          <td><strong>${s.name}</strong></td>
          <td class="num">${formatMoney(r)}</td>
          <td class="num">${formatMoney(p)}</td>
          <td class="num">${formatPct(irr)}</td>
          <td class="num">${formatMoney(npv)}</td>
          <td class="num">${pb}</td>
        </tr>
      `;
    }).join('');

    // Top 3 Alternative Markaz
    const topMarkaz = [...state.data.markaz_info]
      .sort((a, b) => (b.opportunity_score || 0) - (a.opportunity_score || 0))
      .slice(0, 3);
    document.getElementById('simAltMarkaz').innerHTML = topMarkaz.map(m => `
      <div class="alt-markaz-card">
        <h4>${escapeHtml(m.name)}</h4>
        <p>مؤشر الفرصة: <strong class="num accent-emerald-text">${m.opportunity_score}/100</strong></p>
        <p>حجم السوق TAM: <strong class="num">${formatMillions(m.tam_egp_m || 0)}</strong></p>
        <p>الكثافة / 10 آلاف: <strong class="num">${formatNum(m.per_10k_density || 0, 1)}</strong></p>
      </div>
    `).join('');
  }

  // ========================================================================
  // VIEW 6: FULL RECORDS DIRECTORY + UTF-8 BOM CSV EXPORT
  // ========================================================================
  function filterDirectory() {
    const q = document.getElementById('dirSearch').value.trim().toLowerCase();
    const mk = document.getElementById('dirMarkaz').value;
    const sec = document.getElementById('dirSector').value;
    const conf = document.getElementById('dirConf').value;

    state.dir.filtered = (state.data.businesses || []).filter(b => {
      if (mk !== 'ALL' && b[3] !== mk) return false;
      if (sec !== 'ALL' && b[1] !== sec) return false;
      if (conf !== 'ALL' && b[8] !== conf) return false;
      if (q) {
        const hay = `${b[0]} ${b[1]} ${b[2]} ${b[3]} ${b[4]} ${b[5]} ${b[6]}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    state.dir.page = 1;
    renderDirectory();
  }

  function renderDirectory() {
    const { filtered, page, pageSize } = state.dir;
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    state.dir.page = safePage;

    document.getElementById('dirTotalMatched').textContent = formatNum(total);
    document.getElementById('dirPageInfo').textContent = `صفحة ${safePage} من ${totalPages}`;
    document.getElementById('dirPrevBtn').disabled = safePage <= 1;
    document.getElementById('dirNextBtn').disabled = safePage >= totalPages;

    const start = (safePage - 1) * pageSize;
    const slice = filtered.slice(start, start + pageSize);

    const tbody = document.getElementById('dirTableBody');
    if (!slice.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-secondary);">لا توجد سجلات مطابقة.</td></tr>`;
      return;
    }

    tbody.innerHTML = slice.map(b => `
      <tr>
        <td><strong>${escapeHtml(b[0])}</strong></td>
        <td>${escapeHtml(b[1])}</td>
        <td>${escapeHtml(b[3])}</td>
        <td>${escapeHtml(b[4] || '-')}</td>
        <td>${escapeHtml(b[5] || '-')}</td>
        <td class="num">${escapeHtml(b[6] || '-')}</td>
        <td class="num">${b[7] ? `⭐ ${escapeHtml(b[7])}` : '-'}</td>
        <td><span class="badge ${confBadgeClass(b[8])}">${escapeHtml(b[8] || 'Low')}</span></td>
      </tr>
    `).join('');
  }

  function exportDirectoryCsv() {
    const headers = ['اسم المنشأة', 'القطاع الموحد', 'التصنيف الأصلي', 'المركز', 'القرية/الحي', 'العنوان', 'الهاتف', 'التقييم', 'مستوى الثقة'];
    const rows = state.dir.filtered.map(b =>
      b.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
    );
    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kafr_elsheikh_directory_v5_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // ========================================================================
  // ONE-CLICK EXECUTIVE INVESTMENT MEMO (PRINT / PDF)
  // ========================================================================
  function printInvestmentMemo(payload) {
    const { activity, markazName, capex, irr, npv, roi, payback, annRev, annProfit, discountRate } = payload;
    const today = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
    const container = document.getElementById('print-memo');

    container.innerHTML = `
      <div class="pm-header">
        <div>
          <h1 class="pm-title">مذكرة استثمارية تنفيذية — ${escapeHtml(activity.name)}</h1>
          <p class="pm-sub">منصة كفر الشيخ الذكية للاستثمار ودراسة السوق (V5 Institutional) • القطاع: ${escapeHtml(activity.sector)}</p>
        </div>
        <div class="pm-meta">
          <div>التاريخ: ${today}</div>
          <div>العملة: ${state.currency} (1 USD = ${getFxRate()} EGP)</div>
          <div>المركز المستهدف: ${escapeHtml(markazName || (activity.best_markaz || [])[0] || 'كفر الشيخ')}</div>
        </div>
      </div>

      <div class="pm-grid-4">
        <div class="pm-kpi"><div class="pm-kpi-label">رأس المال المستثمر (CAPEX)</div><div class="pm-kpi-val num">${formatMoney(capex)}</div></div>
        <div class="pm-kpi"><div class="pm-kpi-label">معدل العائد الداخلي (IRR 5Y)</div><div class="pm-kpi-val num">${formatPct(irr)}</div></div>
        <div class="pm-kpi"><div class="pm-kpi-label">صافي القيمة الحالية (NPV @ ${discountRate}%)</div><div class="pm-kpi-val num">${formatMoney(npv)}</div></div>
        <div class="pm-kpi"><div class="pm-kpi-label">فترة الاسترداد / ROI</div><div class="pm-kpi-val num">${payback >= 999 ? 'غير مسترد' : payback + ' شهر'} / ${formatPct(roi)}</div></div>
      </div>

      <div class="pm-section">
        <h3>1. الملخص التنفيذي وحجم السوق (TAM / SAM / SOM)</h3>
        <p style="margin:0 0 6px;">${escapeHtml(activity.description || '')}</p>
        <table class="pm-table">
          <thead><tr><th>TAM (السوق الكلي)</th><th>SAM (السوق المتاح)</th><th>SOM (الحصة المستهدفة)</th><th>الربع الاستثماري</th><th>مؤشر الفرصة</th></tr></thead>
          <tbody>
            <tr>
              <td class="num">${formatMillions(activity.tam_egp_m || 45)}</td>
              <td class="num">${formatMillions(activity.sam_egp_m || 18)}</td>
              <td class="num">${formatMillions(activity.som_egp_m || 5)}</td>
              <td>${escapeHtml(getActQuadrant(activity))}</td>
              <td class="num">${activity.opportunity_score}/100</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="pm-section">
        <h3>2. التوقعات المالية وتحليل الحساسية</h3>
        <table class="pm-table">
          <thead><tr><th>السيناريو</th><th>الإيراد السنوي</th><th>صافي الربح السنوي</th><th>IRR</th><th>فترة الاسترداد</th></tr></thead>
          <tbody>
            <tr>
              <td>متحفظ (-15% مبيعات)</td>
              <td class="num">${formatMoney(annRev * 0.85)}</td>
              <td class="num">${formatMoney(annProfit * 0.72)}</td>
              <td class="num">${formatPct(computeIrr5Yr(capex, annProfit * 0.72))}</td>
              <td class="num">${annProfit > 0 ? Math.round((capex / (annProfit * 0.72)) * 12) + ' شهر' : '-'}</td>
            </tr>
            <tr>
              <td><strong>الأساسي (Base Case)</strong></td>
              <td class="num"><strong>${formatMoney(annRev)}</strong></td>
              <td class="num"><strong>${formatMoney(annProfit)}</strong></td>
              <td class="num"><strong>${formatPct(irr)}</strong></td>
              <td class="num"><strong>${payback >= 999 ? '-' : payback + ' شهر'}</strong></td>
            </tr>
            <tr>
              <td>متفائل (+15% مبيعات)</td>
              <td class="num">${formatMoney(annRev * 1.15)}</td>
              <td class="num">${formatMoney(annProfit * 1.25)}</td>
              <td class="num">${formatPct(computeIrr5Yr(capex, annProfit * 1.25))}</td>
              <td class="num">${annProfit > 0 ? Math.round((capex / (annProfit * 1.25)) * 12) + ' شهر' : '-'}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="pm-cols-2">
        <div class="pm-section">
          <h3>3. التراخيص وعوامل النجاح</h3>
          <ul style="margin:0;padding-right:16px;">
            ${(activity.licenses || []).map(x => `<li>${escapeHtml(x)}</li>`).join('')}
            ${(activity.success_factors || []).map(x => `<li>${escapeHtml(x)}</li>`).join('')}
          </ul>
        </div>
        <div class="pm-section">
          <h3>4. المخاطر وموثوقية البيانات</h3>
          <ul style="margin:0;padding-right:16px;">
            ${(activity.risks || []).map(x => `<li>${escapeHtml(x)}</li>`).join('')}
          </ul>
          <p style="margin:6px 0 0;font-size:9.5px;color:#475569;">${escapeHtml(activity.data_provenance || 'مصدر البيانات: مسح السوق الميداني لمحافظة كفر الشيخ — V5 Institutional.')}</p>
        </div>
      </div>

      <div class="pm-footer">
        <span>منصة كفر الشيخ الذكية للاستثمار ودراسة السوق — V5 Institutional Edition</span>
        <span>وثيقة استرشادية لدعم قرارات الاستثمار</span>
      </div>
    `;

    window.print();
  }

  // ========================================================================
  // Filter Population & Event Bindings
  // ========================================================================
  function populateFilters() {
    const sectors = (state.data.sectors_summary || []).map(s => s.sector);
    const markazNames = (state.data.markaz_info || []).map(m => m.name);
    const activities = state.data.activities_catalog || [];

    const secOpts = `<option value="ALL">جميع القطاعات</option>` + sectors.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
    document.getElementById('mapSectorFilter').innerHTML = secOpts;
    document.getElementById('expSector').innerHTML = secOpts;
    document.getElementById('dirSector').innerHTML = secOpts;

    const mkOpts = `<option value="ALL">جميع المراكز</option>` + markazNames.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
    document.getElementById('dirMarkaz').innerHTML = mkOpts;

    document.getElementById('simActivity').innerHTML = activities.map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>`).join('');
    document.getElementById('simMarkaz').innerHTML = markazNames.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');

    if (activities[0]) {
      document.getElementById('simCapital').value = getActCapex(activities[0]);
    }

    populateComparatorSelects();
    state.dir.filtered = [...(state.data.businesses || [])];
  }

  function bindEvents() {
    // Navigation Tabs
    document.querySelectorAll('.nav-tab').forEach(btn => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    // Currency Switcher
    document.querySelectorAll('.curr-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.currency = btn.dataset.curr;
        document.querySelectorAll('.curr-btn').forEach(b => b.classList.toggle('active', b.dataset.curr === state.currency));
        renderAll();
      });
    });

    // Theme Toggle
    document.getElementById('themeToggleBtn').addEventListener('click', () => {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', state.theme);
      document.getElementById('themeIcon').textContent = state.theme === 'dark' ? '☀️' : '🌙';
      renderDashboard();
      renderComparator();
    });

    // Governance Badge scroll
    document.getElementById('govBadgeBtn').addEventListener('click', () => {
      switchView('dashboard');
      document.getElementById('governanceBanner').scrollIntoView({ behavior: 'smooth' });
    });

    // Map Filters
    document.getElementById('mapLayerMode').addEventListener('change', renderMapLayers);
    document.getElementById('mapSectorFilter').addEventListener('change', renderMapLayers);

    // Explorer Filters
    ['expSearch', 'expQuadrant', 'expStatus', 'expSector', 'expMaxCap'].forEach(id => {
      document.getElementById(id).addEventListener('input', renderExplorer);
      document.getElementById(id).addEventListener('change', renderExplorer);
    });

    // Tear Sheet Modal
    document.getElementById('tsCloseBtn').addEventListener('click', closeTearSheet);
    document.getElementById('tearSheetModal').addEventListener('click', (e) => {
      if (e.target.id === 'tearSheetModal') closeTearSheet();
    });
    document.getElementById('tsSimulateBtn').addEventListener('click', () => {
      const act = state.activeModalActivity;
      if (!act) return;
      document.getElementById('simActivity').value = act.id;
      document.getElementById('simCapital').value = getActCapex(act);
      if (act.best_markaz && act.best_markaz[0]) {
        const sel = document.getElementById('simMarkaz');
        if ([...sel.options].some(o => o.value === act.best_markaz[0])) {
          sel.value = act.best_markaz[0];
        }
      }
      closeTearSheet();
      switchView('simulator');
      renderSimulator();
    });
    document.getElementById('tsPrintMemoBtn').addEventListener('click', () => {
      const a = state.activeModalActivity;
      if (!a) return;
      const annRev = getActMonthlyRev(a) * 12;
      const annProfit = (getActMonthlyRev(a) - getActMonthlyOpex(a)) * 12;
      printInvestmentMemo({
        activity: a,
        markazName: (a.best_markaz || [])[0] || 'كفر الشيخ',
        capex: getActCapex(a),
        irr: getActIrr(a),
        npv: getActNpv(a),
        roi: getActRoi(a),
        payback: getActPayback(a),
        annRev,
        annProfit,
        discountRate: 18
      });
    });

    // Comparator
    document.querySelectorAll('.seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.comparatorMode = btn.dataset.mode;
        document.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === state.comparatorMode));
        populateComparatorSelects();
        renderComparator();
      });
    });
    ['compSelect1', 'compSelect2', 'compSelect3'].forEach(id => {
      document.getElementById(id).addEventListener('change', renderComparator);
    });

    // Simulator
    document.getElementById('simActivity').addEventListener('change', () => {
      const act = state.data.activities_catalog.find(a => a.id === document.getElementById('simActivity').value);
      if (act) document.getElementById('simCapital').value = getActCapex(act);
      renderSimulator();
    });
    ['simMarkaz', 'simCapital', 'simSalesSlider', 'simOpexSlider', 'simDiscountSlider'].forEach(id => {
      document.getElementById(id).addEventListener('input', renderSimulator);
      document.getElementById(id).addEventListener('change', renderSimulator);
    });
    document.getElementById('simResetBtn').addEventListener('click', () => {
      const act = state.data.activities_catalog.find(a => a.id === document.getElementById('simActivity').value);
      if (act) document.getElementById('simCapital').value = getActCapex(act);
      document.getElementById('simSalesSlider').value = 100;
      document.getElementById('simOpexSlider').value = 0;
      document.getElementById('simDiscountSlider').value = 18;
      renderSimulator();
    });
    document.getElementById('simPrintMemoBtn').addEventListener('click', () => {
      const res = getSimulatorResult();
      printInvestmentMemo({
        activity: res.act,
        markazName: res.mk ? res.mk.name : 'كفر الشيخ',
        capex: res.capex,
        irr: res.irr,
        npv: res.npv,
        roi: res.roi,
        payback: res.payback,
        annRev: res.annRev,
        annProfit: res.annProfit,
        discountRate: res.discountRate
      });
    });

    // Directory
    ['dirSearch', 'dirMarkaz', 'dirSector', 'dirConf'].forEach(id => {
      document.getElementById(id).addEventListener('input', filterDirectory);
      document.getElementById(id).addEventListener('change', filterDirectory);
    });
    document.getElementById('dirPrevBtn').addEventListener('click', () => {
      if (state.dir.page > 1) {
        state.dir.page--;
        renderDirectory();
      }
    });
    document.getElementById('dirNextBtn').addEventListener('click', () => {
      const totalPages = Math.max(1, Math.ceil(state.dir.filtered.length / state.dir.pageSize));
      if (state.dir.page < totalPages) {
        state.dir.page++;
        renderDirectory();
      }
    });
    document.getElementById('exportCsvBtn').addEventListener('click', exportDirectoryCsv);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
