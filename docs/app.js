const DATA_URL = 'data/datos.json'

let data = null
let estado = { cat: null, fase: null, grupo: null }
let escudoMap = {}

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
    buildEscudoMap()
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

function fillSelect(sel, items, selected, sortByLabel) {
  sel.innerHTML = ''
  let entries = Object.entries(items)
  if (sortByLabel) entries.sort((a, b) => a[1].localeCompare(b[1], 'es'))
  for (const [val, label] of entries) {
    const o = document.createElement('option')
    o.value = val; o.textContent = label
    sel.appendChild(o)
  }
  sel.value = selected ?? entries[0]?.[0] ?? ''
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
  fillSelect(selGrupo, grupos, null, true)
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
  renderCalendario()
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

function renderCalendario() {
  const container = $('#cal-container')
  const items = getCat().calendario[gid()] ?? []
  if (!items.length) { container.innerHTML = '<p class="empty-state">Sin calendario</p>'; return }

  let html = ''
  let partidos = []
  let jNum = ''
  let jFecha = ''
  let lastPlayedId = null

  function flush() {
    if (!partidos.length) return
    const jId = 'j-' + (jNum || '0')
    const anyPlayed = partidos.some(p => p.goles_local && p.goles_visitante)
    if (anyPlayed) lastPlayedId = jId

    html += `<div class="jornada-block" id="${jId}">`
    html += `<h4 class="jornada-title">Jornada ${escape(jNum)} · ${escape(jFecha)}</h4>`
    html += `<div class="table-wrap"><table><thead><tr><th>Local</th><th></th><th></th><th>Visitante</th><th>Fecha</th></tr></thead><tbody>`
    for (const p of partidos) {
      const jugado = p.goles_local && p.goles_visitante
      if (jugado) {
        const pl = p.goles_local
        const pv = p.goles_visitante
        const cls = Number(pl) > Number(pv) ? 'score-w' : 'score-l'
        html += `<tr>
          <td class="result-local">${escudo(p.local)} ${escape(p.local)}</td>
          <td class="pts-local ${cls}">${pl}</td>
          <td class="pts-visit ${cls}">${pv}</td>
          <td class="result-visit">${escudo(p.visitante)} ${escape(p.visitante)}</td>
          <td class="num">${formatFechaHora(p.fecha_hora)}</td>
        </tr>`
      } else {
        html += `<tr>
          <td class="result-local">${escudo(p.local)} ${escape(p.local)}</td>
          <td class="num score-empty">-</td>
          <td class="num score-empty">-</td>
          <td class="result-visit">${escudo(p.visitante)} ${escape(p.visitante)}</td>
          <td class="num">${formatFechaHora(p.fecha_hora)}</td>
        </tr>`
      }
    }
    html += `</tbody></table></div></div>`
    partidos = []
  }

  for (const item of items) {
    if (item.tipo === 'jornada') { flush(); jNum = item.numero; jFecha = item.fecha_jornada }
    else if (item.tipo === 'partido') partidos.push(item)
  }
  flush()
  container.innerHTML = html

  if (lastPlayedId) {
    setTimeout(() => {
      const el = document.getElementById(lastPlayedId)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 150)
  }
}

function formatFechaHora(fh) {
  if (!fh) return ''
  return fh.replace(/(\d{2}\/\d{2}\/\d{4})(\d{2}:\d{2})/, '$1 $2')
}

function renderEquipos() {
  const tbody = $('#tbl-equipos tbody')
  const items = getCat().equipos[gid()] ?? []
  if (!items.length) { tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Sin datos de equipos</td></tr>'; return }
  tbody.innerHTML = items.map(r => `<tr>
    <td>${escudo(r.nombre, 22)}</td>
    <td class="team-name">${escape(r.nombre)}</td>
    <td>${escape(r.club)}</td>
    <td>${escape(r.localidad)}</td>
  </tr>`).join('')
}

function buildEscudoMap() {
  escudoMap = {}
  for (const catId of Object.keys(data.data)) {
    const cat = data.data[catId]
    for (const gid of Object.keys(cat.equipos)) {
      for (const eq of cat.equipos[gid]) {
        if (eq.escudo && !escudoMap[eq.nombre]) {
          escudoMap[eq.nombre] = eq.escudo
        }
      }
    }
  }
}

// ── Helpers ──
function mapsUrl(direccion) {
  if (!direccion) return ''
  const addr = direccion.replace(/[()]/g, '').trim()
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`
}

window._escudoFallback = function (el, nombre, size) {
  el.onerror = null
  el.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(nombre)}&background=ea580c&color=fff&bold=true&size=${size}`
}

function escudo(nombre, size = 28) {
  const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(nombre)}&background=ea580c&color=fff&bold=true&size=${size}`
  const relUrl = escudoMap[nombre]
  if (relUrl) {
    const fullUrl = `https://competicionescabb.gesdeportiva.es${relUrl}`
    return `<img class="escudo" style="width:${size}px;height:${size}px" src="${escape(fullUrl)}" alt="${escape(nombre)}" loading="lazy" onerror="_escudoFallback(this,'${escape(nombre)}',${size})">`
  }
  return `<img class="escudo" style="width:${size}px;height:${size}px" src="${escape(avatarUrl)}" alt="${escape(nombre)}" loading="lazy">`
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
