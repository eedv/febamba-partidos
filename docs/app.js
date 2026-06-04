const DATA_URL = 'data/datos.json'

let data = null
let estado = { cat: null, fase: null, grupo: null }

const $ = (s, ctx = document) => ctx.querySelector(s)
const $$ = (s, ctx = document) => [...ctx.querySelectorAll(s)]

const selCat = $('#cat')
const selFase = $('#fase')
const selGrupo = $('#grupo')
const tabs = $$('[role="tab"]')
const updateInfo = $('#update-info')

// ── Fetch ──
async function load() {
  try {
    const r = await fetch(DATA_URL + '?_=' + Date.now())
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    data = await r.json()
    renderCategorias()
    updateInfo.textContent = 'Datos actualizados'
  } catch (e) {
    updateInfo.textContent = 'Error al cargar datos. Reintentando…'
    setTimeout(load, 5000)
  }
}

// ── Dropdowns ──
function renderCategorias() {
  selCat.innerHTML = ''
  for (const [id, name] of Object.entries(data.categories)) {
    const o = document.createElement('option')
    o.value = id; o.textContent = name
    selCat.appendChild(o)
  }
  selCat.value = '5080'
  onChangeCat()
}

function fillSelect(sel, items, selected) {
  sel.innerHTML = ''
  for (const [val, label] of Object.entries(items)) {
    const o = document.createElement('option')
    o.value = val; o.textContent = label
    sel.appendChild(o)
  }
  sel.value = selected ?? Object.keys(items)[0] ?? ''
}

function onChangeCat() {
  estado.cat = selCat.value
  const cat = data.data[estado.cat]
  fillSelect(selFase, cat.fases)
  onChangeFase()
}

function onChangeFase() {
  estado.fase = selFase.value
  const cat = data.data[estado.cat]
  const grupos = cat.grupos[estado.fase] ?? {}
  fillSelect(selGrupo, grupos)
  onChangeGrupo()
}

function onChangeGrupo() {
  estado.grupo = selGrupo.value
  renderAll()
}

// ── Tabs ──
tabs.forEach(btn => {
  btn.addEventListener('click', () => {
    tabs.forEach(b => b.setAttribute('aria-selected', 'false'))
    btn.setAttribute('aria-selected', 'true')
    $$('[role="tabpanel"]').forEach(p => p.hidden = true)
    const panel = document.getElementById('tab-' + btn.dataset.tab)
    if (panel) panel.hidden = false
  })
})

// ── Render ──
function renderAll() {
  if (!estado.grupo) return
  renderPosiciones()
  renderProximos()
  renderResultados()
  renderEquipos()
}

function gid() { return estado.grupo }

function getCat() {
  return data.data[estado.cat]
}

function renderPosiciones() {
  const tbody = $('#tbl-posiciones tbody')
  const items = getCat().posiciones[gid()] ?? []
  if (!items.length) { tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Sin datos</td></tr>'; return }
  tbody.innerHTML = items.map((r, i) => `<tr${i === 0 ? ' class="top-row"' : ''}>
    <td class="pos">${r.pos}</td>
    <td>${r.nombre !== items[i - 1]?.nombre || i === 0 ? escudo(r.nombre) : ''}</td>
    <td class="team-name">${escape(r.nombre)}</td>
    <td class="num">${r.pj}</td>
    <td class="num">${r.pg}</td>
    <td class="num">${r.pp}</td>
    <td class="num">${r.pf}</td>
    <td class="num">${r.pc}</td>
    <td class="num pts-cell">${r.pts}</td>
  </tr>`).join('')
}

function renderProximos() {
  const tbody = $('#tbl-proximos tbody')
  const items = getCat().proximos[gid()] ?? []
  if (!items.length) { tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Sin partidos próximos</td></tr>'; return }
  tbody.innerHTML = items.map(r => `<tr>
    <td class="result-local">${escudo(r.local)} ${escape(r.local)}</td>
    <td class="num" style="color:var(--text-3)">vs</td>
    <td class="result-visit">${escudo(r.visitante)} ${escape(r.visitante)}</td>
    <td class="num">${r.fecha}</td>
    <td>${r.direccion ? `<a href="${mapsUrl(r.direccion)}" target="_blank" rel="noopener" class="map-link">${escape(r.cancha)}</a>` : escape(r.cancha)}</td>
  </tr>`).join('')
}

function renderResultados() {
  const tbody = $('#tbl-resultados tbody')
  const res = getCat().resultados[gid()] ?? { partidos: [], jornada: '' }
  const label = $('#jornada-label')
  label.textContent = res.jornada ? `Jornada del ${res.jornada}` : ''
  if (!res.partidos.length) { tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Sin resultados</td></tr>'; return }
  tbody.innerHTML = res.partidos.map(r => {
    const pl = r.pts_local || '-'
    const pv = r.pts_visitante || '-'
    const cls = r.pts_local && r.pts_visitante
      ? (Number(r.pts_local) > Number(r.pts_visitante) ? 'score-w' : 'score-l')
      : 'score-empty'
    return `<tr>
      <td class="result-local">${escudo(r.local)} ${escape(r.local)}</td>
      <td class="pts-local ${cls}">${pl}</td>
      <td class="pts-visit ${cls}">${pv}</td>
      <td class="result-visit">${escudo(r.visitante)} ${escape(r.visitante)}</td>
      <td class="num">${r.fecha}</td>
    </tr>`
  }).join('')
}

function renderEquipos() {
  const tbody = $('#tbl-equipos tbody')
  const items = getCat().equipos[gid()] ?? []
  if (!items.length) { tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Sin datos de equipos</td></tr>'; return }
  tbody.innerHTML = items.map(r => `<tr>
    <td>${r.escudo ? `<img class="escudo escudo-sm" src="https://competicionescabb.gesdeportiva.es${r.escudo}" alt="" loading="lazy">` : ''}</td>
    <td class="team-name">${escape(r.nombre)}</td>
    <td>${escape(r.club)}</td>
    <td>${escape(r.localidad)}</td>
  </tr>`).join('')
}

// ── Helpers ──
function mapsUrl(direccion) {
  if (!direccion) return ''
  const addr = direccion.replace(/[()]/g, '').trim()
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`
}

function escudo(nombre, size = 28) {
  return `<img class="escudo" style="width:${size}px;height:${size}px" src="https://ui-avatars.com/api/?name=${encodeURIComponent(nombre)}&background=ea580c&color=fff&bold=true&size=${size}" alt="" loading="lazy">`
}

function escape(s) {
  const d = document.createElement('div')
  d.textContent = s
  return d.innerHTML
}

// ── Events ──
selCat.addEventListener('change', onChangeCat)
selFase.addEventListener('change', onChangeFase)
selGrupo.addEventListener('change', onChangeGrupo)

// ── Start ──
load()
