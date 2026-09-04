"""FuelLog — écrans et API métier (surcouche). Réutilise la base sans la modifier.

- Auth : `login_required` (pages) + garde 401 JSON pour /api/* (comme la base).
- DB   : `panel.db.get_db()` (SQLite partagé). Cloisonnement par `compte_id`.
- Thème/layout : templates qui étendent `base.html`.
"""

from __future__ import annotations

import functools
import io
import json
import os
import time
import uuid

from flask import (Blueprint, current_app, jsonify, redirect, render_template,
                   request, send_from_directory, url_for)

from panel.auth import current_compte, login_required
from panel.db import get_db
from panel.settings import get_setting, set_setting

bp = Blueprint("app", __name__, static_folder="static",
               static_url_path="/app-static", template_folder="templates")

ALLOWED_MIME = {"image/jpeg", "image/png", "application/pdf"}
GOV_URL = ("https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/"
           "prix-des-carburants-en-france-flux-instantane-v2/records")


# ─────────────────────────── utilitaires ────────────────────────────────────
def uploads_dir() -> str:
    d = os.path.join(os.path.dirname(current_app.config["DATABASE_PATH"]), "uploads")
    os.makedirs(d, exist_ok=True)
    return d


def cid() -> int:
    return current_compte()["id"]


def api_login_required(view):
    @functools.wraps(view)
    def wrapped(*args, **kwargs):
        c = current_compte()
        if c is None or c["etat"] != "actif":
            return jsonify({"error": "Non authentifié"}), 401
        return view(*args, **kwargs)
    return wrapped


def rows(sql, params=()):
    return [dict(r) for r in get_db().execute(sql, params).fetchall()]


def one(sql, params=()):
    r = get_db().execute(sql, params).fetchone()
    return dict(r) if r else None


def ensure_seed(compte_id: int) -> None:
    """Amorce par compte : un véhicule par défaut + les types d'entretien."""
    db = get_db()
    n = db.execute("SELECT COUNT(*) FROM vehicules WHERE compte_id=?", (compte_id,)).fetchone()[0]
    if n == 0:
        db.execute("INSERT INTO vehicules (compte_id,nom,marque,modele,immatriculation,annee,created_at) "
                   "VALUES (?,?,?,?,?,?,?)", (compte_id, "Ma voiture", "", "", "", None,
                                             time.strftime("%Y-%m-%dT%H:%M:%S")))
        vid = db.execute("SELECT last_insert_rowid()").fetchone()[0]
        db.execute("UPDATE pleins SET vehicule_id=? WHERE compte_id=? AND vehicule_id IS NULL", (vid, compte_id))
        db.execute("UPDATE entretiens SET vehicule_id=? WHERE compte_id=? AND vehicule_id IS NULL", (vid, compte_id))
    t = db.execute("SELECT COUNT(*) FROM types_entretien WHERE compte_id=?", (compte_id,)).fetchone()[0]
    if t == 0:
        for nom in ("Entretien", "Changement d'huile", "Pneus", "Freins", "Révision", "Contrôle technique"):
            db.execute("INSERT OR IGNORE INTO types_entretien (compte_id,nom) VALUES (?,?)", (compte_id, nom))
    db.commit()


def prix_valide(v):
    try:
        v = float(v)
        return round(v * 1000) / 1000 if 0.5 < v < 5 else None
    except (TypeError, ValueError):
        return None


# ─────────────────────────── réglages app ───────────────────────────────────
@bp.app_context_processor
def _reglages_ctx():
    return {"app_carburant": get_setting("app_carburant", "E10")}


# ─────────────────────────── écran principal ────────────────────────────────
@bp.route("/")
@login_required
def dashboard():
    ensure_seed(cid())
    return render_template("dashboard.html", compte=current_compte())


@bp.route("/uploads/<path:filename>")
@login_required
def uploads(filename):
    return send_from_directory(uploads_dir(), filename)


@bp.route("/reglages/enregistrer", methods=["POST"])
@login_required
def reglages_enregistrer():
    set_setting("app_carburant", (request.form.get("app_carburant") or "E10").strip())
    from flask import flash
    flash("Réglages de l'application enregistrés.", "success")
    return redirect(url_for("accounts.reglages"))


