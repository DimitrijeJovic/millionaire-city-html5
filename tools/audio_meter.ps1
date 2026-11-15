# Samples the output peak level of the Windows audio sessions owned by one browser instance (Core Audio, read-only).
# The browser is identified by its --user-data-dir, so other browser windows on the machine are not measured.
# Usage: audio_meter.ps1 -Profile <user-data-dir> -Seconds 300 -IntervalMs 20 -Out file.csv
param([string]$Profile, [string]$StopFile = "", [double]$Seconds = 5, [int]$IntervalMs = 20, [string]$Out = "")
Add-Type -TypeDefinition @"
using System; using System.Collections.Generic; using System.Runtime.InteropServices;
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCo {}
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int NotImpl1(); [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice dev); }
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { [PreserveSig] int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o); }
[Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionManager2 { int NotImpl1(); int NotImpl2(); [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator e); }
[Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionEnumerator { [PreserveSig] int GetCount(out int n); [PreserveSig] int GetSession(int i, out IAudioSessionControl2 s); }
[Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioSessionControl2 { int a(); int b(); int c(); int d(); int e(); int f(); int g(); int h(); int i(); int j(); int k();
  [PreserveSig] int GetProcessId(out uint pid); }
[Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioMeterInformation { [PreserveSig] int GetPeakValue(out float v); }
public static class Meter {
  public static List<object[]> Sessions() {
    var en = (IMMDeviceEnumerator)(new MMDeviceEnumeratorCo()); IMMDevice dev; en.GetDefaultAudioEndpoint(0, 1, out dev);
    Guid iid = typeof(IAudioSessionManager2).GUID; object o; dev.Activate(ref iid, 23, IntPtr.Zero, out o);
    var mgr = (IAudioSessionManager2)o; IAudioSessionEnumerator se; mgr.GetSessionEnumerator(out se); int n; se.GetCount(out n);
    var r = new List<object[]>();
    for (int i = 0; i < n; i++) { IAudioSessionControl2 s; se.GetSession(i, out s); uint pid; s.GetProcessId(out pid); r.Add(new object[] { pid, (IAudioMeterInformation)s }); }
    return r; }
  public static float Peak(object m) { float v; ((IAudioMeterInformation)m).GetPeakValue(out v); return v; }
}
"@
function Get-Pids { @(Get-CimInstance Win32_Process -Filter "Name='chrome.exe' OR Name='msedge.exe'" | Where-Object { $_.CommandLine -like "*$Profile*" } | ForEach-Object { [int]$_.ProcessId }) }
$rows = New-Object System.Collections.Generic.List[string]; $rows.Add("epoch_ms,peak,sessions")
$sw = [Diagnostics.Stopwatch]::StartNew(); $max = 0.0; $loud = 0; $n = 0; $nextScan = 0; $sessions = @()
while ($sw.Elapsed.TotalSeconds -lt $Seconds -and -not ($StopFile -and (Test-Path $StopFile))) {
  if ($sw.ElapsedMilliseconds -ge $nextScan) {
    $pids = Get-Pids
    $sessions = @([Meter]::Sessions() | Where-Object { $pids -contains [int]$_[0] })
    $nextScan = $sw.ElapsedMilliseconds + 1000
  }
  $p = 0.0; foreach ($s in $sessions) { $v = [Meter]::Peak($s[1]); if ($v -gt $p) { $p = $v } }
  $rows.Add(("{0},{1:0.0000},{2}" -f [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(), $p, $sessions.Count)); $n++; if ($p -gt $max) { $max = $p }; if ($p -gt 0.01) { $loud++ }
  if ($Out -and ($n % 250 -eq 0)) { $rows | Set-Content -Encoding ascii $Out }
  Start-Sleep -Milliseconds $IntervalMs
}
if ($Out) { $rows | Set-Content -Encoding ascii $Out }
"samples=$n max_peak=$([math]::Round($max,4)) samples_above_0.01=$loud"
