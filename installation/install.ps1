param($Env = "prd", $InstallPath = (Get-Location))
$ErrorActionPreference = "Stop"

$zipFileName = "provendb-sqlserver-windows.zip"
$downloadLink = "https://storage.googleapis.com/provendb-prd/provendb-sqlserver/$zipFileName"
$zipFilePath = Join-Path -Path $InstallPath -ChildPath $zipFileName

Write-Host "Installing from ``$zipFileName`` to ``$InstallPath``..."
(New-Object Net.WebClient).DownloadFile($downloadLink, $zipFilePath)
Expand-Archive -Path $zipFilePath -DestinationPath $InstallPath -Force
Remove-Item -Path $zipFilePath