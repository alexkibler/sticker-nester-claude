# Version Badge Feature

## Overview

A floating version badge displays in the bottom-right corner of the application, showing the current git branch name and version information. This makes it easy to identify which version is running during development and staging.

## Features

- **Branch name display**: Shows the current git branch (e.g., `claude/cpp-polygon-packing-...`)
- **Expandable details**: Click to expand and see commit hash, build time, and environment
- **Color-coded**: Blue for development/staging, green for production
- **Auto-hide in production**: Becomes semi-transparent in production mode unless hovered/clicked

## What's Displayed

### Collapsed View
- Git branch name only

### Expanded View (click to expand)
- **Branch**: Full git branch name
- **Commit**: Short commit hash (first 7 characters)
- **Build**: ISO timestamp of when the Docker image was built
- **Env**: Node.js environment (development/production)

## Usage

### Development (npm start)

The badge will show "local-dev" as the branch since no git info is passed in development mode.

### Docker Build with Version Info

Use the provided build script to automatically capture git information:

```bash
./docker-build.sh
```

This script:
1. Captures current git branch, commit hash, and build timestamp
2. Passes them as Docker build arguments
3. Tags the image with both `latest` and the branch name

### Manual Docker Build

You can also pass version info manually:

```bash
docker build \
  --build-arg GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD) \
  --build-arg GIT_COMMIT=$(git rev-parse HEAD) \
  --build-arg BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ") \
  -t mosaic:latest \
  .
```

### Docker Compose

Update your docker-compose.yml to pass build args:

```yaml
services:
  mosaic:
    build:
      context: /path/to/sticker-nester-claude
      args:
        GIT_BRANCH: ${GIT_BRANCH:-unknown}
        GIT_COMMIT: ${GIT_COMMIT:-unknown}
        BUILD_TIME: ${BUILD_TIME:-unknown}
```

Then build with:

```bash
export GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
export GIT_COMMIT=$(git rev-parse HEAD)
export BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
docker-compose up -d --build mosaic
```

## API Endpoint

The version information is served via the health check endpoint:

```bash
curl http://localhost:8084/api/health
```

Response:
```json
{
  "status": "ok",
  "message": "Mosaic API is running",
  "version": {
    "branch": "claude/cpp-polygon-packing-013JVbin7ATyZn4QaFcdpZQk",
    "commit": "929f861a...",
    "buildTime": "2025-01-20T10:30:00Z",
    "nodeEnv": "production"
  }
}
```

## Customization

### Hide the Badge

To hide the badge completely, edit `src/app/app.html` and remove:

```html
<app-version-badge></app-version-badge>
```

### Change Position

Edit `src/app/components/version-badge.component.ts` and modify the CSS:

```css
.version-badge {
  position: fixed;
  bottom: 10px;  /* Change to top: 10px for top-right */
  right: 10px;   /* Change to left: 10px for bottom-left */
  z-index: 9999;
}
```

### Change Colors

Modify the badge-content background colors:

```css
/* Development/Staging (blue) */
.badge-content {
  background: rgba(0, 123, 255, 0.9);
}

/* Production (green) */
.version-badge.production .badge-content {
  background: rgba(40, 167, 69, 0.9);
}
```

## Implementation Details

### Backend

The backend serves version info via environment variables:

```typescript
// server/src/index.ts
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: {
      branch: process.env.GIT_BRANCH || 'unknown',
      commit: process.env.GIT_COMMIT || 'unknown',
      buildTime: process.env.BUILD_TIME || 'unknown',
      nodeEnv: process.env.NODE_ENV || 'development'
    }
  });
});
```

### Frontend

The frontend component fetches version info on initialization:

```typescript
// src/app/components/version-badge.component.ts
ngOnInit(): void {
  this.http.get<HealthResponse>('/api/health').subscribe({
    next: (response) => {
      this.version = response.version;
      this.isProduction = response.version.nodeEnv === 'production';
    }
  });
}
```

### Dockerfile

The Dockerfile accepts build arguments and sets them as environment variables:

```dockerfile
# Stage 4: Production Runtime
ARG GIT_BRANCH=unknown
ARG GIT_COMMIT=unknown
ARG BUILD_TIME=unknown
ENV GIT_BRANCH=${GIT_BRANCH}
ENV GIT_COMMIT=${GIT_COMMIT}
ENV BUILD_TIME=${BUILD_TIME}
```

## Troubleshooting

### Badge shows "unknown" for all fields

**Cause**: Git information not passed during Docker build

**Fix**: Use `./docker-build.sh` or pass build args manually (see above)

### Badge shows "local-dev"

**Cause**: Running in development mode with `npm start`

**Expected**: This is normal for local development

### Badge not visible

**Cause**: May be hidden behind other elements or in production auto-hide mode

**Fix**:
- Check z-index in CSS (should be 9999)
- In production, hover over bottom-right corner to reveal
- Click to expand and make it stay visible

## Security Note

The version badge displays git branch names and commit hashes publicly. This is generally safe for development/staging environments, but if you're concerned about exposing this information in production:

1. Set different values in production:
   ```bash
   docker build --build-arg GIT_BRANCH="v1.2.3" ...
   ```

2. Or hide the badge in production by modifying the component:
   ```typescript
   <div class="version-badge" *ngIf="!isProduction">
   ```

## Examples

### Development Environment
```
┌─────────────────┐
│ local-dev       │
└─────────────────┘
```

### Staging with Full Info (expanded)
```
┌──────────────────────────────────────┐
│ claude/cpp-polygon-packing-013JV...  │
├──────────────────────────────────────┤
│ Commit:  929f861                     │
│ Build:   2025-01-20T10:30:00Z        │
│ Env:     production                  │
└──────────────────────────────────────┘
```

### Production (collapsed, semi-transparent)
```
┌─────────────────┐
│ main            │  (30% opacity)
└─────────────────┘
```