# ─────────────────────────── PLEINS ─────────────────────────────────────────
PLEIN_COLS = ("date", "type", "kmDepart", "kmTotal", "estimPlein", "estimRestante",
              "total", "litres", "prixL", "station", "vehicule_id", "estPlein")


@bp.route("/api/pleins")
@api_login_required
def pleins_list():
    ensure_seed(cid())
    veh = request.args.get("vehicule")
    if veh:
        return jsonify(rows("SELECT * FROM pleins WHERE compte_id=? AND vehicule_id=? ORDER BY date ASC, id ASC",
                            (cid(), veh)))
    return jsonify(rows("SELECT * FROM pleins WHERE compte_id=? ORDER BY date ASC, id ASC", (cid(),)))


@bp.route("/api/pleins", methods=["POST"])
@api_login_required
def pleins_add():
    p = request.get_json(silent=True) or {}
    pid = int(time.time() * 1000)
    db = get_db()
    db.execute(
        "INSERT INTO pleins (id,compte_id,date,type,kmDepart,kmTotal,estimPlein,estimRestante,"
        "total,litres,prixL,station,vehicule_id,estPlein) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (pid, cid(), p.get("date"), p.get("type"), p.get("kmDepart"), p.get("kmTotal"),
         p.get("estimPlein"), p.get("estimRestante"), p.get("total", 0), p.get("litres", 0),
         p.get("prixL", 0), p.get("station", ""), p.get("vehicule_id"),
         1 if p.get("estPlein", 1) else 0))
    db.commit()
    return jsonify({"id": pid})


@bp.route("/api/pleins/<pid>", methods=["PATCH"])
@api_login_required
def pleins_phase2(pid):
    p = request.get_json(silent=True) or {}
    db = get_db()
    db.execute("UPDATE pleins SET kmTotal=?, estimRestante=? WHERE id=? AND compte_id=?",
               (p.get("kmTotal"), p.get("estimRestante"), pid, cid()))
    db.commit()
    return jsonify({"ok": True})


@bp.route("/api/pleins/<pid>", methods=["PUT"])
@api_login_required
def pleins_update(pid):
    p = request.get_json(silent=True) or {}
    db = get_db()
    db.execute(
        "UPDATE pleins SET date=?,type=?,kmDepart=?,kmTotal=?,estimPlein=?,estimRestante=?,"
        "total=?,litres=?,prixL=?,station=?,estPlein=? WHERE id=? AND compte_id=?",
        (p.get("date"), p.get("type"), p.get("kmDepart"), p.get("kmTotal"), p.get("estimPlein"),
         p.get("estimRestante"), p.get("total", 0), p.get("litres", 0), p.get("prixL", 0),
         p.get("station", ""), 1 if p.get("estPlein", 1) else 0, pid, cid()))
    db.commit()
    return jsonify({"ok": True})


@bp.route("/api/pleins/<pid>", methods=["DELETE"])
@api_login_required
def pleins_delete(pid):
    db = get_db()
    db.execute("DELETE FROM pleins WHERE id=? AND compte_id=?", (pid, cid()))
    db.commit()
    return jsonify({"ok": True})


@bp.route("/api/pleins", methods=["DELETE"])
@api_login_required
def pleins_delete_all():
    db = get_db()
    veh = request.args.get("vehicule")
    if veh:
        db.execute("DELETE FROM pleins WHERE compte_id=? AND vehicule_id=?", (cid(), veh))
    else:
        db.execute("DELETE FROM pleins WHERE compte_id=?", (cid(),))
    db.commit()
    return jsonify({"ok": True})


# ─────────────────────────── VEHICULES ──────────────────────────────────────
@bp.route("/api/vehicules")
@api_login_required
def veh_list():
    ensure_seed(cid())
    return jsonify(rows("SELECT * FROM vehicules WHERE compte_id=? ORDER BY id ASC", (cid(),)))


@bp.route("/api/vehicules", methods=["POST"])
@api_login_required
def veh_add():
    v = request.get_json(silent=True) or {}
    if not (v.get("nom") or "").strip():
        return jsonify({"error": "nom requis"}), 400
    db = get_db()
    db.execute("INSERT INTO vehicules (compte_id,nom,marque,modele,immatriculation,annee,created_at) "
               "VALUES (?,?,?,?,?,?,?)",
               (cid(), v["nom"].strip(), v.get("marque", ""), v.get("modele", ""),
                v.get("immatriculation", ""), v.get("annee"), time.strftime("%Y-%m-%dT%H:%M:%S")))
    db.commit()
    return jsonify({"id": db.execute("SELECT last_insert_rowid()").fetchone()[0]})


