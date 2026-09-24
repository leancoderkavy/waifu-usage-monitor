# Memory profile of a running Waifu Usage Monitor: the app process plus every
# WebView2 process it spawned. Samples a few times and prints per-process and
# total working set and private memory in MB, plus CPU use between samples
# (100 = one full core).
#
#   pwsh scripts/memprofile.ps1 [-Samples 6] [-Interval 5] [-ProcessId 1234]
param(
  [int]$Samples = 6,
  [int]$Interval = 5,
  [int]$ProcessId = 0
)

function Get-Tree([int]$root) {
  $all = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name
  $ids = [System.Collections.Generic.List[int]]::new()
  $ids.Add($root)
  for ($i = 0; $i -lt $ids.Count; $i++) {
    $all | Where-Object ParentProcessId -eq $ids[$i] | ForEach-Object { $ids.Add([int]$_.ProcessId) }
  }
  $ids
}

if (-not $ProcessId) {
  $ProcessId = (Get-Process waifu-usage-monitor -ErrorAction Stop | Select-Object -First 1).Id
}

$totals = @()
$prevCpu = $null
$prevAt = $null
for ($s = 1; $s -le $Samples; $s++) {
  $rows = foreach ($id in Get-Tree $ProcessId) {
    $p = Get-Process -Id $id -ErrorAction SilentlyContinue
    if (-not $p) { continue }
    $cim = Get-CimInstance Win32_Process -Filter "ProcessId=$id"
    $kind = if ($cim.CommandLine -match '--type=([\w-]+)') { $Matches[1] } elseif ($p.Name -eq 'msedgewebview2') { 'browser' } else { 'app' }
    if ($cim.CommandLine -match '--utility-sub-type=([\w.]+)') { $kind += ':' + ($Matches[1] -replace '.*\.', '') }
    [pscustomobject]@{
      Pid       = $id
      Kind      = $kind
      WorkingMB = [math]::Round($p.WorkingSet64 / 1MB, 1)
      PrivateMB = [math]::Round($p.PrivateMemorySize64 / 1MB, 1)
      CpuSec    = [math]::Round($p.TotalProcessorTime.TotalSeconds, 2)
    }
  }
  $ws = ($rows | Measure-Object WorkingMB -Sum).Sum
  $pv = ($rows | Measure-Object PrivateMB -Sum).Sum
  $cpu = ($rows | Measure-Object CpuSec -Sum).Sum
  $at = Get-Date
  $pct = if ($prevAt) { [math]::Round(($cpu - $prevCpu) / ($at - $prevAt).TotalSeconds * 100, 1) } else { $null }
  $prevCpu = $cpu
  $prevAt = $at
  $totals += [pscustomobject]@{ Sample = $s; Procs = $rows.Count; WorkingMB = $ws; PrivateMB = $pv; CpuPct = $pct }
  if ($s -eq $Samples) {
    $rows | Sort-Object PrivateMB -Descending | Format-Table -AutoSize | Out-String | Write-Output
  }
  if ($s -lt $Samples) { Start-Sleep -Seconds $Interval }
}
$totals | Format-Table -AutoSize | Out-String | Write-Output
