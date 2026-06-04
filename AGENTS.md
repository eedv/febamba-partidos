# AGENTS.md — FEBAMBA Formativas

## Descripción

Sitio estático con resultados, posiciones y próximos partidos de las categorías formativas (Premini, Mini, Mosquitos) de FEBAMBA. La data se scrapea desde la plataforma de CABB (`competicionescabb.gesdeportiva.es`) y se sirve como archivos JSON + frontend HTML/JS vanilla.

## Stack

| Capa | Tecnología |
|------|-----------|
| Scraper | Python 3.12, `httpx`, `BeautifulSoup4` |
| Schedule | GitHub Actions (cron cada hora) |
| "Base de datos" | Archivos JSON planos en `docs/data/` |
| Frontend | HTML5 semántico + CSS3 + JS vanilla (ES modules) |
| Hosting | Netlify (publish dir: `docs/`) |

## Estructura del repo

```
├── .github/workflows/scrape.yml   # GitHub Action: corre scraper cada hora, commitea data
├── scraper/
│   ├── requirements.txt            # httpx, beautifulsoup4
│   └── scrape.py                   # Scraper principal
├── docs/                           # Netlify publish directory
│   ├── index.html                  # Frontend principal
│   ├── style.css                   # Estilos
│   ├── app.js                      # Lógica JS (carga JSON, renderiza tablas, filtros)
│   ├── netlify.toml                # Config Netlify (publish = "docs")
│   └── data/
│       └── datos.json              # Generado por el scraper (toda la data)
├── netlify.toml                    # Config Netlify raíz
└── .gitignore
```

## Scraper (`scraper/scrape.py`)

### Fuente de datos

La plataforma de CABB es un sitio ASP.NET Web Forms con postbacks.  
URL base: `https://competicionescabb.gesdeportiva.es`  
Página por categoría: `competicion.aspx?categoria={id}`

La página tiene dropdowns `DDLFases` (fase) y `DDLGrupos` (grupo), y tabs con datos en HTML directo (no lazy-loading, todo el contenido está en el HTML).

### Categorías scrapeadas

| ID | Nombre |
|----|--------|
| 5076 | U17 - JUVENILES MASCULINO |
| 5077 | U15 - CADETES MASCULINO |
| 5078 | U13 - INFANTILES MASCULINO |
| 5079 | U11 - MINI MASCULINO |
| 5080 | U9 - PRE MINI MASCULINO |
| 5081 | U7 - MOSQUITOS MASCULINO |

### Cómo funciona

1. **GET inicial**: Obtiene la página con la fase y grupo por defecto. Extrae `__VIEWSTATE`, `__EVENTVALIDATION`, `__VIEWSTATEGENERATOR`.
2. **Por cada fase**: Hace POST con `DDLFases={id}` para cambiar la fase y obtener sus grupos.
3. **Por cada grupo**: Hace POST con `DDLGrupos={id}` para obtener los datos de ese grupo (próximos, resultados, posiciones, calendario, equipos).
4. **Espera 0.3s entre POSTs** (`time.sleep(0.3)`) para no saturar el servidor.

### Headers requeridos

El sitio bloquea requests sin User-Agent adecuado. El scraper usa:

```python
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ...",
    "Accept": "text/html,...",
    "Accept-Language": "es-ES,es;q=0.9",
}
```

### Postback ASP.NET

Cada POST debe incluir:
- `__EVENTTARGET`: nombre del control que disparó el cambio (`DDLFases` o `DDLGrupos`)
- `__EVENTARGUMENT`: vacío
- `__LASTFOCUS`: vacío
- `__VIEWSTATE`, `__VIEWSTATEGENERATOR`, `__EVENTVALIDATION`: extraídos del HTML previo
- `DDLFases` y `DDLGrupos`: valores seleccionados

### Tabs parseados

| Tab | ID HTML | Función | Contenido |
|-----|---------|---------|-----------|
| Próximos | `#PProximosPartidos table` | `parse_proximos()` | `{local, visitante, fecha, cancha, direccion}` |
| Resultados | `#PUltimaJornada table` | `parse_resultados()` | `{jornada, partidos: [{fecha, local, visitante, pts_local, pts_visitante}]}` |
| Posiciones | `#PClasificacion table` | `parse_posiciones()` | `{pos, nombre, pj, pg, pp, pf, pc, pts}` |
| Calendario | `#calendario` | `parse_calendario()` | `[{jornada, local, visitante, goles_local, goles_visitante, fecha_hora}]` |
| Equipos | `#equipos table` | `parse_equipos()` | `{nombre, club, localidad, color1, color2, escudo}` |

### Estructura del JSON de salida (`docs/data/datos.json`)

```json
{
  "categories": { "5079": "MINI MASCULINO", ... },
  "data": {
    "5079": {
      "fases": { "18618": "TORNEO RECLASIFICATORIO", ... },
      "grupos": {
        "18618": { "35640": "CENTRO 2A", ... }
      },
      "proximos": {
        "35640": [ { "local": "ALDO BONZI", "visitante": "JOSE HERNANDEZ", "fecha": "07/06/2026 15:30", "cancha": "Aldo Bonzi", "direccion": "(Linos Lagos 1702 - ALDO BONZI)" }, ... ]
      },
      "resultados": {
        "35640": { "jornada": "07/06/2026", "partidos": [ { "fecha": "07/06/2026", "local": "...", "visitante": "...", "pts_local": "", "pts_visitante": "" }, ... ] }
      },
      "posiciones": {
        "35640": [ { "pos": "1", "nombre": "RACING ANEXO", "pj": "12", "pg": "9", "pp": "0", "pf": "238", "pc": "41", "pts": "18" }, ... ]
      },
      "calendario": {
        "35640": [ { "tipo": "jornada", "numero": "1", "fecha_jornada": "15/03/2026" }, ... ]
      },
      "equipos": {
        "35640": [ { "nombre": "PEDRO ECHAGUE AMARILLO", "club": "INSTITUCION ...", "localidad": "C.A.B.A.", "color1": "AMARILLO", "color2": "AZUL", "escudo": "/escudo-77/logo-club.jpg" }, ... ]
      }
    }
  }
}
```