@bp.route("/api/vehicules/<vid>", methods=["PUT"])
@api_login_required
def veh_update(vid):
    v = request.get_json(silent=True) or {}
    db = get_db()
    db.execute("UPDATE vehicules SET nom=?,marque=?,modele=?,immatriculation=?,annee=? WHERE id=? AND compte_id=?",
               (v.get("nom"), v.get("marque", ""), v.get("modele", ""), v.get("immatriculation", ""),
                v.get("annee"), vid, cid()))
    db.commit()
    return jsonify({"ok": True})


@bp.route("/api/vehicules/<vid>", methods=["DELETE"])
@api_login_required
def veh_delete(vid):
    db = get_db()
    n = db.execute("SELECT COUNT(*) FROM vehicules WHERE compte_id=?", (cid(),)).fetchone()[0]
    if n <= 1:
        return jsonify({"error": "Impossible de supprimer le dernier véhicule."}), 400
    autre = one("SELECT id FROM vehicules WHERE compte_id=? AND id!=? ORDER BY id ASC LIMIT 1", (cid(), vid))
    if autre:
        db.execute("UPDATE pleins SET vehicule_id=? WHERE compte_id=? AND vehicule_id=?", (autre["id"], cid(), vid))
        db.execute("UPDATE entretiens SET vehicule_id=? WHERE compte_id=? AND vehicule_id=?", (autre["id"], cid(), vid))
    db.execute("DELETE FROM vehicules WHERE id=? AND compte_id=?", (vid, cid()))
    db.commit()
    return jsonify({"ok": True, "reassignedTo": autre["id"] if autre else None})


# ─────────────────────────── TYPES D'ENTRETIEN ──────────────────────────────
@bp.route("/api/types")
@api_login_required
def types_list():
    ensure_seed(cid())
    return jsonify(rows("SELECT * FROM types_entretien WHERE compte_id=? ORDER BY nom ASC", (cid(),)))


@bp.route("/api/types", methods=["POST"])
@api_login_required
def types_add():
    nom = ((request.get_json(silent=True) or {}).get("nom") or "").strip()
    if not nom:
        return jsonify({"error": "nom requis"}), 400
    db = get_db()
    try:
        db.execute("INSERT INTO types_entretien (compte_id,nom) VALUES (?,?)", (cid(), nom))
        db.commit()
        return jsonify({"id": db.execute("SELECT last_insert_rowid()").fetchone()[0]})
    except Exception:
        return jsonify({"error": "Ce type existe déjà."}), 409


@bp.route("/api/types/<tid>", methods=["DELETE"])
@api_login_required
def types_delete(tid):
    db = get_db()
    db.execute("DELETE FROM types_entretien WHERE id=? AND compte_id=?", (tid, cid()))
    db.commit()
    return jsonify({"ok": True})


# ─────────────────────────── ENTRETIENS ─────────────────────────────────────
def _entretien_with_files(e):
    e["fichiers"] = rows("SELECT id, filename, original_name, mimetype FROM entretien_fichiers WHERE entretien_id=?",
                         (e["id"],))
    return e


@bp.route("/api/entretiens")
@api_login_required
def ent_list():
    veh = request.args.get("vehicule")
    if veh:
        lst = rows("SELECT * FROM entretiens WHERE compte_id=? AND vehicule_id=? ORDER BY date DESC, id DESC", (cid(), veh))
    else:
        lst = rows("SELECT * FROM entretiens WHERE compte_id=? ORDER BY date DESC, id DESC", (cid(),))
    return jsonify([_entretien_with_files(e) for e in lst])


@bp.route("/api/entretiens", methods=["POST"])
@api_login_required
def ent_add():
    e = request.get_json(silent=True) or {}
    if not e.get("date"):
        return jsonify({"error": "date requise"}), 400
    eid = int(time.time() * 1000)
    db = get_db()
    db.execute("INSERT INTO entretiens (id,compte_id,vehicule_id,date,km,categorie,commentaire,cout,created_at) "
               "VALUES (?,?,?,?,?,?,?,?,?)",
               (eid, cid(), e.get("vehicule_id"), e["date"], e.get("km"), e.get("categorie", ""),
                e.get("commentaire", ""), e.get("cout", 0), time.strftime("%Y-%m-%dT%H:%M:%S")))
    db.commit()
    return jsonify({"id": eid})


