"""Build the Vérandas atlas from its lightweight sheets. Run from any directory.

Dependencies: numpy, pillow, opencv-python, reportlab, pypdf, fonttools[woff].
The source PDFs are copied as reference pages only; they are never rasterized.
"""
import io
import json
import tempfile
import subprocess
import shutil
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from pypdf import PdfReader, PdfWriter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont as PDFFont
from reportlab.lib.pagesizes import A3, landscape
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen.canvas import Canvas

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT / 'projects/residence-verandas'
SHEETS = PROJECT / 'planches'
ED = json.loads((PROJECT / 'project.json').read_text('utf8'))['edition']
# Masks traced inside the wall faces on 375 x 530 reference thumbnails.
# Intentional gaps: stairs, bathrooms, kitchen, unassigned spaces and margins.
MASKS = {
    '063306': {'oak': [[(61,92),(146,92),(146,177),(61,177)],
                       [(61,231),(134,231),(134,214),(185,214),(185,229),(312,229),(312,340),(61,340)]],
               'stone': [[(60,347),(314,347),(314,377),(60,377)],[(189,55),(313,55),(313,85),(189,85)]]},
    '063245': {'oak': [[(62,94),(146,94),(146,177),(62,177)],[(191,94),(310,94),(310,176),(191,176)],
                       [(62,232),(185,232),(185,340),(62,340)],[(232,259),(311,259),(311,341),(232,341)]],
               'stone': [[(61,348),(311,348),(311,376),(61,376)]]},
}
TECH = {'063304','063228','063240','063308'}

# Footprints of the furnishings already drawn on the WebPs (thumbnail coordinates).
# Dress the existing symbols rather than stamping a second bed over a dimension.
FURNISH = {'063306': [('bed',72,106,106,144),('sofa',83,266,100,305),('sofa',130,265,148,305),('table',222,173,250,191)],
           '063245': [('bed',73,118,106,146),('bed',218,96,245,132),('bed',260,96,288,132),('bed',259,275,291,309),('table',108,277,148,321)]}
TILES = {'063306':[(152,93,183,144),(191,92,311,149)],'063245':[(152,95,183,149),(232,183,310,216)]}


