"""Insert verified QA evidence into a copy of the report, preserving media and numbering."""
from pathlib import Path
import json
import re
import sys
from xml.dom import minidom
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'artifacts/bao-cao/Bao_cao_Gia_dung_Viet_da_chinh_sua.docx'
OUTPUT = ROOT / 'artifacts/bao-cao/Bao_cao_Gia_dung_Viet_bien_tap_phan_kiem_thu.docx'
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'


def elements(node, name=None):
    return [n for n in node.childNodes if n.nodeType == n.ELEMENT_NODE
            and (name is None or (n.namespaceURI == W and n.localName == name))]


def text(node):
    return ''.join(t.firstChild.data if t.firstChild else ''
                   for t in node.getElementsByTagNameNS(W, 't'))


def new(doc, name, **attrs):
    node = doc.createElementNS(W, 'w:' + name)
    for key, value in attrs.items():
        node.setAttributeNS(W, 'w:' + key, str(value))
    return node


def set_text(node, value):
    doc = node.ownerDocument
    paragraph = node if node.localName == 'p' else next(iter(elements(node, 'p')), None)
    if paragraph is None:
        paragraph = new(doc, 'p')
        node.appendChild(paragraph)
    runs = paragraph.getElementsByTagNameNS(W, 'r')
    style = next(iter(runs[0].getElementsByTagNameNS(W, 'rPr')), None) if runs else None
    for child in list(paragraph.childNodes):
        if child.nodeType != child.ELEMENT_NODE or child.localName != 'pPr':
            paragraph.removeChild(child)
    run = new(doc, 'r')
    if style is not None:
        run.appendChild(style.cloneNode(True))
    target = new(doc, 't')
    target.appendChild(doc.createTextNode(value))
    run.appendChild(target)
    paragraph.appendChild(run)


