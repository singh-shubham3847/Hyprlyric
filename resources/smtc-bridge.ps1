<#
  Hyprlyric media bridge.

  Reads Windows' media sessions (System Media Transport Controls) and prints one
  JSON object per line on stdout:
    {"type":"hello","ps":"5.1…"}
    {"type":"sessions","t":<epoch ms>,"current":"<app id>|null","sessions":[…]}
    {"type":"art","key":"<app|title|artist|album>","mime":"image/jpeg","data":"<base64>"}
    {"type":"error","message":"…"}

  Must run under Windows PowerShell 5.1: PowerShell 7 cannot load WinRT types.
#>
param(
  [int]$ParentPid = 0,
  [int]$IntervalMs = 250
)

$ErrorActionPreference = 'Stop'

# Write UTF-8 straight to the raw stdout stream so non-English titles survive,
# whatever the console code page is.
$script:Out = New-Object System.IO.StreamWriter([Console]::OpenStandardOutput(), (New-Object System.Text.UTF8Encoding($false)))
$script:Out.AutoFlush = $true

function Emit($obj) {
  $json = ConvertTo-Json -InputObject $obj -Compress -Depth 6
  try {
    $script:Out.WriteLine($json)
  } catch {
    exit 0 # The parent closed the pipe.
  }
}

try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
  $null = [Windows.Storage.Streams.IInputStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
  $null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
} catch {
  Emit @{ type = 'error'; message = "WinRT is unavailable: $($_.Exception.Message)" }
  exit 3
}

$script:AsTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]

$script:AsStreamForRead = [System.IO.WindowsRuntimeStreamExtensions].GetMethod('AsStreamForRead', [Type[]]@([Windows.Storage.Streams.IInputStream]))

function Await($operation, [Type]$resultType, [int]$timeoutMs = 3000) {
  $task = $script:AsTask.MakeGenericMethod($resultType).Invoke($null, @($operation))
  if (-not $task.Wait($timeoutMs)) { throw 'WinRT call timed out' }
  return $task.Result
}

function UnixMs($value) {
  try { return ([DateTimeOffset]$value).ToUnixTimeMilliseconds() } catch { return 0 }
}

function Read-Art($thumbnail) {
  if ($null -eq $thumbnail) { return $null }
  $stream = Await ($thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
  if ($null -eq $stream) { return $null }
  try {
    $netStream = $script:AsStreamForRead.Invoke($null, @($stream))
    if ($null -eq $netStream) { return $null }
    try {
      if ($netStream.Length -le 0 -or $netStream.Length -gt 8MB) { return $null }
      $ms = New-Object System.IO.MemoryStream
      try {
        $netStream.CopyTo($ms)
        $bytes = $ms.ToArray()
        $mime = 'image/jpeg'
        if ($bytes.Length -ge 4 -and $bytes[0] -eq 0x89 -and $bytes[1] -eq 0x50) { $mime = 'image/png' }
        return @{ mime = $mime; bytes = $bytes }
      } finally {
        $ms.Dispose()
      }
    } finally {
      $netStream.Dispose()
    }
  } finally {
    try { $stream.Dispose() } catch { }
  }
}

$script:Sha1 = New-Object System.Security.Cryptography.SHA1Managed
function HashOf([byte[]]$bytes) { return [BitConverter]::ToString($script:Sha1.ComputeHash($bytes)) }

$managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
$propsType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
try {
  $manager = Await ($managerType::RequestAsync()) $managerType 10000
} catch {
  Emit @{ type = 'error'; message = "Media session manager is unavailable: $($_.Exception.Message)" }
  exit 4
}

Emit @{ type = 'hello'; ps = "$($PSVersionTable.PSVersion)" }

# Album art per track key: read shortly after a track appears (players often publish
# the picture a moment after the title), then once more to catch late updates.
$artState = @{}
$tick = 0
$lastJson = ''
$lastEmit = [DateTime]::MinValue
$lastError = [DateTime]::MinValue

while ($true) {
  $tick++
  try {
    if ($ParentPid -gt 0 -and ($tick % 8) -eq 0) {
      try { $null = [System.Diagnostics.Process]::GetProcessById($ParentPid) } catch { exit 0 }
    }

    $current = $null
    try {
      $currentSession = $manager.GetCurrentSession()
      if ($null -ne $currentSession) { $current = [string]$currentSession.SourceAppUserModelId }
    } catch { }

    $list = New-Object System.Collections.ArrayList
    foreach ($session in $manager.GetSessions()) {
      try {
        $props = Await ($session.TryGetMediaPropertiesAsync()) $propsType 2000
        $timeline = $session.GetTimelineProperties()
        $playback = $session.GetPlaybackInfo()
        $app = [string]$session.SourceAppUserModelId
        $title = [string]$props.Title
        $artist = [string]$props.Artist
        $album = [string]$props.AlbumTitle
        $status = [string]$playback.PlaybackStatus
        $rate = 1.0
        if ($null -ne $playback.PlaybackRate) { $rate = [double]$playback.PlaybackRate }

        $null = $list.Add([ordered]@{
            app     = $app
            status  = $status
            title   = $title
            artist  = $artist
            album   = $album
            pos     = [math]::Round($timeline.Position.TotalSeconds, 3)
            start   = [math]::Round($timeline.StartTime.TotalSeconds, 3)
            end     = [math]::Round($timeline.EndTime.TotalSeconds, 3)
            updated = (UnixMs $timeline.LastUpdatedTime)
            rate    = $rate
          })

        $key = "$app|$title|$artist|$album"
        $state = $artState[$key]
        if ($null -eq $state) {
          $state = @{ first = $tick; seen = $tick; hash = ''; done = $false }
          $artState[$key] = $state
        }
        $state.seen = $tick
        $age = $tick - $state.first
        if ($age -ge 2 -and $age -le 40 -and ($age % 4) -eq 2 -and ((-not $state.done) -or $age -eq 10)) {
          try {
            $art = Read-Art $props.Thumbnail
            if ($null -ne $art) {
              $hash = HashOf $art.bytes
              if ($hash -ne $state.hash) {
                $state.hash = $hash
                Emit ([ordered]@{ type = 'art'; key = $key; mime = $art.mime; data = [Convert]::ToBase64String($art.bytes) })
              }
              $state.done = $true
            }
          } catch { }
        }
      } catch {
        # A session can disappear while it is being read; skip it this round.
      }
    }

    if (($tick % 400) -eq 0) {
      foreach ($k in @($artState.Keys)) { if ($tick - $artState[$k].seen -gt 400) { $artState.Remove($k) } }
    }

    $snapshot = [ordered]@{ type = 'sessions'; current = $current; sessions = @($list.ToArray()) }
    $json = ConvertTo-Json -InputObject $snapshot -Compress -Depth 6
    $now = [DateTime]::UtcNow
    if ($json -ne $lastJson -or ($now - $lastEmit).TotalMilliseconds -ge 2000) {
      $lastJson = $json
      $lastEmit = $now
      $snapshot['t'] = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
      Emit $snapshot
    }
  } catch {
    if (([DateTime]::UtcNow - $lastError).TotalSeconds -ge 5) {
      $lastError = [DateTime]::UtcNow
      Emit @{ type = 'error'; message = [string]$_.Exception.Message }
    }
  }
  Start-Sleep -Milliseconds $IntervalMs
}
