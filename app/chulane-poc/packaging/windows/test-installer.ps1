# Exercise the per-user NSIS package on a clean Windows account. The app tests own their temporary profiles.
param([Parameter(Mandatory=$true, Position=0)][string]$Installer)
$ErrorActionPreference = 'Stop'
$setup = (Resolve-Path -LiteralPath $Installer).Path
$directory = Join-Path $env:LOCALAPPDATA 'Programs\Chulane'
$shortcut = Join-Path ([Environment]::GetFolderPath('Programs')) 'Chulane.lnk'
$uninstaller = Join-Path $directory 'Uninstall.exe'
$executable = Join-Path $directory 'runtime\Chulane.exe'
# NSIS writes the uninstall entry using its default 32-bit registry view on x64 Windows.
$registry = [Microsoft.Win32.RegistryKey]::OpenBaseKey('CurrentUser','Registry32')
$keyName = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\Chulane'
function Read-Registration {
    $key = $registry.OpenSubKey($keyName)
    if ($key) {
        try { return $key.GetValue('UninstallString', '') }
        finally { $key.Dispose() }
    }
}

if ((Test-Path -LiteralPath $directory) -or (Test-Path -LiteralPath $shortcut) -or ($null -ne (Read-Registration))) {
    throw 'This test installs and uninstalls Chulane. Run it in a clean Windows user account.'
}

try {
    $process = Start-Process -FilePath $setup -ArgumentList '/S' -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "Installation failed with exit code $($process.ExitCode)." }
    if ((Read-Registration) -ne ('"' + $uninstaller + '"')) { throw 'Installed apps entry has the wrong uninstall command.' }
    if (!(Test-Path -LiteralPath $shortcut)) { throw 'Start menu shortcut missing.' }
    $launcher = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcut).TargetPath
    if ($launcher -ne $executable) { throw "Unexpected Start menu target: $launcher" }
    & node (Join-Path $PSScriptRoot '..\test-installed.mjs') $launcher
    if ($LASTEXITCODE -ne 0) { throw "Installed desktop tests failed with exit code $LASTEXITCODE." }
} finally {
    if (Test-Path -LiteralPath $uninstaller) {
        $process = Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait -PassThru
        if ($process.ExitCode -ne 0) { throw "Uninstall failed with exit code $($process.ExitCode)." }
    }
    $registered = Read-Registration
    $registry.Dispose()
    if ((Test-Path -LiteralPath $directory) -or (Test-Path -LiteralPath $shortcut) -or ($null -ne $registered)) {
        throw 'Uninstall left the runtime, Start menu shortcut, or Installed apps entry behind.'
    }
}
Write-Output 'Installed desktop passed edit and restart checks. Uninstall removed the application and its registrations.'
