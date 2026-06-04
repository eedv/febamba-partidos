#!/usr/bin/env python3
"""Scraper for CABB competition data (Febamba formativas)."""

import httpx
from bs4 import BeautifulSoup
import json
import re
import os
import time

BASE_URL = "https://competicionescabb.gesdeportiva.es"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-ES,es;q=0.9",
}
CATEGORIES = {
    "5079": "MINI MASCULINO",
    "5080": "PRE MINI MASCULINO",
    "5081": "MOSQUITOS MASCULINO",
}
OUTPUT_DIR = "docs/data"


def form_state(soup):
    state = {}
    for inp in soup.select('input[type="hidden"]'):
        name = inp.get("name")
        if name and name.startswith("__"):
            state[name] = inp.get("value", "")
    return state


def post(client, url, state, extra, target=""):
    data = {
        "__EVENTTARGET": target,
        "__EVENTARGUMENT": "",
        "__LASTFOCUS": "",
    }
    data.update(state)
    data.update(extra)
    r = client.post(url, data=data)
    soup = BeautifulSoup(r.text, "html.parser")
    return soup, form_state(soup)


def dropdown(soup, name):
    sel = soup.select_one(f'select[name="{name}"]')
    if not sel:
        return {}
    opts = {}
    for o in sel.select("option"):
        v = o.get("value")
        if v:
            opts[v] = o.text.strip()
    return opts


def parse_proximos(soup):
    table = soup.select_one("#PProximosPartidos table")
    if not table:
        return []
    items = []
    for row in table.select("tbody tr"):
        cols = row.select("td")
        if len(cols) < 6:
            continue
        local = cols[0].get_text(strip=True)
        visitante = cols[3].get_text(strip=True)
        fecha = cols[4].get_text(strip=True)
        span = cols[5].select_one("span")
        direccion = span.get_text(strip=True) if span else ""
        cancha = cols[5].get_text(strip=True).replace(direccion, "").strip() if direccion else cols[5].get_text(strip=True)
        items.append({"local": local, "visitante": visitante, "fecha": fecha, "cancha": cancha, "direccion": direccion})
    return items


def parse_resultados(soup):
    div = soup.select_one("#PUltimaJornada")
    if not div:
        return {"jornada": "", "partidos": []}
    h4 = div.select_one("h4")
    j = ""
    if h4:
        m = re.search(r"(\d{2}/\d{2}/\d{4})", h4.get_text())
        if m:
            j = m.group(1)
    table = div.select_one("table")
    if not table:
        return {"jornada": j, "partidos": []}
    partidos = []
    for row in table.select("tbody tr"):
        cols = row.select("td")
        if len(cols) < 7:
            continue
        f = cols[0].get_text(strip=True) or j
        local = cols[1].get_text(strip=True)
        pl = cols[3].get_text(strip=True)
        pv = cols[4].get_text(strip=True)
        visitante = cols[6].get_text(strip=True)
        partidos.append({"fecha": f, "local": local, "visitante": visitante, "pts_local": pl, "pts_visitante": pv})
    return {"jornada": j, "partidos": partidos}


def parse_posiciones(soup):
    div = soup.select_one("#PClasificacion")
    if not div:
        return []
    table = div.select_one("table")
    if not table:
        return []
    items = []
    for row in table.select("tbody tr"):
        cols = row.select("td")
        if len(cols) < 9:
            continue
        items.append({
            "pos": cols[0].get_text(strip=True),
            "nombre": cols[2].get_text(strip=True),
            "pj": cols[3].get_text(strip=True),
            "pg": cols[4].get_text(strip=True),
            "pp": cols[5].get_text(strip=True),
            "pf": cols[6].get_text(strip=True),
            "pc": cols[7].get_text(strip=True),
            "pts": cols[8].get_text(strip=True),
        })
    return items


def parse_calendario(soup):
    div = soup.select_one("#calendario")
    if not div:
        return []
    items = []
    for el in div.find_all(["h4", "div"]):
        if el.name == "h4":
            txt = el.get_text(strip=True)
            m = re.search(r"Jornada\s+(\d+)\s*[-]\s*(\d{2}/\d{2}/\d{4})", txt)
            j_num = ""
            j_fecha = ""
            if m:
                j_num = m.group(1)
                j_fecha = m.group(2)
            elif re.search(r"Jornada\s+(\d+)", txt):
                j_num = re.search(r"Jornada\s+(\d+)", txt).group(1)
            items.append({"tipo": "jornada", "numero": j_num, "fecha_jornada": j_fecha})
        elif el.name == "div" and el.select_one("table"):
            for row in el.select("table tbody tr"):
                cols = row.select("td")
                if len(cols) >= 5:
                    local = cols[0].get_text(strip=True)
                    g_l = cols[1].get_text(strip=True)
                    g_v = cols[2].get_text(strip=True)
                    visitante = cols[3].get_text(strip=True)
                    fh = cols[4].get_text(strip=True)
                    items.append({
                        "tipo": "partido",
                        "local": local,
                        "visitante": visitante,
                        "goles_local": g_l,
                        "goles_visitante": g_v,
                        "fecha_hora": fh,
                    })
    return items


def parse_equipos(soup):
    div = soup.select_one("#equipos")
    if not div:
        return []
    table = div.select_one("table")
    if not table:
        return []
    items = []
    for row in table.select("tbody tr"):
        cols = row.select("td")
        if len(cols) < 6:
            continue
        img = cols[0].select_one("img")
        escudo = img.get("src") if img else ""
        items.append({
            "nombre": cols[1].get_text(strip=True),
            "club": cols[2].get_text(strip=True),
            "localidad": cols[3].get_text(strip=True),
            "color1": cols[4].get_text(strip=True),
            "color2": cols[5].get_text(strip=True),
            "escudo": escudo,
        })
    return items


def scrape_categoria(client, cat_id):
    url = f"{BASE_URL}/competicion.aspx?categoria={cat_id}"
    r = client.get(url)
    soup = BeautifulSoup(r.text, "html.parser")
    state = form_state(soup)
    fases = dropdown(soup, "DDLFases")

    out = {"fases": fases, "grupos": {}, "proximos": {}, "resultados": {}, "posiciones": {}, "calendario": {}, "equipos": {}}
    fase_ids = list(fases.keys())

    for fi, fid in enumerate(fase_ids):
        if fi > 0:
            soup, state = post(client, url, state, {"DDLFases": fid}, "DDLFases")
            time.sleep(0.3)

        grupos = dropdown(soup, "DDLGrupos")
        out["grupos"][fid] = grupos
        gids = list(grupos.keys())

        for gi, gid in enumerate(gids):
            if gi > 0:
                soup, state = post(client, url, state, {"DDLGrupos": gid}, "DDLGrupos")
                time.sleep(0.3)

            out["proximos"][gid] = parse_proximos(soup)
            out["resultados"][gid] = parse_resultados(soup)
            out["posiciones"][gid] = parse_posiciones(soup)
            out["calendario"][gid] = parse_calendario(soup)
            out["equipos"][gid] = parse_equipos(soup)

    return out


def main():
    all_data = {"categories": CATEGORIES, "data": {}}
    with httpx.Client(timeout=30, headers=HEADERS, follow_redirects=True) as client:
        for cid, cname in CATEGORIES.items():
            print(f"Scraping {cname} ({cid})...")
            all_data["data"][cid] = scrape_categoria(client, cid)

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    path = os.path.join(OUTPUT_DIR, "datos.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(all_data, f, ensure_ascii=False)
    print(f"\nSaved to {path}")


if __name__ == "__main__":
    main()
