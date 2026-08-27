# Koko MotoWash - Android Emulator Launcher Script

$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
$env:ANDROID_HOME = $sdk
$env:PATH = "$sdk\emulator;$sdk\platform-tools;$sdk\tools;$env:PATH"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "        Koko MotoWash - Android Emulator Launcher        " -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

$adb = "$sdk\platform-tools\adb.exe"
$devices = & $adb devices | Select-String "device$"

if (-not $devices) {
    Write-Host "[1/2] Membuka Android Emulator..." -ForegroundColor Yellow
    
    $avdList = & "$sdk\emulator\emulator.exe" -list-avds
    $avdToRun = if ($avdList) { $avdList[0] } else { "Medium_Phone_API_36.1" }

    Write-Host "Menjalankan AVD: $avdToRun..." -ForegroundColor Green
    Start-Process -FilePath "$sdk\emulator\emulator.exe" -ArgumentList "-avd $avdToRun" -WorkingDirectory "$sdk\emulator"
    
    Write-Host "Menunggu emulator siap..." -ForegroundColor Yellow
    $retries = 0
    while ($retries -lt 20) {
        Start-Sleep -Seconds 2
        $devices = & $adb devices | Select-String "device$"
        if ($devices) {
            break
        }
        $retries++
        Write-Host "." -NoNewline -ForegroundColor Gray
    }
    Write-Host ""
    if ($devices) {
        Write-Host "Emulator terhubung!" -ForegroundColor Green
    } else {
        Write-Host "Membuka aplikasi via Expo..." -ForegroundColor Yellow
    }
} else {
    Write-Host "[1/2] Emulator sudah terdeteksi dan berjalan." -ForegroundColor Green
}

Write-Host ""
Write-Host "[2/2] Membuka Koko MotoWash di Expo..." -ForegroundColor Cyan
Set-Location -Path "$PSScriptRoot\.."
npx expo start --android
