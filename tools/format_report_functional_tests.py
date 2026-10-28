"""Present representative business tests in nine compact Word tables."""
from pathlib import Path
from xml.dom import minidom
from zipfile import ZipFile, ZIP_DEFLATED
import json
import sys

from update_report_testing import W, elements, text, new, set_text

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'artifacts/bao-cao/Bao_cao_Gia_dung_Viet_bien_tap_phan_kiem_thu.docx'
OUTPUT = ROOT / 'artifacts/bao-cao/Bao_cao_Gia_dung_Viet_kiem_thu_theo_chuc_nang.docx'
HEADERS = ['Mã test case', 'Mục tiêu kiểm thử', 'Các bước thực hiện', 'Dữ liệu đầu vào', 'Kết quả mong đợi', 'Trạng thái']
WIDTHS = [760, 1510, 2080, 1430, 2350, 941]

# Each passing scenario points to a native test event from the recorded run.
GROUPS = [
    ('Tài khoản', [
        ('TK01', 'Đăng ký tài khoản', 'Gửi thông tin đăng ký hợp lệ; gửi lại cùng thông tin.', 'Họ tên, tên đăng nhập, email và mật khẩu hợp lệ.', 'Tạo tài khoản khách hàng; từ chối thông tin đăng ký trùng.', 'Đạt', 'QA-A02'),
        ('TK02', 'Kiểm tra thông tin đăng ký', 'Gửi yêu cầu đăng ký với từng dữ liệu không hợp lệ.', 'Tên để trống; email sai; mật khẩu dưới 6 ký tự.', 'Từ chối yêu cầu; không tạo tài khoản.', 'Đạt', 'QA-A01'),
        ('TK03', 'Đăng nhập', 'Đăng nhập bằng tên hoặc email; thử lại với mật khẩu sai.', 'Tài khoản đã tạo; mật khẩu đúng và sai.', 'Cho phép đăng nhập khi đúng; từ chối khi sai.', 'Đạt', 'QA-A03'),
        ('TK04', 'Khôi phục mật khẩu', 'Xác minh OTP; đặt mật khẩu mới; thử dùng lại mã.', 'OTP hợp lệ, sai hoặc hết hạn; mật khẩu mới.', 'Chỉ mã hợp lệ được xác minh cho phép đổi mật khẩu; mã đã dùng bị từ chối.', 'Đạt', 'QA-A07|QA-A08'),
    ]),
    ('Sản phẩm', [
        ('SP01', 'Xem thông tin sản phẩm', 'Yêu cầu xem chi tiết sản phẩm đang có trong danh mục.', 'Sản phẩm mã 10; giá ưu đãi 300.000 đồng.', 'Trả đúng giá bán, giá gốc và số lượng tồn kho.', 'Đạt', 'QA-B05'),
        ('SP02', 'Xử lý sản phẩm không tồn tại', 'Yêu cầu xem chi tiết sản phẩm không có trong danh mục.', 'Mã sản phẩm 999.', 'Thông báo không tìm thấy sản phẩm.', 'Đạt', 'QA-B05'),
        ('SP03', 'Hiển thị giá ưu đãi', 'Kết xuất thông tin giá của sản phẩm đang giảm giá.', 'Giá gốc 500.000 đồng; giá bán 300.000 đồng; giảm 40%.', 'Hiển thị đúng giá bán, giá gốc và số tiền tiết kiệm 200.000 đồng.', 'Đạt', 'QA-F01'),
    ]),
    ('Giỏ hàng', [
        ('GH01', 'Thêm và sửa số lượng', 'Thêm sản phẩm vào giỏ; tăng số lượng từ 2 lên 3.', 'Sản phẩm mã 10; đơn giá 500.000 đồng.', 'Giỏ cập nhật đúng số lượng và tổng tiền.', 'Đạt', 'QA-B03'),
        ('GH02', 'Xóa sản phẩm khỏi giỏ', 'Thêm sản phẩm; gửi yêu cầu xóa khỏi giỏ của tài khoản đó.', 'Giỏ có một loại sản phẩm.', 'Sản phẩm được xóa; giỏ của tài khoản khác không thay đổi.', 'Đạt', 'QA-B03'),
        ('GH03', 'Kiểm tra số lượng mua', 'Thêm sản phẩm với số lượng không hợp lệ hoặc vượt tồn kho.', 'Số lượng 0, âm, số lẻ hoặc vượt số còn lại.', 'Từ chối yêu cầu; dữ liệu giỏ hàng giữ nguyên.', 'Đạt', 'QA-B02'),
    ]),
    ('Đặt hàng', [
        ('DH01', 'Đặt hàng hợp lệ', 'Gửi thông tin nhận hàng; xem báo giá; xác nhận tạo đơn.', '3 sản phẩm, đơn giá 500.000 đồng; thanh toán khi nhận hàng.', 'Tạo đơn tổng 1.500.000 đồng; cập nhật tồn kho và giỏ hàng.', 'Đạt', 'QA-C01'),
        ('DH02', 'Đặt riêng một sản phẩm', 'Chọn một dòng trong giỏ; xem báo giá và xác nhận.', 'Giỏ có nhiều dòng; chọn sản phẩm mã 20.', 'Chỉ đặt dòng đã chọn; các dòng còn lại vẫn trong giỏ.', 'Đạt', 'web buy-one checkout charges only'),
        ('DH03', 'Bảo vệ thông tin đơn hàng', 'Dùng tài khoản khác yêu cầu xem đơn đã tạo.', 'Đơn của tài khoản 1; tài khoản truy cập là 2.', 'Từ chối truy cập đơn không thuộc tài khoản.', 'Đạt', 'QA-C02'),
    ]),
    ('Thanh toán', [
        ('TT01', 'Thanh toán khi nhận hàng', 'Quản trị viên cập nhật đơn tiền mặt sang trạng thái đã giao.', 'Đơn thanh toán khi nhận hàng.', 'Đơn và bản ghi thanh toán được cập nhật đã thanh toán.', 'Đạt', 'QA-C02'),
        ('TT02', 'Thanh toán thẻ mô phỏng', 'Xác nhận thanh toán bằng PIN sai; thử lại bằng PIN đúng.', 'Thẻ mô phỏng đã lưu; PIN đúng và sai.', 'PIN sai không ghi nhận thanh toán; PIN đúng hoàn tất thanh toán mô phỏng.', 'Đạt', 'CARD is explicitly simulated'),
        ('TT03', 'Tạo liên kết thanh toán QR', 'Yêu cầu liên kết thanh toán cho đơn của mình.', 'Đơn chọn QR; phản hồi PayOS mô phỏng.', 'Liên kết gắn đúng đơn và số tiền; yêu cầu lại không tạo thêm liên kết.', 'Đạt', 'PayOS uses owned persisted order amount'),
    ]),
    ('Khuyến mãi', [
        ('KM01', 'Áp dụng mã giảm giá', 'Chọn mã cho đơn đủ điều kiện; xem tổng tiền sau giảm.', 'Mã K; giá trị hàng thường 500.000 đồng; giảm 10%.', 'Giảm 50.000 đồng; tổng còn 450.000 đồng.', 'Đạt', 'applying letter-only voucher K'),
        ('KM02', 'Từ chối mã không đủ điều kiện', 'Áp dụng lần lượt mã hết hạn, mã riêng của người khác hoặc mã chưa đủ giá trị đơn.', 'EXPIRED; OTHER2; SALE10 với giỏ 200.000 đồng.', 'Từ chối mã và không tạo đơn không hợp lệ.', 'Đạt', 'invalid products, stock, ownership'),
        ('KM03', 'Kiểm tra lịch sự kiện ưu đãi', 'Gửi yêu cầu công bố sự kiện trùng lịch sự kiện đang có.', 'Hai sự kiện công bố có thời gian chồng nhau.', 'Từ chối công bố sự kiện trùng lịch.', 'Đạt', 'QA-E03'),
    ]),
    ('Yêu thích và đánh giá', [
        ('YT01', 'Lưu và bỏ yêu thích', 'Thêm sản phẩm vào yêu thích; thêm lại; sau đó xóa.', 'Tài khoản đã đăng nhập; sản phẩm mã 10.', 'Không tạo mục trùng; xóa đúng mục của tài khoản.', 'Đạt', 'QA-D02'),
        ('DG01', 'Gửi và sửa đánh giá', 'Gửi đánh giá sau mua; chỉnh lại số sao và nội dung.', 'Đơn đã giao, đã thanh toán; đánh giá 5 sao rồi sửa thành 3 sao.', 'Lưu đánh giá hợp lệ; chỉnh sửa không tạo bản thứ hai.', 'Đạt', 'QA-D01'),
        ('DG02', 'Kiểm tra điều kiện đánh giá', 'Gửi đánh giá khi đơn chưa giao hoặc chưa thanh toán.', 'Đơn chưa đủ điều kiện; sản phẩm đã chọn.', 'Từ chối lưu đánh giá.', 'Đạt', 'QA-D01'),
    ]),
    ('Quản trị', [
        ('QT01', 'Kiểm soát quyền quản trị', 'Yêu cầu truy cập API quản trị với tài khoản khách hàng và quản trị viên.', 'Hai tài khoản có vai trò khác nhau.', 'Khách hàng bị từ chối; quản trị viên được truy cập các API đã kiểm tra.', 'Đạt', 'QA-A05'),
        ('QT02', 'Kiểm tra trạng thái đơn hàng', 'Gửi yêu cầu cập nhật đơn bằng trạng thái không được hỗ trợ.', 'Đơn đã tạo; giá trị trạng thái không hợp lệ.', 'Từ chối yêu cầu cập nhật trạng thái sai.', 'Đạt', 'QA-C02'),
        ('QT03', 'Cập nhật sản phẩm qua giao diện', 'Mở trang quản lý; sửa thông tin sản phẩm; lưu và kiểm tra lại.', 'Một sản phẩm đang có trong danh mục.', 'Thông tin mới được lưu và hiển thị thống nhất.', 'Chưa kiểm thử', None),
    ]),
    ('Chatbot', [
        ('CB01', 'Tra cứu sản phẩm', 'Hỏi chatbot về ghế trong khoảng ngân sách.', '“Có ghế dưới 2 triệu không?”', 'Phản hồi sản phẩm cùng giá và số lượng theo dữ liệu mô phỏng.', 'Đạt', 'TEST 8: chairs within 2M'),
        ('CB02', 'Thao tác giỏ hàng qua hội thoại', 'Tìm sản phẩm; chọn sản phẩm; yêu cầu thêm và sửa số lượng.', 'Sản phẩm trong kết quả tìm; số lượng 2 rồi 3.', 'Giỏ cập nhật theo yêu cầu và chỉ thuộc tài khoản đang đăng nhập.', 'Đạt', 'latest search order, exact selection'),
        ('CB03', 'Xác nhận trước khi xóa giỏ', 'Yêu cầu xóa toàn bộ giỏ; hủy hoặc xác nhận thao tác.', 'Giỏ có sản phẩm; lựa chọn hủy hoặc đồng ý.', 'Hủy thì giữ giỏ; chỉ xóa sau khi có xác nhận hợp lệ.', 'Đạt', 'clear cart requires confirmation'),
    ]),
]


