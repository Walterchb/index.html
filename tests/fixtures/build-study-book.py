#!/usr/bin/env python3
"""Reproducible synthetic PDF; all text and figures are test-authored."""
from pathlib import Path
from io import BytesIO
import json
import math

from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, white
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'study-book-rich.pdf'
FONT = Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
FONT_BOLD = Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')
pdfmetrics.registerFont(TTFont('Fixture', str(FONT)))
pdfmetrics.registerFont(TTFont('FixtureBold', str(FONT_BOLD)))
INK = HexColor('#173c34')
GREEN = HexColor('#467965')
PALE = HexColor('#e6eddc')
GOLD = HexColor('#c5a15c')
W, H = 612, 792
c = canvas.Canvas(str(OUT), pagesize=(W, H), invariant=1, pageCompression=1)
c.setTitle('Investment Study Book - Rich PDF Fixture')
c.setAuthor('Study Atlas Test Suite')
c.setSubject('Synthetic test book: PDF fidelity, outline, complete coverage and study state')
c.setCreator('Study Atlas reportlab fixture generator')

def label(text, x=54, y=700, size=11, bold=False, color=INK):
    c.setFillColor(color)
    c.setFont('FixtureBold' if bold else 'Fixture', size)
    c.drawString(x, y, text)

def para(text, x=54, y=680, width=504, size=10, leading=16):
    words = text.split()
    line = ''
    for word in words:
        candidate = f'{line} {word}'.strip()
        if pdfmetrics.stringWidth(candidate, 'Fixture', size) > width and line:
            label(line, x, y, size)
            y -= leading
            line = word
        else:
            line = candidate
    if line:
        label(line, x, y, size)
        y -= leading
    return y

def page(number, title, key, level=0):
    c.bookmarkPage(key)
    c.addOutlineEntry(title, key, level=level, closed=False)
    c.setFillColor(PALE)
    c.rect(0, H - 116, W, 116, fill=1, stroke=0)
    label('STUDY ATLAS / SYNTHETIC TEST MATERIAL', y=751, size=8, bold=True)
    label(title, y=707, size=20, bold=True)
    c.setStrokeColor(GREEN)
    c.line(54, 50, 558, 50)
    label(f'PDF-FIXTURE-P{number:02d}', y=32, size=8)
    label(str(number), x=550, y=32, size=8)

def table(rows, widths, x=54, y=555, height=34):
    total = sum(widths)
    for i, row in enumerate(rows):
        c.setFillColor(INK if i == 0 else (PALE if i % 2 else white))
        c.rect(x, y - (i + 1) * height, total, height, fill=1, stroke=0)
        cursor = x
        for value, width in zip(row, widths):
            label(str(value), cursor + 10, y - i * height - 22, 10, i == 0, white if i == 0 else INK)
            cursor += width
    c.setStrokeColor(GREEN)
    c.rect(x, y - len(rows) * height, total, len(rows) * height, fill=0, stroke=1)

# 1: cover and the front-matter outline parent.
page(1, 'Investment Study Book', 'front')
label('A complete PDF reader test', y=625, size=24, bold=True)
para('This book was written exclusively as a software test fixture. It contains no CFA Institute curriculum, copyrighted course content, or real personal records.', y=569)
c.setFillColor(GREEN)
c.roundRect(54, 230, 504, 225, 18, fill=1, stroke=0)
label('12 PAGES', x=86, y=387, size=34, bold=True, color=white)
label('3 MODULES + FRONT MATTER + APPENDIX', x=86, y=343, size=12, color=white)
label('Original layout. Selectable text. Real page coverage.', x=86, y=300, size=11, color=white)
c.showPage()

# 2: table of contents contains module labels, which must not become false starts.
page(2, 'Contents and study instructions', 'contents', 1)
para('Read the original pages, inspect each visual, then write a note in your own words. Page 6 is deliberately blank and must remain in the document.', y=653)
for text, y in [('Module 1: Time value of money ........ 3', 570), ('Lesson 1: Discount factors ........... 4', 536), ('Lesson 2: Rates and prices ........... 5', 502), ('Module 2: Risk and allocation ........ 7', 452), ('Lesson 1: Portfolio exposures ........ 8', 418), ('Lesson 2: Visual comparison .......... 9', 384), ('Module 3: Decision process .......... 10', 334), ('Appendix: Definitions ............... 12', 300)]:
    label(text, y=y, size=12)
c.showPage()

