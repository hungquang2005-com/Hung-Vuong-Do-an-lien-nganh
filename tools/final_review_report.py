"""Make only the identified editorial/layout corrections before Word repagination."""
from pathlib import Path
from xml.dom import minidom
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib
import json
import sys

from update_report_testing import W, elements, text, new, set_text
from format_report_functional_tests import prop

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'artifacts/bao-cao/Bao_cao_Gia_dung_Viet_kiem_thu_theo_chuc_nang.docx'
OUTPUT = ROOT / 'artifacts/bao-cao/Bao_cao_Gia_dung_Viet_ra_soat_cuoi.docx'
EVIDENCE = ROOT / 'artifacts/bao-cao/ra-soat-cuoi'


def main():
    assert not OUTPUT.exists(), 'Do not overwrite an existing review copy'
    with ZipFile(SOURCE) as archive:
        parts = {item.filename: archive.read(item) for item in archive.infolist()}
    doc = minidom.parseString(parts['word/document.xml'])
    body = doc.getElementsByTagNameNS(W, 'body')[0]
    paragraphs = elements(body, 'p')
    tables = [t for t in elements(body, 'tbl') if 'Mã test case' in text(t)]
    original_cases = [[[text(c) for c in elements(row, 'tc')] for row in elements(table, 'tr')] for table in tables]
    captions = [text(p) for p in paragraphs if text(p).startswith(('Hình ', 'Bảng '))]

    # Preserve the title's words, font and paragraph style; specify a balanced two-line break.
    cover = next(p for p in paragraphs if text(p) == 'XÂY DỰNG WEBSITE THƯƠNG MẠI ĐIỆN TỬ BÁN ĐỒ GIA DỤNG')
    set_text(cover, 'XÂY DỰNG WEBSITE THƯƠNG MẠI ĐIỆN TỬ')
    run = cover.getElementsByTagNameNS(W, 'r')[-1]
    run.appendChild(new(doc, 'br'))
    last = new(doc, 't')
    last.appendChild(doc.createTextNode('BÁN ĐỒ GIA DỤNG'))
    run.appendChild(last)

    begin = next(i for i, p in enumerate(paragraphs) if text(p) == 'Kiến thức mới cần nghiên cứu')
    end = next(i for i in range(begin + 1, len(paragraphs)) if text(paragraphs[i]) == 'Chiến lược học tập')
    template = next(p for p in paragraphs[begin + 1:end] if any(s.getAttributeNS(W, 'val') == 'Bullet' for s in p.getElementsByTagNameNS(W, 'pStyle')))
    bullet_properties = elements(template, 'pPr')[0].cloneNode(True)
    for paragraph in paragraphs[begin + 1:end]:
        old = elements(paragraph, 'pPr')
        if old:
            paragraph.removeChild(old[0])
        paragraph.insertBefore(bullet_properties.cloneNode(True), paragraph.firstChild)

    # Begin the final subtopic on its own page rather than orphaning only the closing paragraph.
    start4 = next(i for i, p in enumerate(paragraphs) if text(p) == '4.3 Đề xuất cải thiện')
    refs = next(i for i in range(start4 + 1, len(paragraphs)) if text(paragraphs[i]) == 'TÀI LIỆU THAM KHẢO')
    for paragraph in paragraphs[start4 + 1:refs]:
        if text(paragraph) == 'Định hướng phát triển trong tương lai':
            prop(prop(paragraph, 'pPr'), 'pageBreakBefore')

    widths = [900, 1490, 2000, 1420, 2261, 1000]
    for table in tables:
        for col, width in zip(elements(elements(table, 'tblGrid')[0], 'gridCol'), widths):
            col.setAttributeNS(W, 'w:w', str(width))
        for row in elements(table, 'tr'):
            for cell, width in zip(elements(row, 'tc'), widths):
                prop(elements(cell, 'tcPr')[0], 'tcW', w=width, type='dxa')

    # The existing fourth assignment column has no grid width and renders its heading vertically.
    assignment = next(t for t in elements(body, 'tbl') if text(t).startswith('STTNội dung công việcNgười phụ tráchGhi chú'))
    assignment_text = text(assignment)
    assignment_widths = [760, 4640, 2400, 1271]
    grid = elements(assignment, 'tblGrid')[0]
    for child in list(grid.childNodes):
        grid.removeChild(child)
    for width in assignment_widths:
        grid.appendChild(new(doc, 'gridCol', w=width))
    for row in elements(assignment, 'tr'):
        cells = elements(row, 'tc')
        for index, (cell, width) in enumerate(zip(cells, assignment_widths)):
            properties = elements(cell, 'tcPr')
            if not properties:
                cell.insertBefore(elements(cells[2], 'tcPr')[0].cloneNode(True), cell.firstChild)
                properties = elements(cell, 'tcPr')
            prop(properties[0], 'tcW', w=width, type='dxa')
            if index == 3:
                p = elements(cell, 'p')[0]
                if not elements(p, 'pPr'):
                    p.insertBefore(elements(elements(cells[2], 'p')[0], 'pPr')[0].cloneNode(True), p.firstChild)
    assert text(assignment) == assignment_text

    updates = {
        '[4]': '[4] React Team, React Documentation, React Official Documentation, 2026, https://react.dev/learn, truy cập ngày 27/10/2026.',
        '[6]': '[6] Oracle Corporation, MySQL 8.0 Reference Manual, Oracle Documentation, 2026, https://dev.mysql.com/doc/refman/8.0/en/, truy cập ngày 27/10/2026.',
        '[9]': '[9] GitHub Inc., GitHub Documentation, GitHub Official Documentation, 2026, https://docs.github.com/en/get-started, truy cập ngày 27/10/2026.',
        '[10]': '[10] Atlassian, Git Tutorials and Documentation, Atlassian Documentation, 2026, https://www.atlassian.com/git/tutorials, truy cập ngày 27/10/2026.',
    }
    for paragraph in paragraphs[refs + 1:]:
        for prefix, value in updates.items():
            if text(paragraph).startswith(prefix):
                set_text(paragraph, value)
    tail = next(i for i in range(refs + 1, len(paragraphs)) if text(paragraphs[i]).startswith('[15]'))
    removed = []
    for paragraph in paragraphs[tail:]:
        value = text(paragraph)
        # This tail contains no unique, identifiable reference beyond the duplicate docs/domains.
        assert value.startswith('[15]') or value in ('vite.dev', 'mysql.com', 'github.com', 'stackoverflow.com', '') or value.startswith('React documentation:'), value
        removed.append(value)
        body.removeChild(paragraph)

    citations = [
        ('Mô hình ca sử dụng (Use Case) mô tả chức năng của hệ thống theo góc nhìn của tác nhân.',
         'Mô hình ca sử dụng (Use Case) mô tả chức năng của hệ thống theo góc nhìn của tác nhân [11].'),
        ('Biểu đồ tuần tự (Sequence Diagram) mô tả trình tự tương tác khi thực hiện một chức năng cụ thể.',
         'Biểu đồ tuần tự (Sequence Diagram) mô tả trình tự tương tác khi thực hiện một chức năng cụ thể [11].'),
        ('React và TypeScript được dùng để xây dựng các trang và thành phần giao diện.',
         'React và TypeScript được dùng để xây dựng các trang và thành phần giao diện [4], [5].'),
        ('Vite hỗ trợ máy chủ phát triển và đóng gói frontend.',
         'Vite hỗ trợ máy chủ phát triển và đóng gói frontend [7].'),
        ('NestJS tổ chức backend theo mô-đun, controller và service.',
         'NestJS tổ chức backend theo mô-đun, controller và service [1].'),
        ('TypeORM ánh xạ entity với bảng dữ liệu MySQL;',
         'TypeORM ánh xạ entity với bảng dữ liệu MySQL [3], [6];'),
        ('Các yêu cầu tiếp theo sử dụng JWT để xác thực;',
         'Các yêu cầu tiếp theo sử dụng JWT để xác thực [2];'),
        ('Các thay đổi được cập nhật thường xuyên thông qua các lần commit nhằm lưu lại lịch sử phát triển của dự án.',
         'Các thay đổi được cập nhật thường xuyên thông qua các lần commit nhằm lưu lại lịch sử phát triển của dự án [9], [10].'),
        ('Hoạt động kiểm thử được thực hiện để đối chiếu kết quả xử lý với yêu cầu chức năng và các trường hợp lỗi.',
         'Hoạt động kiểm thử được thực hiện để đối chiếu kết quả xử lý với yêu cầu chức năng và các trường hợp lỗi [12], [13].'),
    ]
    for old, replacement in citations:
        matches = [p for p in elements(body, 'p') if old in text(p)]
        assert len(matches) == 1, old
        set_text(matches[0], text(matches[0]).replace(old, replacement))

    assert original_cases == [[[text(c) for c in elements(row, 'tc')] for row in elements(table, 'tr')] for table in tables]
    assert captions == [text(p) for p in elements(body, 'p') if text(p).startswith(('Hình ', 'Bảng '))]
    with ZipFile(OUTPUT, 'w', ZIP_DEFLATED) as archive:
        for name, value in parts.items():
            archive.writestr(name, doc.toxml(encoding='UTF-8') if name == 'word/document.xml' else value)
    evidence = {
        'original_sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'source': str(SOURCE), 'output': str(OUTPUT), 'test_table_count': len(tables),
        'test_table_contents': original_cases, 'removed_reference_tail': removed,
        'citation_insertions': len(citations),
        'unchanged_media': {name: hashlib.sha256(value).hexdigest() for name, value in parts.items() if name.startswith('word/media/')},
        'unverified': [
            'Năm 2026 trong [4], [6], [9], [10] giữ theo bản gốc; trang tài liệu động không xác nhận đây là năm xuất bản.',
            'Ngày truy cập 25/10/2026 tại [1], [3], [5], [7] giữ theo bản gốc; không xác nhận được lịch sử truy cập của tác giả.',
            '[14] có nhiều bản in khác năm; chưa có ISBN hoặc trang tên sách để xác định bản đã sử dụng. Giữ nguyên thông tin hiện có.',
            '[8] và [14] chưa có vị trí sử dụng cụ thể để bổ sung trích dẫn mà không suy đoán.',
        ],
    }
    (EVIDENCE / 'chinh-sua.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'output': str(OUTPUT), 'citations': len(citations), 'preserved_test_tables': len(tables)}, ensure_ascii=False))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