def render(path):
    code = path.stem
    src = np.asarray(Image.open(path).convert('RGB'))
    h,w = src.shape[:2]
    y,x = np.ogrid[:h,:w]
    rng = np.random.default_rng(int(code))
    # Only light, low-chroma paper accepts a wash. CAD colours remain intact.
    lo = src.min(2).astype('float32'); chroma = src.max(2) - lo
    paper = np.clip((lo-185)/50,0,1) * np.clip((52-chroma)/30,0,1)
    fine = rng.normal(0,.75,(h,w)).astype('float32')
    tone = np.empty(src.shape,'float32'); tone[:] = [3,4,7] if code in TECH else [1,3,7]
    tone += fine[:,:,None]
    gray = cv2.cvtColor(src,cv2.COLOR_RGB2GRAY)
    relief = np.zeros((h,w),np.uint8)
    if code in MASKS:
        for material, polygons in MASKS[code].items():
            mask = np.zeros((h,w),np.uint8)
            if material=='stone':
                polygons = polygons + [[(l,t),(r,t),(r,b),(l,b)] for l,t,r,b in TILES[code]]
            for polygon in polygons:
                cv2.fillPoly(mask,[np.rint(np.array(polygon)*[w/375,h/530]).astype('int32')],1)
            if material == 'oak':
                row = y//17; phase = (x+row*53)//146
                grain = 4*np.sin(y*.92 + 2*np.sin(x/65+row)) + 3*np.cos(y*.41+x/113)
                sheen = -12*np.exp(-((x%410-210)/76)**2)
                detail = grain + sheen + 7*np.sin(row*9+phase*4) + 19*((y%17<2)|((x+row*53)%146<2))
                tint = [22,65,100]
            else:
                vein = np.sin(y/5+x/45+2*np.sin(x/86)+np.sin(y/35))
                detail = fine*1.8 + 7*vein + 9*np.maximum(0,vein-.6)*3 + 15*((y%38<2)|((x+(y//38)*38)%76<2))
                tint = [7,23,43]
            tone += mask[:,:,None]*(np.array(tint)+detail[:,:,None])
        # Local textile weave, upholstered edges and natural stone tabletops. Retain ink.
        for kind,l,t,r,b in FURNISH[code]:
            x0,x1=round(l*w/375),round(r*w/375); y0,y1=round(t*h/530),round(b*h/530)
            yy,xx=np.mgrid[0:y1-y0,0:x1-x0];u=xx/(x1-x0);v=yy/(y1-y0)
            valid=gray[y0:y1,x0:x1]>115
            edge=np.minimum.reduce([u,1-u,v,1-v]); bevel=14*np.exp(-edge*35)
            if kind=='bed':
                base=np.where((v<.24)[:,:,None],[241,225,197],[151,176,160]);pattern=4*np.cos(xx/3)+3*np.sin(yy/5)+18*(v>.81)
            elif kind=='sofa':
                base=np.array([210,166,105]);pattern=3*np.sin(xx*1.3)+6*np.cos(yy/13)-12*((v%.33)<.025)
            else:
                base=np.array([197,175,146]);pattern=7*np.cos(xx/8+yy/12+np.sin(xx/7))
            rgb=src[y0:y1,x0:x1].astype('float32');target=base+(pattern-bevel)[:,:,None]; blend=np.clip((gray[y0:y1,x0:x1].astype(float)-115)/74,0,1)*valid
            tone[y0:y1,x0:x1]=(rgb-target)*blend[:,:,None];paper[y0:y1,x0:x1]=blend
        # Long dark orthogonal runs only: exclude dimensions and fine lettering.
        dark = (gray<125).astype('uint8')*255
        relief = np.maximum(cv2.morphologyEx(dark,cv2.MORPH_OPEN,np.ones((3,38),np.uint8)),
                            cv2.morphologyEx(dark,cv2.MORPH_OPEN,np.ones((38,3),np.uint8)))
        relief[:int(.16*h)] = 0; relief[int(.655*h):] = 0
        relief[:,:int(.15*w)] = 0; relief[:,int(.85*w):] = 0
    elif code in {'063304','063228'}:
        # Red footing/column symbols inside the drawing, never the red title frame.
        r,g,b = src.astype('int16').transpose(2,0,1)
        relief = (((r-g>32)&(r-b>32)&(x>w*.16)&(x<w*.85)&(y>h*.1)&(y<h*.80))*255).astype('uint8')
        relief = cv2.dilate(relief,np.ones((5,5),np.uint8))
    elif code == '063243':
        # Landscape only where the original already identifies vegetation in green.
        r,g,b = src.astype('int16').transpose(2,0,1)
        grass = (g-r>14)&(g-b>12)&(gray>110)
        tone += grass[:,:,None]*(np.array([62,20,70])+fine[:,:,None]*3)
        paper = np.maximum(paper,grass*.95)
        # Tree crowns and canopy bounds cast graphic shadows onto the existing site ground.
        relief = ((grass&(gray<195))*255).astype('uint8'); relief=cv2.dilate(relief,np.ones((4,4),np.uint8))
        outline=cv2.morphologyEx((gray<185).astype('uint8')*255,cv2.MORPH_OPEN,np.ones((1,55),np.uint8));relief=np.maximum(relief,outline*((x>w*.17)&(x<w*.81)&(y>h*.07)&(y<h*.69)))
    elif code not in TECH:
        # Elevations: shallow relief derived from the actual cornices and eaves.
        relief = cv2.morphologyEx((gray<160).astype('uint8')*255,cv2.MORPH_OPEN,np.ones((2,34),np.uint8))
        relief[:int(.10*h)] = 0; relief[int(.79*h):] = 0
        relief[:,:int(.13*w)] = 0; relief[:,int(.88*w):] = 0
    shadow = cv2.GaussianBlur(cv2.warpAffine(relief,np.float32([[1,0,4],[0,1,5]]),(w,h)),(0,0),3.5)
    tone += shadow[:,:,None]*(.31 if code in MASKS or code=='063243' else .11)
    out = src.astype('float32') - paper[:,:,None]*tone
    if code in TECH:  # Monotone contrast lift; never erode, threshold or replace a source line.
        out -= (3*(1-gray/255))[:,:,None]
    return Image.fromarray(np.clip(out,0,255).astype('uint8'))


def enable_tabular_figures(font):
    """Make the OpenType tnum alternates the default cmap digits for ReportLab."""
    gsub = getattr(font.get('GSUB'), 'table', None)
    if not gsub:
        return
    replacements = {}
    for feature in gsub.FeatureList.FeatureRecord:
        if feature.FeatureTag != 'tnum':
            continue
        for index in feature.Feature.LookupListIndex:
            lookup = gsub.LookupList.Lookup[index]
            for subtable in lookup.SubTable:
                replacements.update(getattr(subtable, 'mapping', {}))
    for cmap in font['cmap'].tables:
        for codepoint in range(ord('0'), ord('9') + 1):
            glyph = cmap.cmap.get(codepoint)
            if glyph in replacements:
                cmap.cmap[codepoint] = replacements[glyph]


def measured_project():
    """Use the application estimator as the sole source for area and budget totals."""
    script = r"""
const Cost = require('./js/costEstimate.js');
const project = require('./projects/residence-verandas/project.json');
const settings = Cost.settings({ ...(project.estimate || {}), profile: 'lefisk', standing: 'moyen' });
const estimate = Cost.estimate(project, settings);
process.stdout.write(JSON.stringify({ quantities: estimate.quantities, materials: estimate.materials,
  lots: estimate.lots, total: estimate.total, excluded: estimate.excluded }));
"""
    return json.loads(subprocess.run(['node', '-e', script], cwd=ROOT, check=True,
                                     capture_output=True, text=True).stdout)


def build_synthesis_board(path, plan_images):
    """Create an A3 executive cover while clearly separating source plans from the interpretive model."""
    project = json.loads((PROJECT / 'project.json').read_text('utf8'))
    measured = measured_project()
    q = measured['quantities']
    fmt = lambda n: f'{n:,.1f}'.replace(',', ' ').replace('.', ',')
    whole = lambda n: f'{n:,.0f}'.replace(',', ' ')
    buf = io.BytesIO()
    W, H = landscape(A3)
    c = Canvas(buf, pagesize=(W, H), pageCompression=1)
    ink = (0.11, 0.16, 0.15); muted = (0.39, 0.44, 0.41)
    paper = (0.965, 0.958, 0.929); white = (1, 1, 1)
    green = (0.23, 0.34, 0.28); gold = (0.70, 0.47, 0.25)
    rule = (0.84, 0.83, 0.77); warning = (0.48, 0.27, 0.20)
    c.setFillColorRGB(*paper); c.rect(0, 0, W, H, fill=1, stroke=0)

    margin, gap = 30, 12
    c.setFillColorRGB(*green); c.setFont('Sans', 8)
    c.drawString(margin, H - 31, 'DOSSIER ARCHITECTURAL   /   PRÉSENTATION EXÉCUTIVE')
    c.setFillColorRGB(*gold); c.drawRightString(W - margin, H - 31, 'PLANCHE 01   ·   FORMAT A3 PAYSAGE')
    c.setFillColorRGB(*ink); c.setFont('Serif', 26)
    c.drawString(margin, H - 64, 'RÉSIDENCE DES VÉRANDAS (R+1)')
    c.setFillColorRGB(*muted); c.setFont('Sans', 8)
    c.drawString(margin, H - 81, 'Plans sources, espaces et vues de présentation — lecture préliminaire, à valider avant toute exécution')
    # Cartouche: authorship and orientation are only stated where the source documents support them.
    box_x, box_y, box_w, box_h = W - 319, H - 91, 289, 48
    c.setFillColorRGB(*white); c.roundRect(box_x, box_y, box_w, box_h, 5, fill=1, stroke=0)
    c.setFillColorRGB(*ink); c.setFont('Sans', 7.5)
    c.drawString(box_x + 10, box_y + 31, 'MAÎTRE D’ŒUVRE  M. SYLVAIN   ·   CONCEPTION  M. KOA')
    c.setFillColorRGB(*muted); c.setFont('Sans', 7)
    c.drawString(box_x + 10, box_y + 18, 'Sources datées : septembre 2024  ·  échelle portée sur les plans d’origine')
    c.drawString(box_x + 10, box_y + 7, 'Nord : non repéré sur les extraits consultés — à confirmer')
    c.setStrokeColorRGB(*rule); c.line(margin, H - 99, W - margin, H - 99)

    def panel(x, y, w, h, title, tag=None):
        c.setFillColorRGB(*white); c.roundRect(x, y, w, h, 6, fill=1, stroke=0)
        c.setFillColorRGB(*green); c.setFont('Sans', 8); c.drawString(x + 11, y + h - 17, title.upper())
        if tag:
            c.setFillColorRGB(*muted); c.setFont('Sans', 6.5); c.drawRightString(x + w - 11, y + h - 17, tag)
        c.setStrokeColorRGB(*rule); c.line(x + 10, y + h - 24, x + w - 10, y + h - 24)

    def image_fit(image_path, x, y, w, h):
        if not Path(image_path).exists():
            c.setFillColorRGB(.94, .93, .89); c.rect(x, y, w, h, fill=1, stroke=0)
            c.setFillColorRGB(*muted); c.setFont('Sans', 7); c.drawCentredString(x + w / 2, y + h / 2, 'Visuel indisponible')
            return
        c.drawImage(ImageReader(str(image_path)), x, y, w, h, preserveAspectRatio=True, anchor='c', mask='auto')

    top_y, top_h = 481, 270
    plans_w = 505
    plan_gap = 9
    plan_w = (plans_w - plan_gap) / 2
    panel(margin, top_y, plan_w, top_h, 'Plan d’aménagement · RDC', 'Plan source retouché éditorialement')
    panel(margin + plan_w + plan_gap, top_y, plan_w, top_h, 'Plan d’aménagement · Étage', 'Plan source retouché éditorialement')
    for offset, image in enumerate(plan_images):
        px = margin + offset * (plan_w + plan_gap)
        image_fit(image, px + 8, top_y + 8, plan_w - 16, top_h - 40)
    model_x = margin + plans_w + gap
    model_w = W - margin - model_x
    panel(model_x, top_y, model_w, top_h, 'Vue aérienne de la maquette', 'Toiture en place · modèle interprété')
    image_fit(PROJECT / 'generated/renders/vue-aerienne.jpg', model_x + 9, top_y + 34, model_w - 18, top_h - 67)
    c.setFillColorRGB(*muted); c.setFont('Sans', 6.6)
    c.drawString(model_x + 11, top_y + 12, 'Image de présentation — ne constitue pas une restitution cotée ni une validation des ouvertures.')

    mid_y, mid_h = 173, 295
    table_w = 576
    panel(margin, mid_y, table_w, mid_h, 'Tableau des surfaces par pièce', 'Calcul depuis la maquette — valeurs indicatives')
    rooms = project.get('rooms', [])
    def room_area(room):
        if room.get('poly'):
            poly = room['poly']
            return abs(sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1]
                           for i in range(len(poly))) / 2)
        bounds = room.get('bounds', {})
        return max(0, bounds.get('xMax', 0) - bounds.get('xMin', 0)) * max(0, bounds.get('zMax', 0) - bounds.get('zMin', 0))
    halves = (rooms[:(len(rooms) + 1) // 2], rooms[(len(rooms) + 1) // 2:])
    col_w = (table_w - 26) / 2
    for col, subset in enumerate(halves):
        x = margin + 11 + col * (col_w + 4)
        c.setFillColorRGB(*muted); c.setFont('Sans', 6.5)
        c.drawString(x, mid_y + mid_h - 38, 'NIVEAU / PIÈCE')
        c.drawRightString(x + col_w - 2, mid_y + mid_h - 38, 'm²')
        c.setStrokeColorRGB(*rule); c.line(x, mid_y + mid_h - 42, x + col_w, mid_y + mid_h - 42)
        row_h = 13
        for i, room in enumerate(subset):
            y = mid_y + mid_h - 56 - i * row_h
            if i % 2 == 0:
                c.setFillColorRGB(.97, .965, .945); c.rect(x, y - 3, col_w, row_h, fill=1, stroke=0)
            level = 'RDC' if int(room.get('level', 0)) == 0 else 'Étage'
            name = room.get('name', 'Pièce')
            if len(name) > 27: name = name[:26] + '…'
            c.setFillColorRGB(*ink); c.setFont('Sans', 6.7)
            c.drawString(x + 3, y, f'{level}  ·  {name}')
            c.drawRightString(x + col_w - 4, y, fmt(room_area(room)))
    total_y = mid_y + 25
    c.setFillColorRGB(*green); c.roundRect(margin + 11, total_y - 8, table_w - 22, 26, 4, fill=1, stroke=0)
    c.setFillColorRGB(*white); c.setFont('Sans', 7)
    c.drawString(margin + 20, total_y + 2, f"HABITABLE MODÉLISÉ : {fmt(q['habitable'])} m²")
    c.drawCentredString(margin + table_w / 2 + 5, total_y + 2, f"ANNEXES MODÉLISÉES : {fmt(q['annexes'])} m²")
    c.drawRightString(margin + table_w - 20, total_y + 2, 'Terrasses incluses aux annexes')

    gallery_x = margin + table_w + gap
    gallery_w = W - margin - gallery_x
    panel(gallery_x, mid_y, gallery_w, mid_h, 'Galerie des perspectives', 'Captures de la maquette 3D interprétée')
    shots = [
        ('Façade / perron — maquette', PROJECT / 'generated/images/perspective-01.jpg'),
        ('Séjour — capture de référence', PROJECT / 'generated/renders/r12.jpg'),
        ('Véranda arrière — maquette', PROJECT / 'generated/images/perspective-02.jpg'),
        ('Terrasse haute — maquette', PROJECT / 'generated/images/perspective-05.jpg'),
    ]
    tile_gap, tile_w = 9, (gallery_w - 31) / 2
    tile_h = 113
    for i, (label, image) in enumerate(shots):
        col, row = i % 2, i // 2
        x = gallery_x + 11 + col * (tile_w + tile_gap)
        y = mid_y + mid_h - 143 - row * (tile_h + 5)
        image_fit(image, x, y + 17, tile_w, tile_h - 22)
        c.setFillColorRGB(*muted); c.setFont('Sans', 6.5); c.drawString(x, y + 4, label)

    # A concise but prominent audit note prevents a presentational model from being mistaken for a certified survey.
    note_x, note_y, note_w, note_h = margin, 82, W - 2 * margin, 78
    c.setFillColorRGB(.96, .925, .90); c.roundRect(note_x, note_y, note_w, note_h, 5, fill=1, stroke=0)
    c.setFillColorRGB(*warning); c.setFont('Sans', 7.4)
    c.drawString(note_x + 11, note_y + note_h - 17, 'RÉSERVE DE FIDÉLITÉ — DOCUMENTS À RÉCONCILIER AVANT VALIDATION')
    c.setFillColorRGB(*ink); c.setFont('Sans', 7)
    c.drawString(note_x + 11, note_y + note_h - 32,
                 'Les vues 3D sont une maquette interprétée : les ouvertures, épaisseurs et garde-corps ne sont pas certifiés conformes aux plans.')
    c.drawString(note_x + 11, note_y + note_h - 45,
                 f"Surface habitable calculée de la maquette : {fmt(q['habitable'])} m² ; cumul des pièces explicitement annotées repérées : 215,65 m² (hors zones non annotées).")
    c.drawString(note_x + 11, note_y + note_h - 58,
                 'Les plans RDC/Étage d’origine restent la référence ; aucun chiffre de surface n’est présenté ici comme surface officielle.')

    swatches = [
        ('Enduit clair', '#E7E3D8', (0.91, 0.89, 0.84)),
        ('Tuile foncée', '#46554D', (0.27, 0.33, 0.30)),
        ('Menuiserie alu noir', '#242927', (0.14, 0.16, 0.15)),
        ('Pierre naturelle', '#B7A88F', (0.72, 0.66, 0.55)),
        ('Parquet chêne', '#B98B58', (0.73, 0.55, 0.35)),
    ]
    sw_y, sw_h = 25, 46
    sw_gap = 9; sw_w = (W - 2 * margin - 4 * sw_gap) / 5
    for i, (label, hex_code, color) in enumerate(swatches):
        x = margin + i * (sw_w + sw_gap)
        c.setFillColorRGB(*white); c.roundRect(x, sw_y, sw_w, sw_h, 4, fill=1, stroke=0)
        c.setFillColorRGB(*color); c.roundRect(x + 7, sw_y + 8, 30, 30, 3, fill=1, stroke=0)
        c.setFillColorRGB(*ink); c.setFont('Sans', 7); c.drawString(x + 45, sw_y + 26, label)
        c.setFillColorRGB(*muted); c.setFont('Sans', 6); c.drawString(x + 45, sw_y + 13, hex_code + ' · teinte indicative')
    c.showPage(); c.save(); buf.seek(0)
    with open(path, 'wb') as out: out.write(buf.getvalue())


def build_estimate_board(path):
    """Render the investor-grade, measured-cost sheet using the same JS estimator as the Atlas."""
    script = r"""
const Cost = require('./js/costEstimate.js');
const project = require('./projects/residence-verandas/project.json');
const settings = Cost.settings({ ...(project.estimate || {}), profile: 'lefisk', standing: 'moyen' });
const estimate = Cost.estimate(project, settings);
process.stdout.write(JSON.stringify({ quantities: estimate.quantities, materials: estimate.materials,
  lots: estimate.lots, total: estimate.total, excluded: estimate.excluded }));
"""
    measured = json.loads(subprocess.run(['node', '-e', script], cwd=ROOT, check=True,
                                          capture_output=True, text=True).stdout)
    q = measured['quantities']
    material = {item['id']: item['quantity'] for item in measured['materials']}
    whole = lambda n: f'{n:,.0f}'.replace(',', ' ')
    decimal = lambda n: f'{n:,.1f}'.replace(',', ' ').replace('.', ',')
    xaf = lambda n: f"{whole(round(n / 1000) * 1000)} FCFA"
    budget = measured['lots'][0]
    finishing = measured['lots'][1]
    rows = [
        ('Gros œuvre',
         f"Parpaings 15 / 20 : {whole(material.get('parpaing-15', 0))} / {whole(material.get('parpaing-20', 0))} u\nCouverture : {decimal(q['roofArea'])} m²",
         budget['low'], budget['high']),
        ('Second œuvre',
         f"Ouvertures : {whole(q['doors'] + q['windows'] + q['bays'])} portes, fenêtres & baies\nSurfaces desservies : {decimal(q['habitable'])} m² habitables",
         finishing['low'] * .65, finishing['high'] * .65),
        ('Revêtements / Finitions',
         f"Carrelage métré : {decimal(q['tiledArea'])} m²\nAnnexes : {decimal(q['annexes'])} m²",
         finishing['low'] * .35, finishing['high'] * .35),
    ]

    buf = io.BytesIO()
    c = Canvas(buf, pagesize=(842, 595), pageCompression=1)
    W, H = 842, 595
    ink = (0.10, 0.15, 0.16); muted = (0.40, 0.45, 0.43)
    rule = (0.82, 0.82, 0.76); paper = (0.965, 0.958, 0.929)
    green = (0.25, 0.35, 0.29); gold = (0.72, 0.48, 0.25)
    c.setFillColorRGB(*paper); c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColorRGB(*green); c.setFont('Sans', 8); c.drawString(36, 559, 'RÉSIDENCE DES VÉRANDAS   /   DOSSIER D’INVESTISSEMENT')
    c.setFillColorRGB(*gold); c.drawRightString(W - 36, 559, 'PLANCHE 05   ·   ÉCONOMIE DU PROJET')
    c.setStrokeColorRGB(*rule); c.setLineWidth(.7); c.line(36, 547, W - 36, 547)
    c.setFillColorRGB(*ink); c.setFont('Serif', 21)
    c.drawString(36, 513, 'Planche 05 — Synthèse des Surfaces & Estimation Budgétaire (FCFA)')
    c.setFillColorRGB(*muted); c.setFont('Sans', 9)
    c.drawString(36, 493, 'Métré issu de la géométrie du projet · profil Moyen standing · ordres de grandeur, non contractuels')

    stats = [
        ('SURFACE HABITABLE', f"{decimal(q['habitable'])} m²"),
        ('SURFACES ANNEXES', f"{decimal(q['annexes'])} m²"),
        ('TOITURE ESTIMÉE', f"{decimal(q['roofArea'])} m²"),
        ('CARRELAGE MÉTRÉ', f"{decimal(q['tiledArea'])} m²"),
    ]
    card_y, card_w, card_h, gap = 410, 182, 62, 12
    for i, (label, value) in enumerate(stats):
        x = 36 + i * (card_w + gap)
        c.setFillColorRGB(1, 1, 1); c.roundRect(x, card_y, card_w, card_h, 5, fill=1, stroke=0)
        c.setFillColorRGB(*muted); c.setFont('Sans', 7); c.drawString(x + 12, card_y + 43, label)
        c.setFillColorRGB(*ink); c.setFont('Serif', 18); c.drawString(x + 12, card_y + 15, value)

    c.setFillColorRGB(*green); c.setFont('Sans', 7.5)
    c.drawString(36, 389, 'LOT / ASSIETTE DE MÉTRÉ')
    c.drawString(228, 389, 'QUANTITÉS CALCULÉES DEPUIS LE PLAN')
    c.drawRightString(W - 36, 389, 'BUDGET INDICATIF · FOURCHETTE')
    c.setStrokeColorRGB(*rule); c.line(36, 381, W - 36, 381)
    row_top, row_h = 381, 50
    for i, (label, detail, low, high) in enumerate(rows):
        y = row_top - (i + 1) * row_h
        if i % 2 == 0:
            c.setFillColorRGB(.94, .93, .89); c.rect(36, y, W - 72, row_h, fill=1, stroke=0)
        c.setFillColorRGB(*ink); c.setFont('Serif', 12); c.drawString(46, y + 27, label)
        c.setFillColorRGB(*muted); c.setFont('Sans', 7.6)
        details = detail.split('\n')
        for j, line in enumerate(details): c.drawString(228, y + 29 - j * 13, line)
        c.setFillColorRGB(*ink); c.setFont('Sans', 8.4)
        c.drawRightString(W - 48, y + 28, f'{xaf(low)}  —  {xaf(high)}')
        c.setStrokeColorRGB(*rule); c.line(36, y, W - 36, y)

    total_y = 195
    c.setFillColorRGB(*muted); c.setFont('Sans', 8)
    c.drawString(46, total_y, 'Aléas et permis compris dans la fourchette totale ; ventilation second œuvre / finitions indicative.')
    c.setFillColorRGB(*green); c.roundRect(36, 87, W - 72, 83, 6, fill=1, stroke=0)
    c.setFillColorRGB(.89, .91, .86); c.setFont('Sans', 8); c.drawString(54, 147, 'ENVELOPPE TRAVAUX INDICATIVE · MOYEN STANDING')
    c.setFillColorRGB(1, 1, 1); c.setFont('Serif', 22)
    c.drawString(54, 112, f"{xaf(measured['total']['low'])}  —  {xaf(measured['total']['high'])}")
    c.setFillColorRGB(*muted); c.setFont('Sans', 7)
    c.drawString(36, 67, 'Quantités de maquette, non assimilables à un métré d’exécution. Prix LeFisk (août 2026), ajustés en fourchette ; BQE matière séparé.')
    c.drawString(36, 54, 'Hors études, terrain, extérieurs, branchements et honoraires de maîtrise d’œuvre ; quantités et prix à confirmer.')
    c.setFillColorRGB(*gold); c.setFont('Sans', 7); c.drawRightString(W - 36, 54, 'RÉSIDENCE DES VÉRANDAS   ·   FCFA')
    c.showPage(); c.save(); buf.seek(0)
    with open(path, 'wb') as out: out.write(buf.getvalue())


def build():
    print('[cahier] Lecture des sources…', flush=True)
    originals = {p.stem[-6:]:p for p in (ROOT/'plan de costruction').rglob('*.pdf')}
    with tempfile.TemporaryDirectory(dir=SHEETS) as tmp:
        print('[cahier] Préparation des planches…', flush=True)
        stage = Path(tmp)
        for name,file in [('Serif','source-serif-4'),('Sans','manrope')]:
            font = TTFont(ROOT/f'assets/fonts/{file}.woff2');font.flavor = None
            font = instantiateVariableFont(font,{axis.axisTag:axis.defaultValue for axis in font['fvar'].axes})
            if name == 'Sans': enable_tabular_figures(font)
            data = io.BytesIO();font.save(data);data.seek(0);pdfmetrics.registerFont(PDFFont(name,data))
        pages = []; originals_in_order = []
        plan_images = {}
        art_dir = SHEETS/ED['artDirectory']; art_dir.mkdir(exist_ok=True)
        for sheet in ED['sheets']:
            source = ROOT/sheet['preview']; target = stage/source.name
            cached = art_dir/source.name
            if cached.exists(): shutil.copy2(cached, target)
            else:
                render(source).save(target,lossless=True,method=0)
                shutil.copy2(target, cached)
            pages.append((sheet['title'],target,'Études techniques' if source.stem in TECH else 'Architecture'))
            if source.stem in {'063306', '063245'}:
                plan_images[source.stem] = target
            originals_in_order.append(originals[source.stem])
        synthesis_pdf = stage/'planche-01-synthese.pdf'
        print('[cahier] Composition de la planche exécutive A3…', flush=True)
        build_synthesis_board(synthesis_pdf, [plan_images['063306'], plan_images['063245']])
        budget_title = 'Planche 05 — Synthèse des Surfaces & Estimation Budgétaire (FCFA)'
        budget_pdf = stage/'planche-04-estimation.pdf'
        print('[cahier] Calcul des métrés et composition de la planche 05…', flush=True)
        build_estimate_board(budget_pdf)
        pages.insert(3, (budget_title, budget_pdf, 'Métré & estimation'))
        pages += [(p['title'],ROOT/p['image'],'Perspectives') for p in ED['photos']]

        print(f'[cahier] Assemblage de la couverture A3, {len(pages)} planches et des sources PDF…', flush=True)

        def raster_pages(items, first_page):
            buf = io.BytesIO(); canvas = None
            for offset, (title, image, section) in enumerate(items):
                with Image.open(image) as im: iw, ih = im.size
                w, h = (842, 595) if iw > ih else (595, 842)
                if canvas is None: canvas = Canvas(buf, pagesize=(w, h), pageCompression=1)
                else: canvas.setPageSize((w, h))
                page_no = first_page + offset
                canvas.setFillColorRGB(.96, .95, .92); canvas.rect(0, 0, w, h, fill=1, stroke=0)
                canvas.setFillColorRGB(.36, .38, .33); canvas.setFont('Sans', 9)
                canvas.drawString(24, h - 22, f'RÉSIDENCE DES VÉRANDAS   /   {section.upper()}')
                canvas.setFont('Serif', 21); canvas.drawString(24, h - 49, title)
                canvas.setFont('Sans', 9); canvas.drawRightString(w - 24, h - 47, f'Fig. {page_no:02d} / {len(pages) + 1:02d}')
                canvas.drawImage(str(image), 20, 18, w - 40, h - 82, preserveAspectRatio=True, anchor='c')
                canvas.showPage()
            if canvas is not None: canvas.save()
            buf.seek(0)
            return buf, PdfReader(buf)

        writer = PdfWriter()
        writer.append(PdfReader(str(synthesis_pdf)))
        writer.add_outline_item('Planche 01 — Synthèse exécutive', 0)
        pre_buf, pre_reader = raster_pages(pages[:3], 2)
        writer.append(pre_reader)
        for i in range(3): writer.add_outline_item(pages[i][0], i + 1)
        writer.append(PdfReader(str(budget_pdf)))
        writer.add_outline_item(budget_title, 4)
        post_buf, post_reader = raster_pages(pages[4:], 6)
        writer.append(post_reader)
        for i in range(4, len(pages)): writer.add_outline_item(pages[i][0], i + 1)
        for i, source in enumerate(originals_in_order):
            writer.append(str(source), outline_item='Original · ' + ED['sheets'][i]['title'], import_outline=False)
        writer.add_metadata({'/Title':'Résidence des Vérandas — Cahier de plans de prestige'})
        pdf = stage/'cahier.pdf'; writer.write(str(pdf))
        assert len(PdfReader(pdf).pages) == len(pages) + len(originals_in_order) + 1
        dest=SHEETS/ED['artDirectory'];dest.mkdir(exist_ok=True)
        for sheet in stage.glob('*.webp'): sheet.replace(dest/sheet.name)
        pdf.replace(SHEETS/'cahier.pdf')


if __name__ == '__main__':
    build()