# 3: module introduction and learning outcomes.
page(3, 'Module 1: Time value of money', 'module-1')
para('Money at different dates cannot be compared without a rate and a time convention. This module uses simple annual compounding for a transparent example.', y=653)
label('Learning objectives', y=564, size=15, bold=True)
for text, y in [('Identify a future cash flow.', 527), ('Discount the cash flow to a common valuation date.', 499), ('Explain the direction of the price-rate relationship.', 471)]:
    label('• ' + text, y=y)
c.showPage()

# 4: selectable formula plus superscript and an exact tabular cash-flow schedule.
page(4, 'Lesson 1: Discount factors', 'discount-factors', 1)
para('Cash flow formula: a future payment of 110 discounted at 10% for one year has a present value of 100. The formula below must remain legible and selectable.', y=653)
label('PV = CF / (1 + r)', x=82, y=564, size=23, bold=True)
label('t', x=307, y=577, size=13, bold=True)
label('100 = 110 / 1.10', x=82, y=525, size=18)
table([['Year', 'Cash flow', 'Discount factor', 'Present value'], ['1', '110.00', '0.909091', '100.00'], ['2', '121.00', '0.826446', '100.00'], ['Total', '231.00', 'Not additive', '200.00']], [64, 122, 168, 150], y=460)
c.showPage()

# 5: pure vector graph with axis labels and a closed-form relationship.
page(5, 'Lesson 2: Rates and prices', 'rate-price', 1)
para('Figure 1. A zero-coupon payment of 100 in five years falls in present value as the discount rate rises. The original vector graph must be rendered, not replaced by extracted text.', y=653)
x0, y0, gw, gh = 87, 239, 420, 282
c.setStrokeColor(INK)
c.setLineWidth(1)
c.line(x0, y0, x0 + gw, y0)
c.line(x0, y0, x0, y0 + gh)
for tick in range(0, 21, 5):
    x = x0 + gw * tick / 20
    c.line(x, y0 - 4, x, y0)
    label(f'{tick}%', x - 10, y0 - 22, 9)
for value in [40, 60, 80, 100]:
    y = y0 + (value - 40) / 60 * gh
    label(str(value), x0 - 32, y - 3, 9)
    c.setStrokeColor(PALE)
    c.line(x0, y, x0 + gw, y)
points = [(x0 + gw * rate / 20, y0 + ((100 / ((1 + rate / 100) ** 5)) - 40) / 60 * gh) for rate in range(21)]
p = c.beginPath()
p.moveTo(*points[0])
for point in points[1:]: p.lineTo(*point)
c.setStrokeColor(GREEN)
c.setLineWidth(4)
c.drawPath(p)
for x, y in points[::5]:
    c.setFillColor(GOLD)
    c.circle(x, y, 5, fill=1, stroke=0)
label('Discount rate', x=246, y=179, size=11)
label('Present value', x=74, y=552, size=11, bold=True)
c.showPage()

# 6: truly blank, intentionally no header, footer, marker, or bookmark.
c.showPage()

# 7: module two.
page(7, 'Module 2: Risk and allocation', 'module-2')
para('This module compares exposures across assets. A portfolio is described using clear categories and consistent units. Do not merge its pages into the previous module.', y=653)
label('A simple allocation', y=570, size=16, bold=True)
para('The next page intentionally uses two columns. The original PDF reading order and diagram should stay intact in the primary reader even when text extraction is imperfect.', y=533)
c.showPage()

# 8: two columns and exact colored table.
page(8, 'Lesson 1: Portfolio exposures', 'portfolio-exposures', 1)
label('Column A: Equities', y=646, bold=True)
para('Equities represent ownership exposure. The value can change as expected cash flows and required returns change. An allocation measure is a weight, not a guaranteed return.', x=54, y=619, width=232)
label('Column B: Bonds', x=326, y=646, bold=True)
para('Bonds represent a contractual payment stream. Interest rate changes affect their value. Credit quality is a separate dimension and should be assessed in context.', x=326, y=619, width=232)
table([['Asset class', 'Weight', 'Test identifier'], ['Equities', '60%', 'RISK-EQUITY'], ['Bonds', '30%', 'RISK-BOND'], ['Cash', '10%', 'RISK-CASH'], ['Total', '100%', 'CHECK-100']], [194, 112, 198], y=424)
c.showPage()