@bp.route("/api/entretiens/<eid>", methods=["PUT"])
@api_login_required
def ent_update(eid):
    e = request.get_json(silent=True) or {}
    db = get_db()
    db.execute("UPDATE entretiens SET date=?,km=?,categorie=?,commentaire=?,cout=? WHERE id=? AND compte_id=?",
               (e.get("date"), e.get("km"), e.get("categorie", ""), e.get("commentaire", ""),
                e.get("cout", 0), eid, cid()))
    db.commit()
    return jsonify({"ok": True})


@bp.route("/api/entretiens/<eid>", methods=["DELETE"])
@api_login_required
def ent_delete(eid):
    db = get_db()
    if one("SELECT id FROM entretiens WHERE id=? AND compte_id=?", (eid, cid())):
        for f in rows("SELECT filename FROM entretien_fichiers WHERE entretien_id=?", (eid,)):
            try:
                os.unlink(os.path.join(uploads_dir(), f["filename"]))
            except OSError:
                pass
        db.execute("DELETE FROM entretien_fichiers WHERE entretien_id=?", (eid,))
        db.execute("DELETE FROM entretiens WHERE id=? AND compte_id=?", (eid, cid()))
        db.commit()
    return jsonify({"ok": True})


@bp.route("/api/entretiens/<eid>/fichiers", methods=["POST"])
@api_login_required
def ent_upload(eid):
    if not one("SELECT id FROM entretiens WHERE id=? AND compte_id=?", (eid, cid())):
        return jsonify({"error": "entretien introuvable"}), 404
    db = get_db()
    count = 0
    for f in request.files.getlist("fichiers"):
        if f.mimetype not in ALLOWED_MIME:
            continue
        ext = os.path.splitext(f.filename or "")[1].lower()
        safe = f"{int(time.time()*1000)}-{uuid.uuid4().hex[:8]}{ext}"
        f.save(os.path.join(uploads_dir(), safe))
        db.execute("INSERT INTO entretien_fichiers (entretien_id,filename,original_name,mimetype) VALUES (?,?,?,?)",
                   (eid, safe, f.filename, f.mimetype))
        count += 1
    db.commit()
    return jsonify({"ok": True, "count": count})


@bp.route("/api/entretiens/fichiers/<fid>", methods=["DELETE"])
@api_login_required
def ent_file_delete(fid):
    # Vérifier l'appartenance via l'entretien du compte
    f = one("SELECT ef.filename FROM entretien_fichiers ef JOIN entretiens e ON e.id=ef.entretien_id "
            "WHERE ef.id=? AND e.compte_id=?", (fid, cid()))
    if f:
        try:
            os.unlink(os.path.join(uploads_dir(), f["filename"]))
        except OSError:
            pass
        get_db().execute("DELETE FROM entretien_fichiers WHERE id=?", (fid,))
        get_db().commit()
    return jsonify({"ok": True})


@bp.route("/api/entretiens/export/pdf")
@api_login_required
def ent_export_pdf():
    veh = request.args.get("vehicule")
    vehicule = one("SELECT * FROM vehicules WHERE id=? AND compte_id=?", (veh, cid())) if veh else None
    if veh:
        ents = rows("SELECT * FROM entretiens WHERE compte_id=? AND vehicule_id=? ORDER BY date ASC, id ASC", (cid(), veh))
    else:
        ents = rows("SELECT * FROM entretiens WHERE compte_id=? ORDER BY date ASC, id ASC", (cid(),))
    for e in ents:
        _entretien_with_files(e)
    pdf_bytes = _build_carnet_pdf(ents, vehicule)
    from flask import Response
    return Response(pdf_bytes, mimetype="application/pdf",
                    headers={"Content-Disposition": 'attachment; filename="carnet-entretien.pdf"'})


