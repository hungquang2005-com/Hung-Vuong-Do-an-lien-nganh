"""Inspect the Word-rendered PDF and make page contact sheets for visual review."""
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/bao-cao/ra-soat-cuoi'
sys.path.insert(0, str(OUT / 'python-libs'))
import pymupdf


def main():
    pdf = pymupdf.open(OUT / 'sau-ra-soat.pdf')
    pages = []
    targets = {1, 4}
    for index, page in enumerate(pdf):
        value = page.get_text()
        images = len(page.get_images())
        fonts = sorted({span['font'] for block in page.get_text('dict')['blocks'] if 'lines' in block
                        for line in block['lines'] for span in line['spans']})
        outside = [block[:4] for block in page.get_text('blocks')
                   if block[0] < -1 or block[1] < -1 or block[2] > page.rect.width + 1 or block[3] > page.rect.height + 1]
        pages.append({'page': index + 1, 'characters': len(value.strip()), 'images': images,
                      'fonts': fonts, 'outside_page': outside})
        if any(key in value for key in ['MỤC LỤC', 'Mã test', 'Kiến thức mới cần nghiên cứu',
                                        'Chiến lược học tập', '3.5 Kế hoạch', '4.3 Đề xuất', 'TÀI LIỆU THAM KHẢO']):
            targets.add(index + 1)
        if index >= len(pdf) - 6:
            targets.add(index + 1)
    for number in targets:
        pdf[number - 1].get_pixmap(matrix=pymupdf.Matrix(1.25, 1.25)).save(OUT / f'sau-{number}.png')
    for first in range(0, len(pdf), 16):
        sheet = pymupdf.open()
        view = sheet.new_page(width=1200, height=1760)
        for offset in range(min(16, len(pdf) - first)):
            x, y = (offset % 4) * 300, (offset // 4) * 440
            rect = pymupdf.Rect(x + 4, y + 20, x + 296, y + 435)
            view.show_pdf_page(rect, pdf, first + offset)
            view.insert_text((x + 8, y + 14), f'PDF {first + offset + 1}', fontsize=11)
        view.get_pixmap().save(OUT / f'tong-quan-{first // 16 + 1}.png')
        sheet.close()
    manifest = {'pdf_pages': len(pdf), 'pages': pages, 'rendered_targets': sorted(targets),
                'sparse_without_raster': [p for p in pages if p['characters'] < 260 and p['images'] == 0],
                'out_of_page': [p for p in pages if p['outside_page']]}
    (OUT / 'pdf-audit.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'pages': len(pdf), 'targets': sorted(targets),
                      'sparse': [p['page'] for p in manifest['sparse_without_raster']],
                      'outside': [p['page'] for p in manifest['out_of_page']]}, ensure_ascii=False))


if __name__ == '__main__':
    main()
