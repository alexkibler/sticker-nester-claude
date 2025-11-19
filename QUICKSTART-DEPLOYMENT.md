# Quick Start: Deploy in 5 Steps

This is the TL;DR version. For full details, see [DEPLOYMENT.md](./DEPLOYMENT.md).

## Prerequisites
- GitHub repository: `alexkibler/sticker-nester-claude`
- Mac Mini with OrbStack running
- nginx-proxy-manager setup at `/Volumes/1TB/Repos/nginx-proxy-manager`
- Domains configured in DNS: `mosaic.alexkibler.com`, `mosaic-dev.alexkibler.com`

---

## Step 1: Make GitHub Package Public

**After your first GitHub Actions run**, go to:
- https://github.com/alexkibler?tab=packages
- Click `sticker-nester-claude` package
- **Package settings** → **Change visibility** → **Make public**

*(Or make the entire repository public - easier option)*

---

## Step 2: Update docker-compose.yml on Mac Mini

```bash
# SSH to Mac Mini or open Terminal
cd /Volumes/1TB/Repos/nginx-proxy-manager

# Backup
cp docker-compose.yml docker-compose.yml.backup

# Edit
nano docker-compose.yml
```

**Replace** your current `mosaic:` service with these **THREE** services:

```yaml
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
    networks:
      - default
```

Save and exit (Ctrl+O, Enter, Ctrl+X).

---

## Step 3: Push to GitHub (Trigger First Build)

```bash
# In this repository
git add .
git commit -m "feat: add GitHub Actions CI/CD with Docker deployment"
git push -u origin claude/github-actions-docker-deploy-0124SVzDVe91eNrHdSDkXrdF
```

**Monitor build:**
- https://github.com/alexkibler/sticker-nester-claude/actions
- Wait ~5-10 minutes (first build is slow, cached builds are ~2-3 min)

---

## Step 4: Start Containers on Mac Mini

```bash
# After GitHub Actions completes
cd /Volumes/1TB/Repos/nginx-proxy-manager

# Pull images
docker pull ghcr.io/alexkibler/sticker-nester-claude:latest
docker pull ghcr.io/alexkibler/sticker-nester-claude:dev

# Start services
docker-compose up -d mosaic mosaic-dev watchtower

# Verify
docker ps | grep mosaic
docker logs -f watchtower
```

**Test locally:**
```bash
curl http://localhost:8084/api/health   # Production
curl http://localhost:8085/api/health   # Development
```

---

## Step 5: Configure nginx-proxy-manager

Open http://your-mac-mini-ip:81

### Add Production Proxy:
- **Domain:** `mosaic.alexkibler.com`
- **Forward Hostname:** `mosaic`
- **Forward Port:** `3000`
- **SSL:** Request new certificate, enable Force SSL

### Add Development Proxy:
- **Domain:** `mosaic-dev.alexkibler.com`
- **Forward Hostname:** `mosaic-dev`
- **Forward Port:** `3000`
- **SSL:** Request new certificate, enable Force SSL

---

## Done! 🎉

### How It Works:

```
Push to main      →  GitHub Actions  →  ghcr.io:latest  →  Watchtower  →  mosaic (prod)
                                                           (auto-updates     ↓
                                                            every 5 min)     mosaic.alexkibler.com

Push to claude/*  →  GitHub Actions  →  ghcr.io:dev     →  Watchtower  →  mosaic-dev
                                                                             ↓
                                                                             mosaic-dev.alexkibler.com
```

### Daily Workflow:
1. Work on `claude/*` branch → Push → Auto-deploys to **dev**
2. Test on https://mosaic-dev.alexkibler.com
3. Merge to `main` → Auto-deploys to **production**
4. Live at https://mosaic.alexkibler.com

---

## Troubleshooting

**Container not updating?**
```bash
docker logs watchtower
docker exec watchtower /watchtower --run-once
```

**Build failing?**
- Check https://github.com/alexkibler/sticker-nester-claude/actions
- Review error logs in failed workflow

**502 Bad Gateway?**
- Verify container is running: `docker ps | grep mosaic`
- Check logs: `docker logs mosaic` or `docker logs mosaic-dev`
- Ensure nginx-proxy-manager points to container name (not localhost)

---

**Full documentation:** [DEPLOYMENT.md](./DEPLOYMENT.md)
