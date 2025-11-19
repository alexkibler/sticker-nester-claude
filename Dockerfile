# Multi-stage Dockerfile for Full Stack Sticker Nester Application

# Stage 1: Build Angular Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Build Node.js Backend
FROM node:20-alpine AS backend-builder
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# Stage 3: Production Runtime
FROM node:20-alpine
WORKDIR /app

# Install native dependencies for Sharp image processing
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    pixman-dev

# Install production dependencies for backend
COPY server/package.json server/package-lock.json ./
RUN npm ci --only=production

# Copy built backend
COPY --from=backend-builder /app/server/dist ./dist

# Copy built frontend (Angular outputs to dist/sticker-nesting/browser by default)
COPY --from=frontend-builder /app/dist/sticker-nesting/browser ./public

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "dist/index.js"]
