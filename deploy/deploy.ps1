<#
.SYNOPSIS
    Deploy the Intelligent Monitor app to the home server via Cloudflare tunnel.

.PARAMETER Message
    Git commit message. If omitted you will be prompted interactively.

.PARAMETER SkipGit
    Skip the git commit/push stage (emergency hotfix mode).

.EXAMPLE
    .\deploy\deploy.ps1 -Message "Add regulatory alerts"
    .\deploy\deploy.ps1 -SkipGit
#>
param(
    [string] $Message = "",
    [switch] $SkipGit
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ─── Configuration ────────────────────────────────────────────────────────────
$SSH_HOST   = "ssh.562196621.xyz"
$SSH_USER   = "carcosa"
$REMOTE_DIR = "/var/www/weinstein"
$REMOTE_TMP = "/tmp/weinstein_deploy.tar.gz"
$PROXY_CMD  = "cloudflared access ssh --hostname %h"

# Files/folders to include in the package
$APP_FOLDER   = "app"                        # Python backend
$FRONTEND_DIR = "frontend"                   # Next.js frontend (built files shipped separately — see note)
$EXTRA_FILES  = @(                           # top-level config files to deploy
    "docker-compose.yml",
    ".env.example",
    "Dockerfile.backend",
    "Dockerfile.frontend",
    "apache"
)

# ─── Helpers ──────────────────────────────────────────────────────────────────
function Write-Step([string]$msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Invoke-Cmd {
    param([string]$exe)
    $rest = $args  # remaining positional args
    & $exe @rest
    if ($LASTEXITCODE -ne 0) { throw "Command '$exe' failed with exit code $LASTEXITCODE" }
}

# ─── Stage 1: Git ─────────────────────────────────────────────────────────────
if (-not $SkipGit) {
    Write-Step "Stage 1 - Git commit and push"

    $status = git status --short
    if ($status) {
        if (-not $Message) {
            $Message = Read-Host "Commit message"
        }
        if (-not $Message) { throw "Commit message required." }

        Invoke-Cmd git add -A
        Invoke-Cmd git commit -m $Message
        Invoke-Cmd git push origin main
        Write-Host "  Pushed to origin/main." -ForegroundColor Green
    } else {
        Write-Host "  Nothing to commit." -ForegroundColor Yellow
    }
} else {
    Write-Host "`n[!] Skipping git stage." -ForegroundColor Yellow
}

# ─── Stage 2: Package ─────────────────────────────────────────────────────────
Write-Step "Stage 2 - Packaging"

$StagingDir = Join-Path $env:TEMP "weinstein_staging_$(Get-Random)"
$TarFile    = Join-Path $env:TEMP "weinstein_deploy.tar.gz"

New-Item -ItemType Directory -Path $StagingDir | Out-Null

# Copy app folder
Copy-Item -Recurse -Path $APP_FOLDER -Destination (Join-Path $StagingDir "app")

# Copy frontend (pre-built .next/standalone if present, otherwise raw source)
$builtFrontend = Join-Path $FRONTEND_DIR ".next\standalone"
if (Test-Path $builtFrontend) {
    Copy-Item -Recurse -Path $builtFrontend -Destination (Join-Path $StagingDir "frontend")
    Copy-Item -Recurse -Path (Join-Path $FRONTEND_DIR ".next\static") `
              -Destination (Join-Path $StagingDir "frontend\.next\static")
} else {
    Copy-Item -Recurse -Path $FRONTEND_DIR -Destination (Join-Path $StagingDir "frontend")
}

# Copy extra top-level files/folders
foreach ($item in $EXTRA_FILES) {
    if (Test-Path $item) {
        Copy-Item -Recurse -Path $item -Destination $StagingDir
    }
}

Push-Location $StagingDir
try {
    tar -czf $TarFile .
    Write-Host "  Archive: $TarFile" -ForegroundColor Green
} finally {
    Pop-Location
    Remove-Item -Recurse -Force $StagingDir
}

# ─── Stage 3: Upload ──────────────────────────────────────────────────────────
Write-Step "Stage 3 - Upload via SCP"

scp -o "ProxyCommand=$PROXY_CMD" $TarFile "${SSH_USER}@${SSH_HOST}:$REMOTE_TMP"
if ($LASTEXITCODE -ne 0) { Remove-Item -Force $TarFile; throw "SCP upload failed." }

Remove-Item -Force $TarFile
Write-Host "  Uploaded and local archive deleted." -ForegroundColor Green

# ─── Stage 4: Remote deploy ───────────────────────────────────────────────────
Write-Step "Stage 4 - Remote deploy"

$EXTRACT_TMP = "/tmp/weinstein_extract"

$remoteBash = @"
#!/bin/bash
set -e

# 1. Extract
rm -rf $EXTRACT_TMP && mkdir -p $EXTRACT_TMP
tar -xzf $REMOTE_TMP -C $EXTRACT_TMP

# 2. Stop services briefly, copy, restart
sudo systemctl stop docker 2>/dev/null || true

# App code
sudo cp -r $EXTRACT_TMP/app $REMOTE_DIR/
sudo cp -r $EXTRACT_TMP/frontend $REMOTE_DIR/

# Compose + Dockerfiles
for f in $EXTRACT_TMP/docker-compose.yml $EXTRACT_TMP/Dockerfile.*; do
    [ -f "\$f" ] && sudo cp "\$f" $REMOTE_DIR/
done

# Apache config
if [ -d "$EXTRACT_TMP/apache" ]; then
    sudo cp $EXTRACT_TMP/apache/*.conf /etc/apache2/sites-available/
    sudo a2ensite weinstein.conf 2>/dev/null || true
fi

# 3. Ownership
sudo chown -R www-data:www-data $REMOTE_DIR

# 4. Cleanup
rm -rf $EXTRACT_TMP $REMOTE_TMP

# 5. Restart services
sudo systemctl restart docker || true
cd $REMOTE_DIR && sudo docker compose up -d --build
sudo systemctl reload apache2

echo "Deploy complete."
"@

# Write with LF line endings — critical on Windows when targeting bash
$scriptPath = Join-Path $env:TEMP "weinstein_remote_deploy.sh"
[System.IO.File]::WriteAllText($scriptPath, $remoteBash.Replace("`r`n", "`n"))

# Upload deploy script
scp -o "ProxyCommand=$PROXY_CMD" $scriptPath "${SSH_USER}@${SSH_HOST}:/tmp/weinstein_remote_deploy.sh"
if ($LASTEXITCODE -ne 0) { throw "Failed to upload remote deploy script." }

Remove-Item -Force $scriptPath

# Execute and self-delete
ssh -o "ProxyCommand=$PROXY_CMD" "${SSH_USER}@${SSH_HOST}" `
    "bash /tmp/weinstein_remote_deploy.sh; rm -f /tmp/weinstein_remote_deploy.sh"
if ($LASTEXITCODE -ne 0) { throw "Remote deploy script failed." }

Write-Host "`n✓ Deployment complete — https://weinstein.562196621.xyz" -ForegroundColor Green
