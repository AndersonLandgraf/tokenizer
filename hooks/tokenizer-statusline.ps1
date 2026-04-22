# tokenizer-statusline.ps1 — Shows tokenizer mode in Claude Code status line (Windows)

$flagDir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { "$env:USERPROFILE\.claude" }
$flagFile = Join-Path $flagDir ".tokenizer-active"

if (Test-Path $flagFile) {
    $mode = (Get-Content $flagFile -Raw).Trim()
    switch ($mode) {
        "lite"  { Write-Output "TKN:lite" }
        "full"  { Write-Output "TKN:full" }
        "ultra" { Write-Output "TKN:ultra" }
        default { Write-Output "" }
    }
}
