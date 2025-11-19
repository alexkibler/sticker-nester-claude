# Deployment Guide: GitHub Actions → ghcr.io → Home Server

This guide walks you through setting up automated CI/CD from GitHub to your Mac Mini home server.

## Architecture Overview

```
GitHub Push (main)          →  Build Image  →  ghcr.io:latest  →  Watchtower  →  mosaic (prod)
                                                                                   ↓
                                                                    mosaic.alexkibler.com:8084

GitHub Push (claude/*)      →  Build Image  →  ghcr.io:dev     →  Watchtower  →  mosaic-dev
                                                                                   ↓
                                                                    mosaic-dev.alexkibler.com:8085
```

**Deployment Strategy:**
- **Production**: Pushes to `main` → builds `:latest` tag → updates `mosaic` container → mosaic.alexkibler.com
- **Development**: Pushes to `claude/*` branches → builds `:dev` tag → updates `mosaic-dev` container → mosaic-dev.alexkibler.com
- **Watchtower**: Polls ghcr.io every 5 minutes, auto-pulls new images, restarts containers

---

## Part 1: GitHub Repository Setup

### Step 1: Make Container Registry Images Public

By default, GitHub Container Registry images are private. You have two options:

#### Option A: Make the Repository Public (Simplest)
1. Go to your repository: https://github.com/alexkibler/sticker-nester-claude
2. Click **Settings** → **General**
3. Scroll to **Danger Zone**
4. Click **Change visibility** → **Make public**

#### Option B: Keep Repository Private, Make Package Public
1. After your first GitHub Action runs, go to: https://github.com/alexkibler?tab=packages
2. Click on the `sticker-nester-claude` package
3. Click **Package settings** (right sidebar)
4. Scroll to **Danger Zone**
5. Click **Change visibility** → **Make public**

**Why?** Your Mac Mini needs to pull images from ghcr.io without authentication. Public packages allow this.

### Step 2: Verify GitHub Token Permissions (No Action Needed!)

The workflow uses `${{ secrets.GITHUB_TOKEN }}` which is automatically provided by GitHub Actions. No manual secret creation needed! ✅

---

## Part 2: Home Server Setup (Mac Mini)

### Step 3: Update Docker Compose Configuration

1. **SSH or open Terminal** on your Mac Mini

2. **Navigate to nginx-proxy-manager directory:**
   ```bash
   cd /Volumes/1TB/Repos/nginx-proxy-manager
   ```

3. **Backup your current docker-compose.yml:**
   ```bash
   cp docker-compose.yml docker-compose.yml.backup
   ```

4. **Edit docker-compose.yml:**
   ```bash
   nano docker-compose.yml
   ```

5. **Replace the existing `mosaic:` service** with these THREE services (copy from `docker-compose.homeserver.yml` in this repo):

   ```yaml
   # Replace your current mosaic service with:

   mosaic:
     image: ghcr.io/alexkibler/sticker-nester-claude:latest
     container_name: mosaic
     environment:
       - NODE_ENV=production
       - PORT=3000
     restart: always
     ports:
       - "8084:3000"
     networks:
       - default
     labels:
       - "com.centurylinklabs.watchtower.enable=true"

   mosaic-dev:
     image: ghcr.io/alexkibler/sticker-nester-claude:dev
     container_name: mosaic-dev
     environment:
       - NODE_ENV=development
       - PORT=3000
     restart: always
     ports:
       - "8085:3000"
     networks:
       - default
     labels:
       - "com.centurylinklabs.watchtower.enable=true"

   watchtower:
     image: containrrr/watchtower:latest
     container_name: watchtower
     restart: always
     volumes:
       - /var/run/docker.sock:/var/run/docker.sock
     environment:
       - WATCHTOWER_POLL_INTERVAL=300
       - WATCHTOWER_LABEL_ENABLE=true
       - WATCHTOWER_CLEANUP=true
       - WATCHTOWER_DEBUG=true
       - WATCHTOWER_INCLUDE_STOPPED=true
       - WATCHTOWER_REMOVE_VOLUMES=false
     networks:
       - default
   ```

