# 语音侧车：她发出文字后，按场景补一条语音（火山 TTS · 你的复刻音色）
#
# 工作原理：
#   轮询 OneBot 消息历史 → 发现她新发的文字 → 命中场景 → 调 tts.ps1 合成 → 发语音条
#
# 运行前需要：
#   1. SnowLuma 的 OneBot HTTP 在 http://127.0.0.1:3000
#   2. 环境变量 VOLC_TTS_APPID / VOLC_TTS_TOKEN / VOLC_TTS_SPEAKER 已设置
#   3. 把下面几个路径改成你机器上的
#
# 场景参数（可自己调）：
#   撒娇 → happy 5 / 语速 +8 / 音高 +15
#   晚安 → happy 2 / 语速 -4 / 音高 +10
#   关心 → happy 3 / 语速 -2 / 音高 +8
#   开心 → happy 4 / 语速 +6 / 音高 +12

$ErrorActionPreference = 'Continue'
$logFile = "E:\QQ-Bot\voice-sidecar.log"
function Log($m) { Add-Content -Path $logFile -Value ("[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $m) -Encoding UTF8 }

$root = "E:\QQ-Bot"
$cfgPath = "$root\qq-bridge\config.json"
$statePath = "$root\voice-sidecar-state.json"
$ttsScript = "$root\tts\tts.ps1"
$outDir = "$root\tts-out"

# 改成你自己的：机器人小号 / 你的 QQ / 群号
$BOT_UIN = [int64]($env:YUSHENG_BOT_QQ)     # 例：123456789
$PRIVATE = [int64]($env:YUSHENG_OWNER_QQ)   # 例：987654321
$GROUP   = [int64]($env:YUSHENG_GROUP_ID)   # 例：123456
if (-not $BOT_UIN -or -not $PRIVATE) {
    throw "请先设置环境变量 YUSHENG_BOT_QQ / YUSHENG_OWNER_QQ / YUSHENG_GROUP_ID"
}

$state = @{ seen = @{}; lastVoiceAt = @{} }
if (Test-Path $statePath) {
    try {
        $j = Get-Content $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($j.seen) { foreach ($p in $j.seen.PSObject.Properties) { $state.seen[$p.Name] = $p.Value } }
        if ($j.lastVoiceAt) { foreach ($p in $j.lastVoiceAt.PSObject.Properties) { $state.lastVoiceAt[$p.Name] = [int64]$p.Value } }
    } catch {}
}
function Save-State {
    $json = @{ seen = $state.seen; lastVoiceAt = $state.lastVoiceAt } | ConvertTo-Json -Depth 5 -Compress
    [System.IO.File]::WriteAllText($statePath, $json, (New-Object System.Text.UTF8Encoding($false)))
}

function Get-Scene($text) {
    $t = $text.Trim()
    if ($t.Length -gt 26) { return $null }
    if ($t -match "[（）()\[\]【】「」《》<>:：]") { return $null }
    if ($t -match "^(晚安|睡啦|我睡了|去睡了|早点睡|睡觉了)[!！。~～\s]*$") { return @{ name = "晚安"; emotion = "happy"; scale = 2; rate = -4; pitch = 10 } }
    if ($t -match "(哼|嘛|好不好|不嘛|想你|抱抱|亲一下|不理你)" -and $t.Length -le 22) { return @{ name = "撒娇"; emotion = "happy"; scale = 5; rate = 8; pitch = 15 } }
    if ($t -match "(记得|别忘了).{0,6}(吃饭|喝水|睡|休息)" -or ($t -match "吃饭了没|喝水了没")) { return @{ name = "关心"; emotion = "happy"; scale = 3; rate = -2; pitch = 8 } }
    if ($t -match "^(哈哈|嘿嘿|好耶|太棒了|笑死)" -and $t.Length -le 18) { return @{ name = "开心"; emotion = "happy"; scale = 4; rate = 6; pitch = 12 } }
    return $null
}

function Get-TextOf($msg) {
    $t = ""
    foreach ($seg in $msg.message) { if ($seg.type -eq "text" -and $seg.data.text) { $t += [string]$seg.data.text } }
    return $t.Trim()
}

Log "===== 语音侧车启动 ====="

if ($state.seen.Count -eq 0) {
    Log "首次运行：预热已有消息…"
    try {
        $cfg0 = Get-Content $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $h0 = @{ Authorization = "Bearer " + $cfg0.snowluma.accessToken }
        foreach ($t0 in @(@{api="get_friend_msg_history";f="user_id";v=$PRIVATE}, @{api="get_group_msg_history";f="group_id";v=$GROUP})) {
            $b0 = @{ $t0.f = $t0.v; count = 10 } | ConvertTo-Json -Compress
            try {
                $r0 = Invoke-RestMethod -Uri ("http://127.0.0.1:3000/" + $t0.api) -Method Post -Headers $h0 -Body ([System.Text.Encoding]::UTF8.GetBytes($b0)) -ContentType "application/json; charset=utf-8" -TimeoutSec 15
                foreach ($m0 in $r0.data.messages) { if ($m0.message_id) { $state.seen[[string]$m0.message_id] = 1 } }
            } catch {}
        }
        Save-State
        Log ("预热完成，已标记 " + $state.seen.Count + " 条历史消息")
    } catch { Log "预热失败: $($_.Exception.Message)" }
}

while ($true) {
    try {
        $cfg = Get-Content $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $httpTok = $cfg.snowluma.accessToken
        $headers = @{ Authorization = "Bearer $httpTok" }
        $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

        $targets = @(
            @{ id = "private"; api = "get_friend_msg_history"; field = "user_id"; value = $PRIVATE; send = "send_private_msg"; sendField = "user_id" },
            @{ id = "group"; api = "get_group_msg_history"; field = "group_id"; value = $GROUP; send = "send_group_msg"; sendField = "group_id" }
        )

        foreach ($tg in $targets) {
            $key = "$($tg.id):$($tg.value)"
            $body = @{ $tg.field = $tg.value; count = 10 } | ConvertTo-Json -Compress
            $r = $null
            try {
                $r = Invoke-RestMethod -Uri ("http://127.0.0.1:3000/" + $tg.api) -Method Post -Headers $headers -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) -ContentType "application/json; charset=utf-8" -TimeoutSec 15
            } catch { continue }
            if (-not $r -or $r.status -ne "ok" -or -not $r.data.messages) { continue }

            foreach ($m in $r.data.messages) {
                $mid = [string]$m.message_id
                if (-not $mid) { continue }
                if ($state.seen[$mid]) { continue }
                if ([int64]$m.sender.user_id -ne $BOT_UIN) { $state.seen[$mid] = 1; continue }

                $text = Get-TextOf $m
                if (-not $text -or $text.Length -gt 60) { $state.seen[$mid] = 1; continue }

                $scene = Get-Scene $text
                if (-not $scene) { $state.seen[$mid] = 1; continue }

                $voiceLast = [int64]($state.lastVoiceAt[$key])
                if ($now - $voiceLast -lt 90000) { $state.seen[$mid] = 1; continue }

                # 标点增强：同一句话，标点不同，起伏差别很大
                $text = $text.Trim()
                switch ($scene.name) {
                    "晚安" { if ($text -notmatch "[～~！!？?]$") { $text = $text + "～" } }
                    "撒娇" { if ($text -notmatch "[～~！!？?]$") { $text = $text + "！" } }
                    "开心" { if ($text -notmatch "[～~！!？?]$") { $text = $text + "！" } }
                    "关心" { if ($text -notmatch "[～~！!？?。]$") { $text = $text + "。" } }
                }

                $mp3 = "$outDir\live-$($scene.name)-$mid.mp3"
                $ok = $false
                try {
                    $argList = @('-NoProfile','-ExecutionPolicy','Bypass','-File', $ttsScript,
                                 '-Text', $text, '-Out', $mp3, '-Emotion', $scene.emotion,
                                 '-EmotionScale', [string]$scene.scale, '-SpeechRate', [string]$scene.rate,
                                 '-PitchRate', [string]$scene.pitch)
                    $tp = Start-Process -FilePath 'powershell.exe' -ArgumentList $argList -WindowStyle Hidden -PassThru
                    $tp.WaitForExit(60000) | Out-Null
                    $ok = (Test-Path $mp3) -and ((Get-Item $mp3).Length -gt 3000)
                } catch { Log "TTS 失败: $($_.Exception.Message)" }

                if ($ok) {
                    $file = $mp3.Replace("\", "/")
                    $sb = @{ $tg.sendField = [int64]$tg.value; message = @(@{ type = "record"; data = @{ file = $file } }) } | ConvertTo-Json -Depth 6 -Compress
                    $null = Invoke-RestMethod -Uri ("http://127.0.0.1:3000/" + $tg.send) -Method Post -Headers $headers -Body ([System.Text.Encoding]::UTF8.GetBytes($sb)) -ContentType "application/json; charset=utf-8" -TimeoutSec 30
                    $state.lastVoiceAt[$key] = $now
                    Log "已发语音 [$($scene.name)] $key : $text"
                }
                $state.seen[$mid] = 1
            }
        }

        if ($state.seen.Count -gt 200) {
            $keep = $state.seen.Keys | Select-Object -Last 200
            $newSeen = @{}
            foreach ($k in $keep) { $newSeen[$k] = 1 }
            $state.seen = $newSeen
        }
        Save-State
    } catch {
        Log "轮询异常: $($_.Exception.Message)"
    }
    Start-Sleep -Seconds 4
}