def prop(parent, name, **attrs):
    node = next(iter(elements(parent, name)), None)
    if node is None:
        node = new(parent.ownerDocument, name)
        parent.appendChild(node)
    for key, value in attrs.items():
        node.setAttributeNS(W, 'w:' + key, str(value))
    return node


def paragraph(doc, value, *, size=26, bold=False, center=False, keep=False):
    node = new(doc, 'p')
    ppr = prop(node, 'pPr')
    if keep:
        prop(ppr, 'keepNext')
    prop(ppr, 'widowControl')
    prop(ppr, 'spacing', before=0, after=100, line=276, lineRule='auto')
    prop(ppr, 'ind', left=0, right=0, firstLine=0)
    prop(ppr, 'jc', val='center' if center else 'both')
    run = new(doc, 'r')
    rpr = prop(run, 'rPr')
    prop(rpr, 'rFonts', ascii='Times New Roman', hAnsi='Times New Roman', cs='Times New Roman', eastAsia='Times New Roman')
    prop(rpr, 'sz', val=size)
    prop(rpr, 'szCs', val=size)
    if bold:
        prop(rpr, 'b')
    content = new(doc, 't')
    content.appendChild(doc.createTextNode(value))
    run.appendChild(content)
    node.appendChild(run)
    return node


def table(doc, cases):
    node = new(doc, 'tbl')
    props = prop(node, 'tblPr')
    prop(props, 'tblW', w=sum(WIDTHS), type='dxa')
    prop(props, 'jc', val='center')
    prop(props, 'tblLayout', type='fixed')
    borders = prop(props, 'tblBorders')
    for side in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
        prop(borders, side, val='single', sz=4, color='A6A6A6')
    margins = prop(props, 'tblCellMar')
    for side, amount in [('top', 70), ('bottom', 70), ('left', 70), ('right', 70)]:
        prop(margins, side, w=amount, type='dxa')
    grid = new(doc, 'tblGrid')
    for width in WIDTHS:
        grid.appendChild(new(doc, 'gridCol', w=width))
    node.appendChild(grid)
    rows = [HEADERS] + [list(case[:6]) for case in cases]
    for row_index, values in enumerate(rows):
        row = new(doc, 'tr')
        rpr = prop(row, 'trPr')
        prop(rpr, 'cantSplit')
        if not row_index:
            prop(rpr, 'tblHeader')
        for index, value in enumerate(values):
            cell = new(doc, 'tc')
            cpr = prop(cell, 'tcPr')
            prop(cpr, 'tcW', w=WIDTHS[index], type='dxa')
            if not row_index:
                prop(cpr, 'shd', val='clear', color='auto', fill='E8EDF3')
            elif row_index % 2 == 0:
                prop(cpr, 'shd', val='clear', color='auto', fill='F7F8FA')
            prop(cpr, 'vAlign', val='center' if index in (0, 5) or not row_index else 'top')
            p = paragraph(doc, value, size=22, bold=not row_index,
                          center=index in (0, 5) or not row_index, keep=row_index < len(rows) - 1)
            pp = elements(p, 'pPr')[0]
            prop(pp, 'spacing', before=0, after=0, line=240, lineRule='auto')
            if row_index and index not in (0, 5):
                prop(pp, 'jc', val='left')
            cell.appendChild(p)
            row.appendChild(cell)
        node.appendChild(row)
    return node