6. **Save and exit** (Ctrl+O, Enter, Ctrl+X in nano)

### Step 4: Initial Container Deployment

Since the images don't exist yet in ghcr.io, we need to trigger the first build:

1. **Trigger GitHub Actions** (we'll do this in Part 3)

2. **Wait for build to complete** (~5-10 minutes for first build)

3. **Pull and start containers** on Mac Mini:
   ```bash
   cd /Volumes/1TB/Repos/nginx-proxy-manager

   # Pull the images
   docker pull ghcr.io/alexkibler/sticker-nester-claude:latest
   docker pull ghcr.io/alexkibler/sticker-nester-claude:dev

   # Start all services (or just the new ones)
   docker-compose up -d mosaic mosaic-dev watchtower
   ```

4. **Verify containers are running:**
   ```bash
   docker ps | grep mosaic
   docker ps | grep watchtower
   ```

   You should see:
   - `mosaic` on port 8084
   - `mosaic-dev` on port 8085
   - `watchtower` running

5. **Check Watchtower logs:**
   ```bash
   docker logs watchtower
   ```

---

## Part 3: nginx-proxy-manager Configuration

### Step 5: Configure Production Domain (mosaic.alexkibler.com)

1. **Open nginx-proxy-manager:** http://your-mac-mini-ip:81

2. **Add Proxy Host:**
   - **Domain Names:** `mosaic.alexkibler.com`
   - **Scheme:** `http`
   - **Forward Hostname/IP:** `mosaic` (container name)
   - **Forward Port:** `3000`
   - **Cache Assets:** ✅ Enabled
   - **Block Common Exploits:** ✅ Enabled
   - **Websockets Support:** ✅ Enabled (if needed for real-time features)

3. **SSL Tab:**
   - **SSL Certificate:** Request a new SSL certificate
   - **Force SSL:** ✅ Enabled
   - **HTTP/2 Support:** ✅ Enabled
   - **HSTS Enabled:** ✅ Enabled

### Step 6: Configure Development Domain (mosaic-dev.alexkibler.com)

Repeat the same steps as above, but:
- **Domain Names:** `mosaic-dev.alexkibler.com`
- **Forward Hostname/IP:** `mosaic-dev`
- **Forward Port:** `3000`
- All other settings identical

---

## Part 4: Testing the CI/CD Pipeline

### Step 7: Test Development Deployment (claude/* branch)

1. **Make a change in this branch** (already on `claude/github-actions-docker-deploy-*`)

2. **Commit and push:**
   ```bash
   git add .
   git commit -m "test: trigger dev deployment"
   git push -u origin <your-claude-branch-name>
   ```

3. **Monitor GitHub Actions:**
   - Go to: https://github.com/alexkibler/sticker-nester-claude/actions
   - Watch the workflow run (~5-10 minutes first time, ~2-3 minutes cached)

4. **Wait for Watchtower to update** (up to 5 minutes)
   - Check logs: `docker logs -f watchtower`
   - You should see: "Found new ghcr.io/alexkibler/sticker-nester-claude:dev image"

5. **Verify deployment:**
   ```bash
   curl http://localhost:8085/api/health
   # OR
   curl https://mosaic-dev.alexkibler.com/api/health
   ```

### Step 8: Test Production Deployment (main branch)

1. **Merge to main** (via PR or direct push):
   ```bash
   git checkout main
   git pull
   git merge <your-claude-branch>
   git push
   ```

2. **Monitor GitHub Actions** (same as above)

3. **Wait for Watchtower** (up to 5 minutes)

4. **Verify production:**
   ```bash
   curl http://localhost:8084/api/health
   # OR
   curl https://mosaic.alexkibler.com/api/health
   ```

---

## Part 5: Ongoing Workflow

### Daily Development Workflow

1. **Create/work on a claude/* branch**
2. **Push commits** → Automatically builds `:dev` → Deploys to mosaic-dev
3. **Test on:** https://mosaic-dev.alexkibler.com
4. **When ready, merge to main** → Automatically builds `:latest` → Deploys to production
5. **Production live at:** https://mosaic.alexkibler.com

### Manual Container Management

**Force update check:**
```bash
docker exec watchtower /watchtower --run-once
```

**View container logs:**
```bash
docker logs -f mosaic        # Production
docker logs -f mosaic-dev    # Development
docker logs -f watchtower    # Auto-updater
```

**Manually pull and restart:**
```bash
cd /Volumes/1TB/Repos/nginx-proxy-manager
docker-compose pull mosaic mosaic-dev
docker-compose up -d mosaic mosaic-dev
```

**Stop Watchtower temporarily:**
```bash
docker stop watchtower
# Do manual work
docker start watchtower
```

---

## Troubleshooting

### Issue: "Failed to pull image: unauthorized"

**Cause:** Container image is private in ghcr.io

**Solution:** Follow **Part 1, Step 1** to make the package public

---

### Issue: Watchtower not updating containers

**Check logs:**
```bash
docker logs watchtower
```

**Common causes:**
1. Image hasn't changed (check GitHub Actions completed)
2. Container not labeled correctly (verify `com.centurylinklabs.watchtower.enable=true`)
3. Watchtower not running (`docker ps | grep watchtower`)

**Force update:**
```bash
docker exec watchtower /watchtower --run-once
```

---

### Issue: Build fails in GitHub Actions

**Check the workflow run:**
- Go to https://github.com/alexkibler/sticker-nester-claude/actions
- Click on the failed run
- Check the error logs

**Common causes:**
1. Dockerfile syntax error
2. Missing dependencies in package.json
3. Build step failure

---

### Issue: nginx-proxy-manager shows 502 Bad Gateway

**Verify container is running:**
```bash
docker ps | grep mosaic
```

**Check container health:**
```bash
docker logs mosaic
# or
docker logs mosaic-dev
```

**Check port mapping:**
```bash
curl http://localhost:8084/api/health    # Should return health check
curl http://localhost:8085/api/health
```

**Verify nginx-proxy-manager config:**
- Forward Hostname should be `mosaic` (not `localhost`)
- Forward Port should be `3000` (not `8084`)

---

## Image Tags Reference

| Git Branch | Image Tag | Container | Domain |
|------------|-----------|-----------|--------|
| `main` | `ghcr.io/alexkibler/sticker-nester-claude:latest` | mosaic | mosaic.alexkibler.com |
| `claude/*` | `ghcr.io/alexkibler/sticker-nester-claude:dev` | mosaic-dev | mosaic-dev.alexkibler.com |
| Any branch | `ghcr.io/alexkibler/sticker-nester-claude:<branch>-<sha>` | (manual) | - |

---

## Security Notes

1. **GITHUB_TOKEN** is scoped to the repository only (no additional secrets needed)
2. **Watchtower** only has read access to Docker socket (standard practice)
3. **Images are public** - don't include secrets in the build (use environment variables)
4. **DDNS is supported** - Watchtower polls outbound, no inbound connections needed

---

## Next Steps / Future Improvements

- [ ] Add health checks to Dockerfile (`HEALTHCHECK` instruction)
- [ ] Set up Docker image scanning (Trivy, Snyk) in GitHub Actions
- [ ] Add staging environment (separate from dev)
- [ ] Implement blue-green deployments
- [ ] Add Slack/Discord notifications for deployments
- [ ] Set up monitoring (Prometheus/Grafana)

---

## Quick Reference Commands

```bash
# On Mac Mini - View logs
docker logs -f mosaic
docker logs -f mosaic-dev
docker logs -f watchtower

# Force Watchtower update
docker exec watchtower /watchtower --run-once

# Restart containers
cd /Volumes/1TB/Repos/nginx-proxy-manager
docker-compose restart mosaic mosaic-dev

# Pull latest images manually
docker pull ghcr.io/alexkibler/sticker-nester-claude:latest
docker pull ghcr.io/alexkibler/sticker-nester-claude:dev

# View running containers
docker ps | grep -E "mosaic|watchtower"
```

---

**Questions?** Check the logs first, then review the troubleshooting section above.
