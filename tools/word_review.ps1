param(
    [Parameter(Mandatory=$true)][string]$DocumentPath,
    [Parameter(Mandatory=$true)][string]$OutputPrefix,
    [switch]$Finalize
)
$ErrorActionPreference='Stop'
$absoluteDocument=(Resolve-Path -LiteralPath $DocumentPath).Path
$absolutePrefix=[IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputPrefix))
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($absolutePrefix))|Out-Null
$word=New-Object -ComObject Word.Application
$report=$null
try {
    $word.Visible=$false
    $word.DisplayAlerts=0
    $word.AutomationSecurity=3
    $report=$word.Documents.Open($absoluteDocument,$false,(-not $Finalize.IsPresent),$false)
    $report.ActiveWindow.View.Type=3
    if($Finalize){
        $report.Fields.Update()|Out-Null
        $report.Repaginate()
        foreach($toc in $report.TablesOfContents){
            $toc.Update()
            $toc.Range.Font.Name='Times New Roman'
            $toc.Range.Font.Size=12
            foreach($paragraph in $toc.Range.Paragraphs){
                $styleName=[string]$paragraph.Range.Style.NameLocal
                $level=1
                if($styleName -match '(\d)$'){$level=[int]$Matches[1]}
                $format=$paragraph.Format
                $format.FirstLineIndent=0
                $format.LeftIndent=12*($level-1)
                $format.RightIndent=0
                $format.SpaceBefore=0
                $format.SpaceAfter=2
                $format.LineSpacingRule=1
                $format.Alignment=0
                $format.KeepWithNext=0
                $format.TabStops.ClearAll()
                $usable=$report.PageSetup.PageWidth-$report.PageSetup.LeftMargin-$report.PageSetup.RightMargin
                $format.TabStops.Add($usable,2,1)|Out-Null
            }
        }
        for($pass=0;$pass -lt 2;$pass++){
            $report.Repaginate()
            foreach($toc in $report.TablesOfContents){$toc.UpdatePageNumbers()}
        }
        $report.Repaginate()
        $report.Save()
    } else {$report.Repaginate()}
    $report.ExportAsFixedFormat($absolutePrefix+'.pdf',17)
    $headings=@()
    foreach($paragraph in $report.Paragraphs){
        $value=$paragraph.Range.Text.Trim([char]13,[char]7,[char]12,[char]32)
        $level=[int]$paragraph.OutlineLevel
        if($level -le 3 -and $value){
            $headings+=@{text=$value;level=$level;page=[int]$paragraph.Range.Information(3);printedPage=[int]$paragraph.Range.Information(1)}
        }
    }
    $tables=@()
    foreach($table in $report.Tables){
        $sample=$table.Cell(1,1).Range.Text.Trim([char]13,[char]7)
        if($sample -eq 'Mã test case'){
            $tables+=@{startPage=[int]$table.Range.Information(3);endPage=[int]$table.Range.Characters.Last.Information(3);rows=$table.Rows.Count;width=$table.PreferredWidth}
        }
    }
    $info=@{pages=$report.ComputeStatistics(2);inlineShapes=$report.InlineShapes.Count;shapes=$report.Shapes.Count;tocCount=$report.TablesOfContents.Count;tocText=($report.TablesOfContents|ForEach-Object{$_.Range.Text});headings=$headings;testTables=$tables}
    $info|ConvertTo-Json -Depth 8|Set-Content -LiteralPath ($absolutePrefix+'.json') -Encoding UTF8
    Write-Output (@{pages=$info.pages;inlineShapes=$info.inlineShapes;shapes=$info.shapes;tocCount=$info.tocCount}|ConvertTo-Json -Compress)
} finally {
    if($report){$report.Close(0)}
    $word.Quit()
}