def main():
    assert not OUTPUT.exists(), 'Output already exists; keep earlier artifacts intact'
    evidence = json.loads((ROOT / 'docs/test-results/cases.json').read_text(encoding='utf-8'))
    assert len(evidence) == 118
    for _, cases in GROUPS:
        for case in cases:
            if case[5] == 'Đạt':
                for key in case[6].split('|'):
                    assert any(key in item['function'] and item['status'] == 'PASS' for item in evidence), key
            else:
                assert case[6] is None
    with ZipFile(SOURCE) as archive:
        original = {entry.filename: archive.read(entry) for entry in archive.infolist()}
    doc = minidom.parseString(original['word/document.xml'])
    body = doc.getElementsByTagNameNS(W, 'body')[0]
    nodes = elements(body)
    start = next(i for i, node in enumerate(nodes) if text(node) == '2.5.14 Kiểm thử và bằng chứng triển khai')
    end = next(i for i in range(start + 1, len(nodes)) if text(nodes[i]).startswith('2.5.15 '))
    before = [node.toxml() for node in nodes[:start + 1]]
    after = [node.toxml() for node in nodes[end:]]
    anchor = nodes[end]
    for node in nodes[start + 1:end]:
        body.removeChild(node)

    def insert(value, **options):
        body.insertBefore(paragraph(doc, value, **options), anchor)

    insert('Kiểm thử được thực hiện nhằm đánh giá các chức năng nghiệp vụ chính của website Gia dụng Việt. '
           'Các tình huống được lựa chọn theo nhu cầu sử dụng của khách hàng và quản trị viên, bao gồm '
           'quản lý tài khoản, tra cứu sản phẩm, mua hàng và hỗ trợ qua chatbot.')
    insert('Các bảng từ Bảng 2.7 đến Bảng 2.15 trình bày 28 tình huống tiêu biểu. '
           'Những tình huống có cùng mục tiêu được gộp để tránh lặp nội dung. Trạng thái “Đạt” được '
           'đối chiếu với các ca tự động đã thực hiện ở mức dịch vụ, API hoặc thành phần giao diện; '
           'dữ liệu và các dịch vụ ngoài được mô phỏng. Các bước trong bảng mô tả trình tự nghiệp vụ, '
           'không thay thế bằng chứng kiểm thử thao tác trên trình duyệt.')
    for index, (name, cases) in enumerate(GROUPS, 7):
        caption = paragraph(doc, f'Bảng 2.{index}. Kiểm thử chức năng {name.lower()}', size=24, bold=True, center=True, keep=True)
        prop(elements(caption, 'pPr')[0], 'spacing', before=180, after=100)
        body.insertBefore(caption, anchor)
        body.insertBefore(table(doc, cases), anchor)
    insert('Kết quả và phạm vi đánh giá', bold=True, keep=True)
    insert('Trong 28 tình huống được lựa chọn, 27 tình huống có bằng chứng kiểm thử tự động đạt yêu cầu '
           'trong phạm vi mô phỏng; một tình huống về cập nhật sản phẩm qua giao diện chưa được kiểm thử. '
           'Các bảng là phần tổng hợp nghiệp vụ, không phải danh sách đầy đủ và không được cộng thêm '
           'vào tổng số ca tự động của dự án.')
    insert('Lần thực hiện ngày 27/10/2026 trên môi trường Windows, Node.js 22.8.0 và npm 10.8.2 '
           'ghi nhận 113 ca kiểm thử chi tiết thành công, gồm 101 ca backend và 12 ca frontend. '
           'Quá trình biên dịch và đóng gói hai thành phần cũng hoàn thành thành công. '
           'Việc kiểm thử đã giúp phát hiện và khắc phục sai sót về họ tên rỗng khi đăng ký '
           'và cách xử lý dữ liệu mã giảm giá không hợp lệ.')
    insert('Các kiểm tra kỹ thuật chuyên sâu như gửi lặp yêu cầu, khôi phục giao dịch khi lỗi, '
           'xác thực thông báo thanh toán và xử lý phản hồi chatbot theo luồng được lưu trong '
           'hồ sơ kiểm thử kèm mã nguồn, tách khỏi các bảng chức năng chính. Kết quả hiện tại chưa '
           'xác minh ràng buộc và khóa trên MySQL thực tế, giao tiếp với PayOS, Gemini, Resend, '
           'toàn bộ luồng sử dụng trên trình duyệt hoặc hiệu năng dưới tải. Việc cấp voucher tri ân '
           'theo ngưỡng đơn hàng, khóa PIN sau nhiều lần nhập sai và xác nhận hết hạn cũng cần '
           'được kiểm tra bổ sung trước khi nghiệm thu.')

    changed = {'word/document.xml': doc.toxml(encoding='UTF-8')}
    settings = minidom.parseString(original['word/settings.xml'])
    prop(settings.documentElement, 'updateFields', val='true')
    changed['word/settings.xml'] = settings.toxml(encoding='UTF-8')
    with ZipFile(OUTPUT, 'w', ZIP_DEFLATED) as archive:
        for name, data in original.items():
            archive.writestr(name, changed.get(name, data))
    with ZipFile(OUTPUT) as archive:
        assert archive.testzip() is None
        for name, data in original.items():
            if name not in changed:
                assert archive.read(name) == data, name
        check = minidom.parseString(archive.read('word/document.xml'))
    checked_body = check.getElementsByTagNameNS(W, 'body')[0]
    checked = elements(checked_body)
    assert before == [node.toxml() for node in checked[:start + 1]]
    tail = next(i for i, node in enumerate(checked) if text(node).startswith('2.5.15 ') and i > start)
    assert after == [node.toxml() for node in checked[tail:]]
    tables = elements(checked_body, 'tbl')[-9:]
    assert len(tables) == 9
    codes = []
    for tbl in tables:
        rows = elements(tbl, 'tr')
        assert [text(cell) for cell in elements(rows[0], 'tc')] == HEADERS
        for row in rows:
            assert len(elements(row, 'tc')) == 6
            assert elements(elements(row, 'trPr')[0], 'cantSplit')
        codes.extend(text(elements(row, 'tc')[0]) for row in rows[1:])
    assert len(codes) == len(set(codes)) == 28
    assert len(check.getElementsByTagNameNS(W, 'drawing')) == len(doc.getElementsByTagNameNS(W, 'drawing')) == 50
    print(json.dumps({'output': str(OUTPUT), 'groups': 9, 'cases': len(codes), 'images_preserved': 50}, ensure_ascii=False))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
