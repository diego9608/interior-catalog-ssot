(async function(){
  const fmt = {
    mxn: n => typeof n === 'number' ? new Intl.NumberFormat('es-MX', {style:'currency', currency:'MXN', maximumFractionDigits:2}).format(n) : '—',
    pct: p => typeof p === 'number' ? `${(p*100).toFixed(1)}%` : '—'
  };

  // Cargar endpoints (robusto ante distintos formatos)
  const safeFetch = async (url, fallback) => {
    try { const r = await fetch(url,{cache:'no-store'}); if(!r.ok) throw 0; return await r.json(); }
    catch { return fallback; }
  };

  const ops = await safeFetch('/api/ops/index.json', []);
  const projectsApi = await safeFetch('/api/projects.json', []);

  // Normalizar proyectos
  const projects = Array.isArray(projectsApi)
    ? projectsApi.map(p => p.projectId || p.id || p)
    : Array.isArray(projectsApi.projects) ? projectsApi.projects.map(p => p.projectId || p.id || p) : [];

  // Tomar primer proyecto con métricas (en demo hay 1)
  const byId = {};
  ops.forEach(o => byId[o.projectId] = o);
  const first = ops[0];

  // --- KPI Cards ---
  const cards = [
    {t:'Costo P50', v: fmt.mxn(first?.cost_p50)},
    {t:'Costo P80', v: fmt.mxn(first?.cost_p80)},
    {t:'Merma real', v: fmt.pct(first?.waste_pct)},
    {t:'QC Gate', v: first?.qc_overall_pass === true ? 'PASS' : (first?.qc_overall_pass === false ? 'FAIL' : '—')}
  ];
  document.getElementById('kpiCards').innerHTML = cards.map(c =>
    `<div class="card"><h3>${c.t}</h3><div class="v">${c.v}</div><div class="sub">DEMO actual</div></div>`
  ).join('');

  // --- Tabla de proyectos ---
  const tbody = document.querySelector('#projectsTable tbody');
  if (projects.length === 0 && ops.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5">Sin datos. Ejecuta el pipeline (build) para generar KPIs.</td></tr>`;
  } else {
    const ids = projects.length ? projects : ops.map(o=>o.projectId);
    tbody.innerHTML = ids.map(id => {
      const o = byId[id] || {};
      const qc = o.qc_overall_pass === true ? `<span class="pass">PASS</span>` :
                 o.qc_overall_pass === false ? `<span class="fail">FAIL</span>` : '—';
      return `<tr>
        <td>${id}</td>
        <td>${fmt.mxn(o.cost_p50)}</td>
        <td>${fmt.mxn(o.cost_p80)}</td>
        <td>${fmt.pct(o.waste_pct)}</td>
        <td>${qc}</td>
      </tr>`;
    }).join('');
  }

  // --- Meta de build ---
  const meta = await safeFetch('/api/ops/meta.json', null);
  const metaEl = document.getElementById('buildMeta');
  if (meta?.date || meta?.sha) {
    metaEl.textContent = `Último build: ${meta.date || ''} ${meta.sha ? '• ' + meta.sha.substring(0,7) : ''}`;
  } else {
    metaEl.textContent = 'KPIs cargados';
  }
})();