def _build_carnet_pdf(entretiens, vehicule):
    """Assemble le carnet : récap + pièces jointes (images + PDF fusionnés)."""
    from fpdf import FPDF
    from pypdf import PdfReader, PdfWriter

    def clean(s):
        return str(s or "").encode("latin-1", "replace").decode("latin-1")

    # 1) Récapitulatif via fpdf2
    rec = FPDF(format="A4", unit="pt")
    rec.set_auto_page_break(True, margin=50)
    rec.add_page()
    rec.set_font("Helvetica", "B", 22)
    rec.cell(0, 26, "Carnet d'entretien", ln=1)
    rec.set_font("Helvetica", "", 10)
    if vehicule:
        ligne = " · ".join(x for x in [vehicule["nom"], (vehicule["marque"] or "") + " " + (vehicule["modele"] or ""),
                                       vehicule["immatriculation"], str(vehicule["annee"] or "")] if x and x.strip())
        rec.set_font("Helvetica", "B", 12)
        rec.cell(0, 16, clean(ligne), ln=1)
        rec.set_font("Helvetica", "", 10)
    total = sum((e.get("cout") or 0) for e in entretiens)
    rec.cell(0, 14, clean(f"{len(entretiens)} intervention(s) · Total {total:.2f} EUR"), ln=1)
    rec.ln(8)
    rec.set_font("Helvetica", "B", 9)
    rec.cell(70, 16, "Date", border="B")
    rec.cell(55, 16, "Km", border="B")
    rec.cell(110, 16, "Categorie", border="B")
    rec.cell(55, 16, "Cout", border="B")
    rec.cell(0, 16, "Commentaire", border="B", ln=1)
    rec.set_font("Helvetica", "", 9)
    for e in entretiens:
        dt = "/".join(reversed((e["date"] or "").split("-")))
        rec.cell(70, 14, clean(dt))
        rec.cell(55, 14, clean(str(e.get("km") or "-")))
        rec.cell(110, 14, clean(e.get("categorie") or "-"))
        rec.cell(55, 14, clean(f"{(e.get('cout') or 0):.2f}"))
        rec.multi_cell(0, 14, clean(e.get("commentaire") or ""), ln=1)
    recap_bytes = bytes(rec.output())

    writer = PdfWriter()
    for pg in PdfReader(io.BytesIO(recap_bytes)).pages:
        writer.add_page(pg)

    # 2) Pièces jointes, dans l'ordre
    for e in entretiens:
        for f in e.get("fichiers", []):
            path = os.path.join(uploads_dir(), f["filename"])
            if not os.path.isfile(path):
                continue
            legende = f"{'/'.join(reversed((e['date'] or '').split('-')))} - {clean(e.get('categorie') or 'Entretien')}"
            if f["mimetype"] == "application/pdf":
                try:
                    for pg in PdfReader(path).pages:
                        writer.add_page(pg)
                except Exception:
                    pass
            else:
                try:
                    img = FPDF(format="A4", unit="pt")
                    img.add_page()
                    img.set_font("Helvetica", "B", 9)
                    img.cell(0, 14, clean(legende), ln=1)
                    img.image(path, x=50, y=40, w=495)
                    for pg in PdfReader(io.BytesIO(bytes(img.output()))).pages:
                        writer.add_page(pg)
                except Exception:
                    pass

    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


# ─────────────────────────── FAVORIS ────────────────────────────────────────
def _fav(row):
    row["prix"] = json.loads(row.get("prix_json") or "{}")
    return row


@bp.route("/api/favoris")
@api_login_required
def fav_list():
    return jsonify([_fav(r) for r in rows("SELECT * FROM favoris WHERE compte_id=?", (cid(),))])


@bp.route("/api/favoris/refresh-prix")
@api_login_required
def fav_refresh():
    favs = rows("SELECT * FROM favoris WHERE compte_id=?", (cid(),))
    if not favs:
        return jsonify([])
    try:
        import requests
        ids = ",".join(str(f["id"]).replace("'", "") for f in favs if str(f["id"]).isdigit())
        r = requests.get(GOV_URL, params={"limit": 100, "where": f"id IN ({ids})"},
                         headers={"Accept": "application/json"}, timeout=15)
        db = get_db()
        for s in (r.json().get("results") or []):
            prix = {}
            for key, field in (("Diesel", "gazole_prix"), ("E10", "e10_prix"), ("SP95", "sp95_prix"),
                               ("SP98", "sp98_prix"), ("E85", "e85_prix")):
                v = prix_valide(s.get(field))
                if v is not None:
                    prix[key] = v
            db.execute("UPDATE favoris SET prix_json=? WHERE id=? AND compte_id=?",
                       (json.dumps(prix), str(s.get("id")), cid()))
        db.commit()
    except Exception as exc:
        current_app.logger.warning("refresh-prix: %s", exc)
    return jsonify([_fav(r) for r in rows("SELECT * FROM favoris WHERE compte_id=?", (cid(),))])