# 9: embedded raster figure exercises real image preservation.
page(9, 'Lesson 2: Visual comparison', 'visual-comparison', 1)
para('Figure 2. Three deliberately different asset blocks form the allocation. The green block is largest, the gold block is medium, and the gray block is smallest.', y=653)
raster = Image.new('RGB', (1000, 460), '#f8faf5')
d = ImageDraw.Draw(raster)
d.rounded_rectangle((60, 58, 590, 398), 28, fill='#467965')
d.rounded_rectangle((610, 58, 845, 398), 28, fill='#c5a15c')
d.rounded_rectangle((865, 58, 950, 398), 20, fill='#a5b1ad')
blob = BytesIO()
raster.save(blob, format='PNG')
c.drawImage(ImageReader(BytesIO(blob.getvalue())), 54, 296, width=504, height=232)
label('60% equities', x=98, y=263, size=12, bold=True)
label('30% bonds', x=353, y=263, size=12, bold=True)
label('10% cash', x=470, y=263, size=10, bold=True)
c.showPage()

# 10: third module and an ordered process.
page(10, 'Module 3: Decision process', 'module-3')
para('A useful decision process identifies facts, considers alternatives and documents a reasoned choice. This synthetic scenario is not investment advice or an official assessment.', y=653)
for index, (title, text) in enumerate([('Identify', 'List the known facts and uncertainties.'), ('Consider', 'Compare available choices and affected parties.'), ('Decide', 'Record the reasoning and revisit the outcome.')]):
    y = 529 - index * 104
    c.setFillColor(PALE)
    c.roundRect(54, y - 55, 504, 77, 10, fill=1, stroke=0)
    label(f'{index + 1}. {title}', x=74, y=y - 3, size=14, bold=True)
    label(text, x=74, y=y - 30, size=10)
c.showPage()

# 11: source question + visible answer below; no automatic extra quiz implied.
page(11, 'Lesson 1: Explain your decision', 'explain-decision', 1)
para('Practice question. Which step should occur before documenting a final decision?', y=653)
label('A. Identify the relevant facts and uncertainties.', y=587)
label('B. Ignore alternatives to finish faster.', y=553)
label('C. Replace evidence with confidence.', y=519)
c.setFillColor(PALE)
c.roundRect(54, 330, 504, 115, 12, fill=1, stroke=0)
label('Answer and explanation', x=74, y=412, size=14, bold=True)
para('A is correct in this synthetic exercise. A documented decision should be supported by the relevant facts and a review of alternatives.', x=74, y=381, width=460)
para('Literal markup example: <p>Keep this as PDF text</p>. Angle brackets are source characters, not an instruction to format this sentence as HTML.', y=268)
c.showPage()

# 12: appendix must not vanish simply because it follows the final module.
page(12, 'Appendix: Definitions and notes', 'appendix')
table([['Term', 'Definition'], ['Discount factor', 'Weight applied to a dated cash flow.'], ['Allocation', 'Share assigned to a portfolio category.'], ['Evidence', 'Information used to support a decision.']], [160, 344], y=644, height=48)
para('END-OF-BOOK-COVERAGE-MARKER. This final page verifies that appendices remain accessible and are counted in whole-document coverage.', y=377)
c.showPage()
c.save()

expected = {
    'file': OUT.name,
    'pageCount': 12,
    'title': 'Investment Study Book - Rich PDF Fixture',
    'author': 'Study Atlas Test Suite',
    'blankPages': [6],
    'frontMatterPages': [1, 2],
    'academicModuleStartPages': [3, 7, 10],
    'appendixPages': [12],
    'vectorGraphicPages': [5],
    'rasterGraphicPages': [9],
    'formulaPages': [4],
    'tablePages': [4, 8, 12],
    'twoColumnPages': [8],
    'outline': [
        {'title': 'Investment Study Book', 'page': 1, 'level': 0},
        {'title': 'Contents and study instructions', 'page': 2, 'level': 1},
        {'title': 'Module 1: Time value of money', 'page': 3, 'level': 0},
        {'title': 'Lesson 1: Discount factors', 'page': 4, 'level': 1},
        {'title': 'Lesson 2: Rates and prices', 'page': 5, 'level': 1},
        {'title': 'Module 2: Risk and allocation', 'page': 7, 'level': 0},
        {'title': 'Lesson 1: Portfolio exposures', 'page': 8, 'level': 1},
        {'title': 'Lesson 2: Visual comparison', 'page': 9, 'level': 1},
        {'title': 'Module 3: Decision process', 'page': 10, 'level': 0},
        {'title': 'Lesson 1: Explain your decision', 'page': 11, 'level': 1},
        {'title': 'Appendix: Definitions and notes', 'page': 12, 'level': 0}
    ],
    'testAuthored': True,
}
(ROOT / 'study-book-rich.expected.json').write_text(json.dumps(expected, indent=2) + '\n')
print(f'Created {OUT}: {OUT.stat().st_size} bytes, 12 pages.')