### Datos importantes sobre el scraper

- `direccion` en próximos incluye paréntesis: `"(Linos Lagos 1702 - ALDO BONZI)"`. El frontend los limpia al generar links de Google Maps.
- La tabla de equipos tiene **6 columnas**: logo, nombre, club, localidad, color1, color2. Verificar si cambia.
- `pts_local` y `pts_visitante` pueden estar vacíos si el partido no se jugó aún.
- Los escudos son URLs relativas (`/escudo-77/logo-club.jpg`). Se completan con `https://competicionescabb.gesdeportiva.es`.

## Frontend (`docs/`)

### Tecnología

- HTML5 semántico con `<header>`, `<nav>`, `<main>`, `<section>`, `<footer>`
- CSS3 con custom properties, Grid/Flexbox, responsive, mobile-first
- JS vanilla ES module (sin framework, sin dependencias externas)

### Componentes

- **Filtros**: 3 dropdowns encadenados (categoría → fase → grupo)
- **Tabs**: Posiciones, Próximos, Resultados, Equipos (manejo con `role="tab"` y `hidden`)
- **Tablas**: Renderizadas desde `datos.json` con fetch, template literals e innerHTML

### Funciones clave en `app.js`

| Función | Rol |
|---------|-----|
| `load()` | Fetch de datos, inicialización |
| `buildEscudoMap()` | Construye `escudoMap{teamName → escudoURL}` desde todos los equipos |
| `renderPosiciones()` | Tabla de posiciones con escudos |
| `renderProximos()` | Próximos partidos con link a Google Maps |
| `renderResultados()` | Resultados con colores win/loss |
| `renderCalendario()` | Fixture completo agrupado por jornada, con scores (jugados) o "-" (futuros), scroll automático a última jornada jugada |
| `renderEquipos()` | Lista de equipos con escudos |
| `mapsUrl(direccion)` | Genera URL de Google Maps quitando paréntesis |
| `escudo(nombre, size)` | Renderiza img con escudo real o avatar fallback |
| `_escudoFallback(el,nombre,size)` | Global para `onerror` de imágenes |

### Escudos

- Se construye `escudoMap` al cargar los datos, agregando todos los equipos de todas las categorías.
- `escudo(nombre, size)` busca en el mapa. Si encuentra escudo real, lo muestra con `onerror` que cae al avatar generado por `ui-avatars.com`.
- Las URLs de escudos reales son relativas: se completan con `https://competicionescabb.gesdeportiva.es`.

### Google Maps

Cada cancha en "Próximos" es un link a:
```
https://www.google.com/maps/search/?api=1&query={dirección sin paréntesis}
```

## GitHub Action (`.github/workflows/scrape.yml`)

- **Trigger**: `cron: '0 5 * * *'` (una vez al día, 05:00 UTC) + `workflow_dispatch` (manual)
- **Permisos**: `contents: write` (para pushear commits)
- **Pasos**:
  1. Checkout repo
  2. Setup Python 3.12
  3. `pip install -q -r scraper/requirements.txt`
  4. `python scraper/scrape.py` → regenera `docs/data/datos.json`
  5. Si hay cambios, commitea con mensaje `"Actualizar datos (fecha)"` y pushea

**Importante**: El Action corre en `ubuntu-latest`. No necesita playwright ni chromium, todo es HTML estático.

## Netlify

- Conectado al repo de GitHub
- Publish directory: `docs/` (configurado en `netlify.toml`)
- No necesita build command
- URL: `https://{nombre}.netlify.app`

## Cómo correr localmente

```bash
pip install -r scraper/requirements.txt
python scraper/scrape.py          # genera docs/data/datos.json
python3 -m http.server 8080 --directory docs   # servidor de prueba
```

## Datos importantes para agentes futuros

1. **User-Agent**: Obligatorio. El sitio CABB devuelve 403 sin un browser User-Agent.
2. **ViewState**: Cambia en cada POST. Siempre extraer del HTML de la última respuesta.
3. **Equipos tiene 6 columnas**: No 7. Si el HTML cambia, revisar `parse_equipos()`.
4. **Los tabs NO son lazy-loading**: Todo el HTML está presente al hacer GET/POST. Solo está oculto con CSS `display:none`/`fade`.
5. **No hay API REST**: La única fuente de datos es la página HTML con postbacks. No hay JSON endpoints, no hay GraphQL, no hay nada más.
6. **IDs de categorías**: Podrían cambiar entre temporadas. Verificar en los dropdowns de `competicion.aspx?competencia=2015`.
7. **Timeout**: El scraper usa `timeout=30` en httpx. Si el sitio está lento, puede fallar.
8. **Escudos cross-dominio**: Las imágenes de escudos se sirven desde `competicionescabb.gesdeportiva.es`. Si el sitio cambia de dominio o agrega protección hotlink, los escudos dejarán de cargar.

## Posibles mejoras futuras

- Agregar cached de ViewState para evitar POSTs redundantes
- Agregar más categorías (Infantiles, Cadetes, Juveniles, Liga Próximo)
- Agregar búsqueda por equipo
- Agregar historial de jornadas anteriores (no solo la última)
- Agregar filtro por fecha
- Mostrar el calendario completo con resultados ya jugados
- Exportar a CSV/PDF
