"""Verify saved Word output against the original and recorded Word pagination."""
from pathlib import Path
from xml.dom import minidom
from zipfile import ZipFile
import hashlib
import json
import re
import sys

from update_report_testing import W, elements, text

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/bao-cao/ra-soat-cuoi'


def main():
    evidence = json.loads((OUT / 'chinh-sua.json').read_text(encoding='utf-8'))
    original = Path(evidence['source'])
    final = Path(evidence['output'])
    assert hashlib.sha256(original.read_bytes()).hexdigest() == evidence['original_sha256'], 'Original changed'
    with ZipFile(original) as archive:
        before = minidom.parseString(archive.read('word/document.xml'))
    with ZipFile(final) as archive:
        assert archive.testzip() is None
        after = minidom.parseString(archive.read('word/document.xml'))
        for name, digest in evidence['unchanged_media'].items():
            assert hashlib.sha256(archive.read(name)).hexdigest() == digest, name
    body = after.getElementsByTagNameNS(W, 'body')[0]
    tables = [t for t in elements(body, 'tbl') if 'Mã test case' in text(t)]
    contents = [[[text(c) for c in elements(row, 'tc')] for row in elements(t, 'tr')] for t in tables]
    assert contents == evidence['test_table_contents'], 'Testing content/status changed'
    assert len(after.getElementsByTagNameNS(W, 'drawing')) == 50
    for tag in ('pgSz', 'pgMar'):
        assert [n.toxml() for n in before.getElementsByTagNameNS(W, tag)] == [n.toxml() for n in after.getElementsByTagNameNS(W, tag)], tag

    def main_texts(doc):
        result = []
        for p in doc.getElementsByTagNameNS(W, 'p'):
            value = text(p)
            if value == 'TÀI LIỆU THAM KHẢO':
                break
            style = p.getElementsByTagNameNS(W, 'pStyle')
            if style and style[0].getAttributeNS(W, 'val').upper().startswith('TOC'):
                continue
            value = re.sub(r'\s*\[\d+\](?:,\s*\[\d+\])*', '', value)
            value = re.sub(r'\s+', '', value)
            if value:
                result.append(value)
        return result
    old_text, new_text = main_texts(before), main_texts(after)
    assert old_text == new_text, 'Main text changed beyond inserted citations'
    word = json.loads((OUT / 'sau-ra-soat.json').read_text(encoding='utf-8-sig'))
    reopened = json.loads((OUT / 'kiem-tra-mo-lai.json').read_text(encoding='utf-8-sig'))
    assert word['pages'] == reopened['pages'] == 116
    assert word['headings'] == reopened['headings']
    assert word['tocText'] == reopened['tocText']
    mapping = {h['text']: h['printedPage'] for h in reopened['headings']}
    toc = reopened['tocText']
    assert isinstance(toc, str)
    entries = [value.strip() for value in toc.split('\r') if value.strip()]
    assert len(entries) == len(mapping)
    for entry in entries:
        label, page = entry.rsplit('\t', 1)
        assert mapping[label] == int(page), entry
    assert all(t['startPage'] == t['endPage'] for t in reopened['testTables'])
    assert all(value not in text(after) for value in ['Error! Bookmark not defined.', 'Error! Reference source not found.'])
    result = {'physical_pages': word['pages'], 'toc_entries_checked': len(entries),
              'original_unchanged': True, 'images_byte_identical': len(evidence['unchanged_media']),
              'unchanged_test_tables': len(tables), 'main_paragraphs_preserved': len(old_text),
              'pagination_stable_after_reopen': True,
              'headings': reopened['headings']}
    (OUT / 'ket-qua-xac-minh.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({k: v for k, v in result.items() if k != 'headings'}, ensure_ascii=False))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
