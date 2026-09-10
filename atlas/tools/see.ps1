<#
  see.ps1 -- Look at an image through the local llama.cpp vision model.

  WHY THIS EXISTS
    The agent's chat model does not declare image input; harness `read_image`
    fails with: model "deepseek-v4-flash" does not declare image input.
    The Qwen2-VL build under C:\Users\luoti\Desktop\llama.cpp is therefore the
    only vision channel available on this machine.

  USAGE  (this box has Windows PowerShell 5.1; `pwsh` is NOT installed)
    powershell -NoProfile -ExecutionPolicy Bypass -File see.ps1 `
        -Image <path> [-Mode describe|ocr|ui|card|raw] [-Prompt "..."]

    Multiple images:  -Image a.png,b.jpg   (fed into one conversation)

  MODES
    describe  general description (default)
    ocr       text extraction only
    ui        game-screenshot reading
    card      card-face text extraction
    raw       no preset; use -Prompt

  NOTE ON ENCODING
    Windows PowerShell 5.1 decodes a BOM-less .ps1 as the system ANSI codepage
    (GBK here), so any non-ASCII literal in this file would turn into mojibake
    and break parsing. This script is therefore pure ASCII; the Chinese prompt
    presets live in see-prompts.json, read explicitly with -Encoding UTF8.
    Keep it that way when editing.

  EXIT CODES
    0 ok | 1 image missing | 2 model/exe missing
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string[]]$Image,
  [ValidateSet('describe', 'ocr', 'ui', 'card', 'raw')][string]$Mode = 'describe',
  [string]$Prompt,
  [int]$NPredict = 400,
  [int]$MinTokens = 1024,
  [string]$LlamaDir = 'C:\Users\luoti\Desktop\llama.cpp',
  [string]$Model = 'models\Qwen2-VL-2B-Instruct-Q4_K_M.gguf',
  [string]$Mmproj = 'models\mmproj-Qwen2-VL-2B-Instruct-f16.gguf',
  [switch]$Raw
)

$ErrorActionPreference = 'Stop'

$exe = Join-Path $LlamaDir 'llama-mtmd-cli.exe'
$mPath = Join-Path $LlamaDir $Model
$pPath = Join-Path $LlamaDir $Mmproj
if (-not (Test-Path $exe)) { Write-Error "missing $exe"; exit 2 }
if (-not (Test-Path $mPath)) { Write-Error "missing model $mPath"; exit 2 }
if (-not (Test-Path $pPath)) { Write-Error "missing mmproj $pPath"; exit 2 }

$paths = @()
foreach ($i in $Image) {
  $full = [System.IO.Path]::GetFullPath($i)
  if (-not (Test-Path $full)) { Write-Error "image not found: $full"; exit 1 }
  $paths += $full
}

if (-not $Prompt) {
  $promptFile = Join-Path $PSScriptRoot 'see-prompts.json'
  if (Test-Path $promptFile) {
    $presets = (Get-Content -Raw -Encoding UTF8 $promptFile) | ConvertFrom-Json
    $Prompt = $presets.$Mode
  }
  if (-not $Prompt) { $Prompt = 'Describe this image in detail.' }
}

$argList = @('-m', $mPath, '--mmproj', $pPath)
foreach ($p in $paths) { $argList += @('--image', $p) }
$argList += @('-p', $Prompt)
$argList += @('-n', "$NPredict", '--temp', '0.1', '-ngl', '99', '--image-min-tokens', "$MinTokens", '--no-warmup')

# llama.cpp logs go to stderr, the model answer to stdout: keep stdout only.
# -ngl 99 offloads to GPU (RTX 5050 here); --image-min-tokens 1024 avoids the
# accuracy warning Qwen-VL prints at load time.
#
# NB: with $ErrorActionPreference='Stop', PowerShell 5.1 promotes a native
# command's stderr into a TERMINATING error, which also clobbers $LASTEXITCODE
# and makes a successful run look like a failure. Drop to 'Continue' around the
# call, then read the real code immediately.
$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
if ($Raw) {
  & $exe @argList
} else {
  & $exe @argList 2>$null
}
$code = $LASTEXITCODE
$ErrorActionPreference = $prevEap
exit $code
