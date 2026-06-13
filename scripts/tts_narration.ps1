# Synthesizes per-segment narration with Microsoft Zira (en-US) to
# work/audio/vo/<id>.wav at 44.1kHz/16-bit/mono, and prints id,durationSec.
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech

$root = Split-Path -Parent $PSScriptRoot
$specPath = Join-Path $root "work\trailer_spec.json"
$voDir = Join-Path $root "work\audio\vo"
New-Item -ItemType Directory -Force -Path $voDir | Out-Null

$spec = Get-Content $specPath -Raw -Encoding UTF8 | ConvertFrom-Json

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice("Microsoft Zira Desktop")
$synth.Rate = 1       # slightly brisk = lively trailer pace
$synth.Volume = 100
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(44100, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)

$results = @()
foreach ($seg in $spec.segments) {
    if ([string]::IsNullOrWhiteSpace($seg.vo)) { continue }
    $path = Join-Path $voDir ($seg.id + ".wav")
    $synth.SetOutputToWaveFile($path, $fmt)
    $synth.Speak($seg.vo)
    $synth.SetOutputToNull()
    $bytes = (Get-Item $path).Length
    $dur = [math]::Round(($bytes - 44) / (44100.0 * 2.0), 3)
    $results += [pscustomobject]@{ id = $seg.id; dur = $dur }
    Write-Output ("{0} {1}s" -f $seg.id, $dur)
}
$synth.Dispose()

$total = ($results | Measure-Object -Property dur -Sum).Sum
Write-Output ("TOTAL_VO {0}s across {1} lines" -f [math]::Round($total, 1), $results.Count)
$results | ConvertTo-Json | Out-File -FilePath (Join-Path $root "work\audio\vo_durations.json") -Encoding utf8