@bp.route("/api/favoris", methods=["POST"])
@api_login_required
def fav_add():
    f = request.get_json(silent=True) or {}
    db = get_db()
    db.execute("INSERT OR REPLACE INTO favoris (id,compte_id,nom,adresse,lat,lng,ville,prix_json) "
               "VALUES (?,?,?,?,?,?,?,?)",
               (str(f.get("id")), cid(), f.get("nom"), f.get("adresse", ""), f.get("lat"), f.get("lng"),
                f.get("ville", ""), json.dumps(f.get("prix") or {})))
    db.commit()
    return jsonify({"ok": True})


@bp.route("/api/favoris/<fid>", methods=["PATCH"])
@api_login_required
def fav_rename(fid):
    nom = (request.get_json(silent=True) or {}).get("nom")
    get_db().execute("UPDATE favoris SET nom=? WHERE id=? AND compte_id=?", (nom, fid, cid()))
    get_db().commit()
    return jsonify({"ok": True})


@bp.route("/api/favoris/<fid>", methods=["DELETE"])
@api_login_required
def fav_delete(fid):
    get_db().execute("DELETE FROM favoris WHERE id=? AND compte_id=?", (fid, cid()))
    get_db().commit()
    return jsonify({"ok": True})


# ─────────────────────────── STATIONS (proxy API gouv) ──────────────────────
def _station_from_gov(s, lat, lng):
    import math
    geo = s.get("geom") or {}
    sLat = geo.get("lat") if geo else (int(s["latitude"]) / 100000 if s.get("latitude") else None)
    sLng = geo.get("lon") if geo else (int(s["longitude"]) / 100000 if s.get("longitude") else None)
    prix = {}
    for key, field in (("Diesel", "gazole_prix"), ("E10", "e10_prix"), ("SP95", "sp95_prix"),
                       ("SP98", "sp98_prix"), ("E85", "e85_prix")):
        v = prix_valide(s.get(field))
        if v is not None:
            prix[key] = v
    dist = None
    if sLat and sLng and lat and lng:
        R = 6371
        dLat = math.radians(sLat - lat)
        dLng = math.radians(sLng - lng)
        a = (math.sin(dLat / 2) ** 2 + math.cos(math.radians(lat)) * math.cos(math.radians(sLat)) * math.sin(dLng / 2) ** 2)
        dist = round(R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)) * 10) / 10
    enseignes = s.get("enseignes")
    nom = (enseignes[0] if isinstance(enseignes, list) and enseignes else enseignes) or s.get("brand") \
        or f"Station {s.get('ville', '')}".strip()
    adresse = ", ".join(x for x in [s.get("adresse"), s.get("cp"), s.get("ville")] if x)
    return {"id": str(s.get("id")), "nom": nom, "adresse": adresse, "ville": s.get("ville", ""),
            "lat": sLat, "lng": sLng, "dist": dist, "prix": prix, "maj": "N/A", "services": []}


@bp.route("/api/stations")
@api_login_required
def stations():
    lat = request.args.get("lat", type=float)
    lng = request.args.get("lng", type=float)
    rayon = request.args.get("rayon", default=40, type=float)
    if lat is None or lng is None:
        return jsonify({"error": "lat et lng requis"}), 400
    try:
        import requests
        where = f"within_distance(geom,GEOM'POINT({lng} {lat})',{rayon}km)"
        r = requests.get(GOV_URL, params={"limit": 100, "where": where},
                         headers={"Accept": "application/json"}, timeout=12)
        data = r.json()
        stations = [_station_from_gov(s, lat, lng) for s in (data.get("results") or [])]
        stations = [s for s in stations if s["lat"] and s["lng"] and (s["dist"] or 0) <= rayon]
        stations.sort(key=lambda s: s["dist"])
        return jsonify({"stations": stations})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@bp.route("/api/stations/by-id/<sid>")
