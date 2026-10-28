$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$src='artifacts\bao-cao\Bao_cao_Gia_dung_Viet_day_du_anh_giao_dien.docx'
$out='artifacts\bao-cao\Bao_cao_Gia_dung_Viet_da_chinh_sua.docx'
$tmp=Join-Path $env:TEMP ('docx-'+[guid]::NewGuid())
[IO.Directory]::CreateDirectory($tmp)|Out-Null
[IO.Compression.ZipFile]::ExtractToDirectory((Resolve-Path $src),$tmp)
$xmlPath=Join-Path $tmp 'word\document.xml'
[xml]$doc=Get-Content -Raw -Encoding UTF8 $xmlPath
$ns=New-Object Xml.XmlNamespaceManager($doc.NameTable);$ns.AddNamespace('w','http://schemas.openxmlformats.org/wordprocessingml/2006/main')
$W='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
function Text($n){(($n.SelectNodes('.//w:t',$ns)|% InnerText)-join '')}
function SetText($n,[string]$value){$ts=@($n.SelectNodes('.//w:t',$ns));if(!$ts.Count){$r=$doc.CreateElement('w','r',$W);$t=$doc.CreateElement('w','t',$W);$t.InnerText=$value;$r.AppendChild($t)|Out-Null;$n.AppendChild($r)|Out-Null;return};$ts[0].InnerText=$value;for($i=1;$i -lt $ts.Count;$i++){$ts[$i].ParentNode.RemoveChild($ts[$i])|Out-Null}}
function FindP([string]$starts){$doc.SelectNodes('//w:p',$ns)|?{(Text $_).Trim().StartsWith($starts)}}
# Remove clearly identified internal notes.
foreach($p in @($doc.SelectNodes('//w:p',$ns)|?{(Text $_)-match 'Báo cáo cần bổ sung địa chỉ trang|Phân công được biên tập theo yêu cầu|Để làm rõ cơ sở của phần khảo sát|cần được hai thành viên xác nhận'})){$p.ParentNode.RemoveChild($p)|Out-Null}
# Replace survey section with information already present in the report; mark missing source metadata.
$p=FindP 'Kết quả tham khảo cho thấy'; if($p){SetText $p 'Kết quả tham khảo cho thấy cần ưu tiên thông tin sản phẩm rõ ràng, thao tác mua hàng dễ theo dõi và dữ liệu quản trị nhất quán. Địa chỉ trang và ngày truy cập chưa được cung cấp.'}
# Remove duplicated numbered descriptions between the two function tables.
$all=@($doc.SelectNodes('//w:body/*',$ns));$start=-1;$end=-1
for($i=0;$i -lt $all.Count;$i++){ $t=Text $all[$i]; if($t -eq 'Bảng 2.1. Tổng hợp chức năng dành cho khách hàng'){$start=$i}; if($t -eq '2.1.2 Chức năng quản trị viên'){$end=$i} }
if($start -ge 0 -and $end -gt $start){for($i=$end-1;$i -gt $start;$i--){$t=Text $all[$i];if($t -match '^\d+\. ' -or $t -match '^Người dùng đăng ký|^Khách hàng có thể|^Quản trị viên có thể|^Cập nhật họ tên|^Đổi mật khẩu|^Lưu, sửa|^Thêm hoặc bỏ|^Xem mã|^Xem giá|^Gửi hoặc sửa|^Lưu thông tin|^Tìm sản phẩm|^Xem tổng tiền|^Quản trị viên là đối tượng|^Quản trị viên theo dõi|^Hệ thống cho phép|^Chức năng thống kê|^Tạo, sửa|^Tạo và sửa|^Xem, lọc|^Chuyển đơn'){$all[$i].ParentNode.RemoveChild($all[$i])|Out-Null}}
}
# Conservative wording corrections.
$p=FindP 'Mặc dù đã hoàn thành hầu hết';if($p){SetText $p 'Các chức năng đã được cài đặt trong mã nguồn và minh họa bằng ảnh giao diện ở mục 2.5.5; nghiệm thu và đo hiệu năng đang thực hiện.'}
$p=FindP 'Xem thống kê doanh thu thông qua trang Dashboard';if($p){SetText $p 'Xem tổng giá trị đơn hàng (không tính đơn đã hủy) thông qua trang Dashboard.'}
$p=FindP '98% khách hàng hài lòng';if($p){SetText $p 'Các thông điệp quảng bá trên giao diện là nội dung giới thiệu tĩnh, chưa tương ứng với chức năng nghiệp vụ trong hệ thống. [TÔI CẦN QUYẾT ĐỊNH: giữ, đổi hoặc bỏ con số 98% trên giao diện]'}
# Add two blank cells to the assignment table and every test-case table.
$tables=@($doc.SelectNodes('//w:tbl',$ns));foreach($idx in @(1,9)){$tbl=$tables[$idx];if($tbl){$add=if($idx -eq 1){1}else{2};foreach($row in @($tbl.SelectNodes('./w:tr',$ns))){for($j=0;$j -lt $add;$j++){$c=$doc.CreateElement('w','tc',$W);$p=$doc.CreateElement('w','p',$W);$c.AppendChild($p)|Out-Null;$row.AppendChild($c)|Out-Null}};$hdr=@($tbl.SelectNodes('./w:tr[1]/w:tc',$ns));if($idx -eq 1){SetText $hdr[3] 'Ghi chú'}else{SetText $hdr[3] 'Kết quả thực tế';SetText $hdr[4] 'Đạt / Không đạt'}}}
$settings=New-Object Xml.XmlWriterSettings; $settings.Encoding=New-Object Text.UTF8Encoding($false);$settings.Indent=$false;$xw=[Xml.XmlWriter]::Create($xmlPath,$settings);$doc.Save($xw);$xw.Close()
if(Test-Path $out){Remove-Item -LiteralPath $out -Force};[IO.Compression.ZipFile]::CreateFromDirectory($tmp,(Join-Path (Get-Location) $out));Remove-Item $tmp -Recurse -Force