def main():
    summary = json.loads((ROOT / 'docs/test-results/summary.json').read_text(encoding='utf-8'))
    runs = {run['name']: run for run in summary['runs']}
    assert runs['backend']['pass'] == runs['backend']['tests'] == 106
    assert runs['frontend']['pass'] == runs['frontend']['tests'] == 12
    assert all(item['exitCode'] == 0 for item in summary['runs'] + summary['builds'])
    assert not OUTPUT.exists(), 'Refusing to overwrite an existing report copy'
    with ZipFile(SOURCE) as archive:
        original = {entry.filename.replace('\\', '/'): archive.read(entry)
                    for entry in archive.infolist() if not entry.is_dir()}
    doc = minidom.parseString(original['word/document.xml'])
    body = doc.getElementsByTagNameNS(W, 'body')[0]
    caption_pattern = r'^(?:Hình|Bảng) \d+(?:\.\d+)*[a-z]?\.\s'
    captions = [text(p) for p in elements(body, 'p') if re.match(caption_pattern, text(p))]
    image_count = len(doc.getElementsByTagNameNS(W, 'drawing'))

    def replace(prefix, value):
        matches = [p for p in elements(body, 'p') if text(p).startswith(prefix)]
        assert len(matches) == 1, (prefix, len(matches))
        set_text(matches[0], value)
        return matches[0]

    anchor = replace('Dự án có các tệp kiểm thử',
        'Kiểm thử được thực hiện nhằm đối chiếu kết quả xử lý của hệ thống với các yêu cầu đã xác định, '
        'đồng thời phát hiện sai sót trong quá trình xử lý dữ liệu và kiểm soát quyền truy cập. '
        'Nội dung kiểm thử tập trung vào quản lý tài khoản, giỏ hàng, đặt hàng, mã giảm giá, '
        'sự kiện ưu đãi, đánh giá sản phẩm và các thao tác mua sắm thông qua chatbot.')
    replace('Quy trình nghiệm thu gồm chuẩn bị',
        'Các ca kiểm thử tự động được thực hiện trên môi trường Windows, sử dụng Node.js 22.8.0 '
        'và npm 10.8.2. Đối với backend, nhóm kiểm tra các dịch vụ nghiệp vụ và một số API với cơ chế '
        'xác thực, phân quyền và kiểm tra dữ liệu đầu vào của NestJS. Dữ liệu thử nghiệm được tổ chức '
        'trong bộ nhớ; các dịch vụ thanh toán, email và trí tuệ nhân tạo được mô phỏng để kiểm tra '
        'cách xử lý trong những tình huống xác định. Đối với frontend, phạm vi kiểm tra gồm kết quả '
        'kết xuất một số thành phần giao diện, dữ liệu trao đổi qua API và quá trình tiếp nhận phản hồi '
        'theo luồng của chatbot.')
    replace('Các tích hợp ngoài cần được kiểm thử riêng:',
        'Kết quả thực hiện ngày 27/10/2026 ghi nhận 113 ca kiểm thử chi tiết đạt yêu cầu, '
        'gồm 101 ca phía backend và 12 ca phía frontend; không có ca thất bại hoặc bị bỏ qua '
        'trong lần chạy cuối. Số lượng này không cộng thêm các nhóm kiểm thử tổng hợp do công cụ '
        'ghi nhận. Quá trình biên dịch và đóng gói cả hai thành phần cũng hoàn thành thành công. '
        'Các kết quả phản ánh mức đáp ứng đối với những trường hợp và điều kiện thử nghiệm đã thiết lập.')
    replace('Bảng 2.7 xác định',
        'Bảng 2.7 tổng hợp kết quả đối chiếu các tình huống kiểm thử chức năng mở rộng. '
        'Các tình huống được đánh giá trong phạm vi dữ liệu và dịch vụ mô phỏng nêu trên. '
        'Đối với tình huống gồm nhiều điều kiện nhưng mới kiểm tra được một phần, kết quả được ghi '
        'là “Chưa đầy đủ”; tình huống chưa được thực hiện được ghi là “Chưa kiểm thử”.')
    last = replace('Các nhóm lệnh tự động hiện có gồm',
        'Trong quá trình kiểm thử, nhóm phát hiện hai sai sót liên quan đến kiểm tra dữ liệu đầu vào: '
        'chức năng đăng ký chấp nhận họ tên rỗng hoặc chỉ chứa khoảng trắng; chức năng kiểm tra '
        'mã giảm giá trả về lỗi máy chủ khi nhận dữ liệu thiếu hoặc không đúng kiểu. Các quy tắc '
        'kiểm tra đã được bổ sung để từ chối những yêu cầu không hợp lệ trước khi xử lý nghiệp vụ. '
        'Sau khi sửa, các ca kiểm thử liên quan và toàn bộ bộ kiểm thử được thực hiện lại, '
        'cho kết quả phù hợp với yêu cầu đã xác định.')
    additions = [
        'Mã kiểm thử, dữ liệu đầu vào và nhật ký thực thi được lưu cùng mã nguồn dự án để phục vụ '
        'việc đối chiếu và kiểm tra lại sau khi thay đổi chương trình. Kết quả trước và sau khi sửa lỗi '
        'được lưu riêng, giúp xác định nguyên nhân và kiểm tra hiệu lực của các điều chỉnh.',
        'Phạm vi kiểm thử hiện tại còn một số giới hạn. Việc khôi phục dữ liệu khi giao dịch thất bại, '
        'xử lý yêu cầu đồng thời và ngăn bản ghi trùng mới được kiểm tra trên mô hình dữ liệu trong '
        'bộ nhớ, chưa được xác minh trên cơ sở dữ liệu MySQL thực tế. Tương tự, các kết quả liên quan '
        'đến PayOS, Gemini và Resend phản ánh cách xử lý với phản hồi mô phỏng; khả năng kết nối '
        'và phối hợp với các nhà cung cấp cần được kiểm tra trong môi trường tích hợp phù hợp.',
        'Nhóm chưa thực hiện kiểm thử toàn bộ quy trình mua sắm bằng thao tác trên trình duyệt, '
        'nghiệm thu thủ công và đo hiệu năng dưới tải. Vì vậy, kết quả tự động được sử dụng làm '
        'cơ sở đánh giá các nghiệp vụ đã kiểm tra, chưa đủ để kết luận về khả năng vận hành thực tế, '
        'thời gian phản hồi hoặc số người dùng đồng thời mà hệ thống có thể phục vụ.',
    ]
    for value in additions:
        paragraph = anchor.cloneNode(True)
        for attribute in ('paraId', 'textId'):
            paragraph.removeAttributeNS('http://schemas.microsoft.com/office/word/2010/wordml', attribute)
        set_text(paragraph, value)
        body.insertBefore(paragraph, last.nextSibling)
        last = paragraph

    # Preserve the report's KT numbering: its definitions differ from the proposed Markdown matrix.
    results = {
        'KT01': ('Mã sai, hết hạn, chưa xác minh hoặc đã sử dụng đều bị từ chối. Mã hợp lệ cho phép đổi mật khẩu một lần; mật khẩu cũ không còn đăng nhập được. Việc sử dụng lại mã được kiểm tra theo các yêu cầu gửi lần lượt.', 'Đạt'),
        'KT02': ('Yêu cầu chỉnh sửa địa chỉ hoặc xem đơn hàng thuộc tài khoản khác bị từ chối.', 'Đạt'),
        'KT03': ('Chỉ người mua có đơn đã giao và đã thanh toán được lưu đánh giá. Chỉnh sửa số sao vẫn giữ một bản ghi đánh giá của người dùng cho sản phẩm.', 'Đạt'),
        'KT04': ('Sự kiện có lịch chồng nhau bị từ chối; thời điểm bắt đầu và kết thúc được kiểm tra. Chưa kiểm thử đầy đủ việc công bố sự kiện hợp lệ và hiển thị trên giao diện.', 'Chưa đầy đủ'),
        'KT05': ('Mã giảm giá chỉ áp dụng cho các sản phẩm có giá thường. Giỏ chỉ gồm sản phẩm đang ưu đãi không được áp dụng mã; tổng tiền giỏ hàng và báo giá thống nhất.', 'Đạt'),
        'KT06': ('Chưa thực hiện các ca tại ngưỡng 1 triệu đồng, 5 triệu đồng và trường hợp xác nhận lại để kiểm tra việc cấp trùng voucher tri ân.', 'Chưa kiểm thử'),
        'KT07': ('Khi giá, giỏ hàng, địa chỉ hoặc mã giảm giá thay đổi, hệ thống trả báo giá mới và yêu cầu xác nhận lại; không tạo đơn theo báo giá cũ.', 'Đạt'),
        'KT08': ('Các yêu cầu xác nhận lặp trả về cùng một đơn hàng. Tồn kho và số lượt dùng mã giảm giá chỉ thay đổi một lần; không phát sinh thêm bản ghi thanh toán.', 'Đạt'),
        'KT09': ('Chỉ sản phẩm được chọn được đưa vào đơn hàng. Những sản phẩm khác trong giỏ và dữ liệu của tài khoản khác được giữ nguyên; gửi lại yêu cầu không tạo thêm đơn.', 'Đạt'),
        'KT10': ('Với phản hồi PayOS mô phỏng, hệ thống khôi phục liên kết sau lỗi quá thời gian chờ; từ chối thông báo sai dữ liệu và không cập nhật thanh toán lặp khi nhận lại thông báo hợp lệ.', 'Đạt'),
        'KT11': ('PIN sai một lần không làm đơn hàng được ghi nhận đã thanh toán. PIN đúng cho phép thanh toán mô phỏng; gửi lại yêu cầu không phát sinh thêm thanh toán. Chưa kiểm tra đủ 5 lần sai và thời gian khóa 15 phút.', 'Chưa đầy đủ'),
        'KT12': ('Hệ thống từ chối mã xác nhận sai, giỏ hàng đã thay đổi hoặc thao tác đã bị hủy; yêu cầu lặp không xóa dữ liệu mới. Chưa kiểm tra xác nhận hết hạn theo thời gian.', 'Chưa đầy đủ'),
        'KT13': ('Thay đổi lựa chọn hoặc mã giảm giá làm báo giá cũ mất hiệu lực. Hủy bản nháp đặt hàng giữ nguyên giỏ hàng và không hủy đơn đã tạo.', 'Đạt'),
        'KT14': ('Nội dung chờ duyệt hoặc bị từ chối không được sử dụng như tri thức đã duyệt. Sau khi chỉnh sửa, nội dung phải được duyệt lại trước khi tái sử dụng.', 'Đạt'),
        'KT15': ('Giao diện xử lý thông báo lỗi, kết thúc phản hồi và hủy hàng đợi hiển thị. Chưa kiểm tra việc backend nhận tín hiệu hủy khi người dùng ngắt kết nối.', 'Chưa đầy đủ'),
    }
    table = next(t for t in doc.getElementsByTagNameNS(W, 'tbl') if 'KT01' in text(t))
    rows = elements(table, 'tr')
    original_cases = [[text(c) for c in elements(row, 'tc')[:3]] for row in rows[1:]]
    assert len(original_cases) == len(results) == 15
    # Repair direct cell runs left by the earlier editor while retaining paragraph styles.
    for cell in doc.getElementsByTagNameNS(W, 'tc'):
        for run in list(elements(cell, 'r')):
            paragraph = next(iter(elements(cell, 'p')), None)
            if paragraph is None:
                paragraph = new(doc, 'p')
                cell.appendChild(paragraph)
            paragraph.appendChild(run)
    widths = [650, 1850, 2050, 3221, 1300]  # Keep the existing 9071-twip table width.
    grid = elements(table, 'tblGrid')[0]
    for child in list(grid.childNodes):
        grid.removeChild(child)
    for width in widths:
        grid.appendChild(new(doc, 'gridCol', w=width))
    for row_index, row in enumerate(rows):
        cells = elements(row, 'tc')
        assert len(cells) == 5
        for index, cell in enumerate(cells):
            if index >= 3:
                template = cells[2]
                old_p = next(iter(elements(cell, 'p')), None)
                if old_p is not None:
                    ppr = elements(template.getElementsByTagNameNS(W, 'p')[0], 'pPr')
                    if ppr and not elements(old_p, 'pPr'):
                        old_p.insertBefore(ppr[0].cloneNode(True), old_p.firstChild)
                if not elements(cell, 'tcPr'):
                    cell.insertBefore(elements(template, 'tcPr')[0].cloneNode(True), cell.firstChild)
            props = elements(cell, 'tcPr')[0]
            size = elements(props, 'tcW')[0]
            size.setAttributeNS(W, 'w:w', str(widths[index]))
        if row_index:
            code = text(cells[0])
            actual, status = results[code]
            set_text(cells[3], actual)
            set_text(cells[4], status)

    replace('Kết quả chính của đồ án là cấu trúc ứng dụng',
        'Bên cạnh việc xây dựng các mô-đun chức năng, nhóm đã thực hiện kiểm thử tự động đối với '
        'một số nghiệp vụ và thành phần giao diện. Kết quả ghi nhận 113 ca kiểm thử đạt yêu cầu '
        'trong môi trường mô phỏng; quá trình biên dịch và đóng gói ứng dụng cũng hoàn thành thành công. '
        'Phạm vi và kết quả chi tiết được trình bày tại mục 2.5.14.')
    replace('Về xử lý nghiệp vụ, dự án đã có cơ chế',
        'Các kết quả kiểm thử cho thấy những trường hợp đã kiểm tra về đối chiếu báo giá, '
        'xử lý yêu cầu đặt hàng lặp, điều kiện đánh giá sau mua và xác nhận thao tác xóa trong chatbot '
        'cho kết quả phù hợp với yêu cầu. Tuy nhiên, các cơ chế này vẫn cần được đánh giá thêm '
        'khi sử dụng cơ sở dữ liệu và dịch vụ tích hợp thực tế.')
    replace('Các chức năng đã được cài đặt trong mã nguồn và minh họa',
        'Mặc dù đã triển khai các nhóm chức năng và thực hiện kiểm thử tự động trong phạm vi nhất định, '
        'đồ án vẫn còn những nội dung cần tiếp tục hoàn thiện. Một số tình huống mới được kiểm tra '
        'một phần; việc kiểm thử trên cơ sở dữ liệu thực tế, xác minh các dịch vụ ngoài, '
        'nghiệm thu thủ công và đo hiệu năng chưa được hoàn tất.')
    replace('Thiết kế hệ thống phân chia giao diện, API và dữ liệu;',
        'Hệ thống được tổ chức theo các thành phần giao diện, API và dữ liệu, với các mô-đun '
        'phụ trách từng nhóm nghiệp vụ. Kết quả kiểm thử tự động bước đầu hỗ trợ đánh giá việc '
        'xử lý các chức năng đã xây dựng và phát hiện một số sai sót về dữ liệu đầu vào. '
        'Việc kiểm thử tích hợp, đánh giá toàn bộ quy trình sử dụng và đo hiệu năng là cơ sở '
        'để tiếp tục hoàn thiện hệ thống trong giai đoạn sau.')
    replace('Hoạt động kiểm thử cần đối chiếu kết quả xử lý',
        'Hoạt động kiểm thử được thực hiện để đối chiếu kết quả xử lý với yêu cầu chức năng '
        'và các trường hợp lỗi. Các ca tự động đã thực hiện được tổng hợp tại mục 2.5.14. '
        'Đối với những nội dung chưa được kiểm tra đầy đủ trong môi trường tích hợp, nhóm '
        'tiếp tục xác định điều kiện thử nghiệm và bổ sung kết quả trong quá trình nghiệm thu.')

    settings = minidom.parseString(original['word/settings.xml'])
    update = settings.getElementsByTagNameNS(W, 'updateFields')
    if update:
        update[0].setAttributeNS(W, 'w:val', 'true')
    else:
        settings.documentElement.appendChild(new(settings, 'updateFields', val='true'))
    changed = {'word/document.xml': doc.toxml(encoding='UTF-8'),
               'word/settings.xml': settings.toxml(encoding='UTF-8')}
    assert captions == [text(p) for p in elements(body, 'p') if re.match(caption_pattern, text(p))]
    assert image_count == len(doc.getElementsByTagNameNS(W, 'drawing'))
    assert original_cases == [[text(c) for c in elements(row, 'tc')[:3]] for row in rows[1:]]
    with ZipFile(OUTPUT, 'w', ZIP_DEFLATED) as archive:
        for name, payload in original.items():
            archive.writestr(name, changed.get(name, payload))
    with ZipFile(OUTPUT) as archive:
        assert archive.testzip() is None
        for name, payload in original.items():
            if name not in changed:
                assert archive.read(name) == payload, name
        check = minidom.parseString(archive.read('word/document.xml'))
        assert '113 ca kiểm thử' in text(check) and '101 ca' in text(check) and '12 ca' in text(check)
        assert all(not elements(c, 'r') for c in check.getElementsByTagNameNS(W, 'tc'))
        assert set(results) == {text(elements(row, 'tc')[0]) for row in rows[1:]}
    print(json.dumps({'output': str(OUTPUT), 'images_preserved': image_count,
                      'test_rows': len(results), 'untouched_parts_verified': len(original) - len(changed)}, ensure_ascii=False))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
