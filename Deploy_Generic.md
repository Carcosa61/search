# Website Deployment Guide

This document describes the principles and process for deploying a web application to a search server, and how to push subsequent code changes. It is based on the PowerShell deployment script used in this project and is intended to be adapted for other projects following the same pattern.

---

## Overview

The deployment model consists of four sequential stages:

1. **Git commit & push** — record changes in source control and sync to GitHub
2. **Package** — assemble only the files the server needs into a `tar.gz` archive
3. **Upload** — transfer the archive to the server via SCP through a Cloudflare tunnel
4. **Remote deploy** — extract on the server, copy files into place, fix ownership, restart the web service

The server is accessed via a Cloudflare Access SSH tunnel rather than a direct public SSH port.

---

## Connection Details

| Setting    | Value                    |
|------------|--------------------------|
| SSH host   | `ssh.562196621.xyz`      |
| SSH user   | `carcosa`                |
| Tunnel     | Cloudflare Access (`cloudflared`) |

All SSH and SCP commands use `cloudflared` as a proxy:

```
-o ProxyCommand=cloudflared access ssh --hostname %h
```

This means `cloudflared` must be installed and authenticated on the machine running the deployment script.

The website will be search.562196621.xyz
and at www-data /var/www/search

---

## Prerequisites (developer machine)

- **Windows 10/11** (the script uses PowerShell and the built-in `tar`)
- **Git** installed and authenticated with GitHub
- **cloudflared** installed and authenticated:  
  `cloudflared access login https://ssh.562196621.xyz`
- **SSH / SCP** available in PATH (built-in on Windows 10+)

---

## Stage 1 — Git Commit & Push

Before packaging, the script checks for uncommitted changes:

```powershell
git status --short
```

If changes exist and a commit message was supplied (or entered interactively), it stages everything and commits:

```powershell
git add -A
git commit -m "<message>"
git push origin main
```

**Key principles:**
- Always commit before deploying so that what is on the server matches a known Git state.
- Use `-SkipGit` only when you deliberately want to deploy files that are not yet committed (e.g. a hotfix being tested in-place).
- The `main` branch is the production branch. Do not deploy from a feature branch without intent.

---

## Stage 2 — Packaging

A staging directory is created in `%TEMP%`, the required files are copied into it, and it is compressed into a `tar.gz`:

```powershell
tar -czf $TarFile .
```

**What to include:**

| Include | Why |
|---------|-----|
| `app/` folder (all application code) | Core application — always deploy |
| Selected config JSON files | Shared configuration that should be kept in sync with the repo |

**What to exclude:**
- Files that hold **server-side state** (e.g. processed data files, user-generated content, runtime caches). These exist only on the server and must not be overwritten by a deploy.
- Virtual environment (`.venv/`), `__pycache__`, logs, test fixtures, and anything in `.gitignore`.

This selective packaging is intentional — the server may hold data files that are continuously updated at runtime, and a blanket deploy would destroy that state.

---

## Stage 3 — Upload via SCP

The archive is uploaded to the server's `/tmp` directory:

```powershell
scp -o "ProxyCommand=cloudflared access ssh --hostname %h" `
    $TarFile `
    carcosa@ssh.562196621.xyz:/tmp/searchpage_deploy.tar.gz
```

The local archive is deleted immediately after upload to avoid leaving sensitive packages on the developer machine.

---

## Stage 4 — Remote Deployment

A small bash script is written locally (with **LF line endings** — critical when authoring on Windows), uploaded to the server, and then executed over SSH:

```bash
#!/bin/bash
set -e
# 1. Extract archive
rm -rf /tmp/searchextract && mkdir -p /tmp/searchextract
tar -xzf /tmp/searchpage_deploy.tar.gz -C /tmp/searchextract

# 2. Copy app code
sudo cp -r /tmp/searchextract/app /var/www/searchpage/

# 3. Copy config files
for f in /tmp/searchextract/*.json; do
    [ -f "$f" ] && sudo cp "$f" /var/www/searchpage/
done

# 4. Fix file ownership (web server must own the files)
sudo chown -R www-data:www-data /var/www/searchpage/app
sudo chown www-data:www-data /var/www/searchpage/*.json 2>/dev/null || true

# 5. Clean up temp files
rm -rf /tmp/searchextract /tmp/searchpage_deploy.tar.gz

# 6. Restart web service
sudo systemctl restart apache2
```

The script self-deletes on the server after execution.

**Key principles:**
- `set -e` ensures the script aborts on the first error; a partial deploy is worse than no deploy.
- Files are placed in `/tmp` first, then copied to the live directory — this minimises the window during which the site is in a broken state.
- `www-data:www-data` is the standard Apache user/group. If using Nginx or another server, adjust accordingly.
- The remote script is generated with LF line endings using `[System.IO.File]::WriteAllText(...)`. Never rely on PowerShell's default output redirection, which writes CRLF and causes bash parse errors.

---

## Adapting This for a New Project

To reuse this pattern for a different project, change the following variables at the top of the deploy script:

```powershell
$SSH_HOST   = "ssh.562196621.xyz"   # Cloudflare tunnel hostname
$SSH_USER   = "carcosa"             # Server login user
$REMOTE_DIR = "/var/www/searchpage" # Deployment directory on server
$REMOTE_TMP = "/tmp/searchpage_deploy.tar.gz"
```

Then update:
1. The list of files/folders to include in the package (Stage 2).
2. The paths used in the remote bash script (Stage 4).
3. The service name in `systemctl restart <service>` if not using Apache.

---

## Subsequent Deployments (Pushing Changes)

For every subsequent change after the initial deployment, the same script is run from the repo root:

```powershell
# With automatic commit prompt:
.\deploy\deploy.ps1

# With a pre-supplied commit message:
.\deploy\deploy.ps1 -Message "Fix typo in report header"

# Deploy without committing (emergency hotfix):
.\deploy\deploy.ps1 -SkipGit
```

The script is idempotent — running it multiple times with the same content is safe. Files are overwritten in place, and the service is restarted regardless.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `scp` hangs or times out | `cloudflared` not authenticated | Run `cloudflared access login https://ssh.562196621.xyz` |
| `bash: unexpected token` on server | CRLF line endings in remote script | Ensure script is written with `[System.IO.File]::WriteAllText` and LF-only joins |
| `Permission denied` copying files | Wrong `sudo` configuration | Ensure `carcosa` has passwordless `sudo` for `cp`, `chown`, `systemctl` on the server |
| Site shows old content after deploy | Browser cache | Hard-refresh (`Ctrl+Shift+R`); confirm `apache2` restarted cleanly |
| JSON config reverted on server | Config file included in package | Move state-only files out of the `$configFiles` list in the script |