@api_login_required
def station_by_id(sid):
    try:
        import requests
        r = requests.get(GOV_URL, params={"limit": 1, "where": f"id={sid}"},
                         headers={"Accept": "application/json"}, timeout=12)
        res = (r.json().get("results") or [])
        if not res:
            return jsonify({"station": None})
        return jsonify({"station": _station_from_gov(res[0], None, None)})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ─────────────────────────── DONNÉES (CSV / backup / import) ─────────────────
def _csv(headers, data_rows):
    def esc(v):
        s = "" if v is None else str(v)
        s = s.replace('"', '""')
        return f'"{s}"' if any(c in s for c in ';"\n') else s
    lines = [";".join(headers)] + [";".join(esc(c) for c in r) for r in data_rows]
    return "﻿" + "\r\n".join(lines)


def _csv_response(name, csv):
    from flask import Response
    return Response(csv, mimetype="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


@bp.route("/api/donnees/csv/pleins")
@api_login_required
def csv_pleins():
    veh = request.args.get("vehicule")
    q = "SELECT * FROM pleins WHERE compte_id=?" + (" AND vehicule_id=?" if veh else "") + " ORDER BY date ASC, id ASC"
    pl = rows(q, (cid(), veh) if veh else (cid(),))
    headers = ["Date", "Type entrée", "Carburant", "Km départ", "Km total", "Km parcourus",
               "ODB annoncé (km)", "ODB restant (km)", "Total (€)", "Litres", "Prix/L (€)", "Conso (L/100km)", "Station"]
    out = []
    for p in pl:
        km = (p["kmTotal"] - p["kmDepart"]) if (p["kmTotal"] is not None and p["kmDepart"] is not None) else None
        conso = f"{p['litres']/km*100:.2f}".replace(".", ",") if (p["litres"] and km and km > 0) else ""
        nb = lambda v: "" if v is None else str(v).replace(".", ",")
        out.append([p["date"], "Ajout" if p["estPlein"] == 0 else "Plein", p["type"], p["kmDepart"], p["kmTotal"],
                    km, p["estimPlein"], p["estimRestante"], nb(p["total"]), nb(p["litres"]), nb(p["prixL"]),
                    conso, p["station"]])
    return _csv_response("pleins.csv", _csv(headers, out))


@bp.route("/api/donnees/csv/entretiens")
@api_login_required
def csv_entretiens():
    veh = request.args.get("vehicule")
    q = "SELECT * FROM entretiens WHERE compte_id=?" + (" AND vehicule_id=?" if veh else "") + " ORDER BY date ASC, id ASC"
    ents = rows(q, (cid(), veh) if veh else (cid(),))
    headers = ["Date", "Kilométrage", "Catégorie", "Coût (€)", "Commentaire"]
    out = [[e["date"], e["km"], e["categorie"], str(e["cout"] or 0).replace(".", ","), e["commentaire"]] for e in ents]
    return _csv_response("entretiens.csv", _csv(headers, out))


@bp.route("/api/donnees/backup")
@api_login_required
def backup():
    import base64
    from flask import Response
    fichiers = []
    for f in rows("SELECT ef.* FROM entretien_fichiers ef JOIN entretiens e ON e.id=ef.entretien_id WHERE e.compte_id=?", (cid(),)):
        try:
            with open(os.path.join(uploads_dir(), f["filename"]), "rb") as fh:
                f["data"] = base64.b64encode(fh.read()).decode()
        except OSError:
            f["data"] = None
        fichiers.append(f)
    payload = {
        "app": "fuellog", "version": 2, "exported_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "vehicules": rows("SELECT * FROM vehicules WHERE compte_id=?", (cid(),)),
        "types_entretien": rows("SELECT * FROM types_entretien WHERE compte_id=?", (cid(),)),
        "pleins": rows("SELECT * FROM pleins WHERE compte_id=?", (cid(),)),
        "entretiens": rows("SELECT * FROM entretiens WHERE compte_id=?", (cid(),)),
        "favoris": rows("SELECT * FROM favoris WHERE compte_id=?", (cid(),)),
        "entretien_fichiers": fichiers,
    }
    stamp = time.strftime("%Y-%m-%d")
    return Response(json.dumps(payload), mimetype="application/json; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="fuellog-backup-{stamp}.json"'})


@bp.route("/api/donnees/import", methods=["POST"])
@api_login_required
def data_import():
    """Restaure une sauvegarde dans le compte courant (remappe les ids véhicules
    pour éviter toute collision entre comptes). Accepte les sauvegardes Node."""
    import base64
    b = request.get_json(silent=True) or {}
    if b.get("app") != "fuellog" or not isinstance(b.get("pleins"), list):
        return jsonify({"error": "Fichier de sauvegarde invalide."}), 400
    me = cid()
    db = get_db()
    try:
        # Purge des données du compte
        for eid in [r["id"] for r in rows("SELECT id FROM entretiens WHERE compte_id=?", (me,))]:
            db.execute("DELETE FROM entretien_fichiers WHERE entretien_id=?", (eid,))
        db.execute("DELETE FROM entretiens WHERE compte_id=?", (me,))
        db.execute("DELETE FROM pleins WHERE compte_id=?", (me,))
        db.execute("DELETE FROM favoris WHERE compte_id=?", (me,))
        db.execute("DELETE FROM types_entretien WHERE compte_id=?", (me,))
        db.execute("DELETE FROM vehicules WHERE compte_id=?", (me,))

        vmap = {}
        for v in b.get("vehicules", []):
            db.execute("INSERT INTO vehicules (compte_id,nom,marque,modele,immatriculation,annee,created_at) "
                       "VALUES (?,?,?,?,?,?,?)", (me, v.get("nom", "Véhicule"), v.get("marque", ""),
                                                  v.get("modele", ""), v.get("immatriculation", ""),
                                                  v.get("annee"), v.get("created_at")))
            vmap[v.get("id")] = db.execute("SELECT last_insert_rowid()").fetchone()[0]
        default_v = next(iter(vmap.values()), None)

        for t in b.get("types_entretien", []):
            db.execute("INSERT OR IGNORE INTO types_entretien (compte_id,nom) VALUES (?,?)", (me, t.get("nom")))

        for p in b.get("pleins", []):
            db.execute("INSERT INTO pleins (compte_id,vehicule_id,date,type,kmDepart,kmTotal,estimPlein,"
                       "estimRestante,total,litres,prixL,station,estPlein) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                       (me, vmap.get(p.get("vehicule_id"), default_v), p.get("date"), p.get("type"),
                        p.get("kmDepart"), p.get("kmTotal"), p.get("estimPlein"), p.get("estimRestante"),
                        p.get("total", 0), p.get("litres", 0), p.get("prixL", 0), p.get("station", ""),
                        1 if p.get("estPlein", 1) else 0))

        emap = {}
        for e in b.get("entretiens", []):
            db.execute("INSERT INTO entretiens (compte_id,vehicule_id,date,km,categorie,commentaire,cout,created_at) "
                       "VALUES (?,?,?,?,?,?,?,?)", (me, vmap.get(e.get("vehicule_id"), default_v), e.get("date"),
                                                    e.get("km"), e.get("categorie", ""), e.get("commentaire", ""),
                                                    e.get("cout", 0), e.get("created_at")))
            emap[e.get("id")] = db.execute("SELECT last_insert_rowid()").fetchone()[0]

        for f in b.get("entretien_fichiers", []):
            new_eid = emap.get(f.get("entretien_id"))
            if not new_eid:
                continue
            db.execute("INSERT INTO entretien_fichiers (entretien_id,filename,original_name,mimetype) VALUES (?,?,?,?)",
                       (new_eid, f.get("filename"), f.get("original_name", ""), f.get("mimetype", "")))
            if f.get("data"):
                try:
                    with open(os.path.join(uploads_dir(), f["filename"]), "wb") as fh:
                        fh.write(base64.b64decode(f["data"]))
                except OSError:
                    pass

        for f in b.get("favoris", []):
            db.execute("INSERT OR REPLACE INTO favoris (id,compte_id,nom,adresse,lat,lng,ville,prix_json) "
                       "VALUES (?,?,?,?,?,?,?,?)", (str(f.get("id")), me, f.get("nom"), f.get("adresse", ""),
                                                    f.get("lat"), f.get("lng"), f.get("ville", ""),
                                                    f.get("prix_json") or "{}"))
        db.commit()
        return jsonify({"ok": True, "vehicules": len(b.get("vehicules", [])), "pleins": len(b.get("pleins", [])),
                        "entretiens": len(b.get("entretiens", []))})
    except Exception as exc:
        db.rollback()
        current_app.logger.exception("import")
        return jsonify({"error": f"Import échoué : {exc}"}), 500
