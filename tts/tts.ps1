# 于笙 · 语音合成脚本（火山引擎 · 豆包语音 2.0 / 声音复刻音色）
#
# 用法：
#   $env:VOLC_TTS_APPID="1234567890"
#   $env:VOLC_TTS_TOKEN="your-access-token"
#   $env:VOLC_TTS_SPEAKER="S_xxxxxxxx"
#   powershell -File tts.ps1 -Text "爸爸 你回来啦" -Out "E:\out\a.mp3"
#
# 可选参数：
#   -Emotion happy -EmotionScale 3   # 情绪 + 强度(1-5)
#   -SpeechRate 8                    # 语速 -50~100
#   -PitchRate 12                    # 音高 -50~100（越大越亮）
#
# 说明：凭证只从环境变量读取，不写进仓库。
param(
    [Parameter(Mandatory = $true)][string]$Text,
    [Parameter(Mandatory = $true)][string]$Out,
    [string]$Speaker = $(if ($env:VOLC_TTS_SPEAKER) { $env:VOLC_TTS_SPEAKER } else { "" }),
    [int]$SampleRate = 24000,
    [string]$Emotion = "",
    [int]$EmotionScale = 0,
    [int]$SpeechRate = 0,
    [int]$PitchRate = 0
)

$ErrorActionPreference = "Stop"

$APPID = $env:VOLC_TTS_APPID
$TOKEN = $env:VOLC_TTS_TOKEN
$RESOURCE = if ($env:VOLC_TTS_RESOURCE) { $env:VOLC_TTS_RESOURCE } else { "seed-icl-2.0" }
$ENDPOINT = "https://openspeech.bytedance.com/api/v3/tts/unidirectional"

if (-not $APPID -or -not $TOKEN -or -not $Speaker) {
    throw "缺少凭证：请设置 VOLC_TTS_APPID / VOLC_TTS_TOKEN / VOLC_TTS_SPEAKER"
}

$dir = Split-Path $Out -Parent
if ($dir) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }

$audioParams = @{ format = "mp3"; sample_rate = $SampleRate }
if ($Emotion) { $audioParams["emotion"] = $Emotion }
if ($EmotionScale -gt 0) { $audioParams["emotion_scale"] = $EmotionScale }
if ($SpeechRate -ne 0) { $audioParams["speech_rate"] = $SpeechRate }
if ($PitchRate -ne 0) { $audioParams["pitch_rate"] = $PitchRate }

$body = @{
    user       = @{ uid = "yusheng" }
    req_params = @{ text = $Text; speaker = $Speaker; audio_params = $audioParams }
} | ConvertTo-Json -Depth 8 -Compress

$reqFile = [System.IO.Path]::GetTempFileName()
$resFile = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($reqFile, $body, (New-Object System.Text.UTF8Encoding($false)))

try {
    & curl.exe -s --max-time 90 -X POST $ENDPOINT `
        -H "Content-Type: application/json" `
        -H "X-Api-App-Key: $APPID" `
        -H "X-Api-Access-Key: $TOKEN" `
        -H "X-Api-Request-Id: $([guid]::NewGuid().ToString())" `
        -H "X-Api-Resource-Id: $RESOURCE" `
        --data-binary "@$reqFile" -o $resFile

    $lines = [System.IO.File]::ReadAllLines($resFile, [System.Text.Encoding]::UTF8)
    $ms = New-Object System.IO.MemoryStream
    $code = $null
    $msg = ""
    foreach ($line in $lines) {
        $l = $line.Trim()
        if (-not $l) { continue }
        try { $o = $l | ConvertFrom-Json } catch { continue }
        if ($null -ne $o.code -and $o.code -ne 0 -and $o.code -ne 20000000) {
            $code = $o.code; $msg = $o.message
        }
        if ($o.data) {
            $b = [Convert]::FromBase64String([string]$o.data)
            $ms.Write($b, 0, $b.Length)
        }
    }
    if ($code) { throw "TTS 失败: code=$code $msg" }
    if ($ms.Length -lt 1000) { throw "TTS 返回音频过短（$($ms.Length) 字节）" }
    [System.IO.File]::WriteAllBytes($Out, $ms.ToArray())
    $ms.Dispose()
    "OK $Out  " + [math]::Round((Get-Item $Out).Length / 1KB, 1) + " KB"
}
finally {
    Remove-Item $reqFile, $resFile -Force -ErrorAction SilentlyContinue
}
