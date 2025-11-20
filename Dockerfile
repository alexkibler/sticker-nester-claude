# Multi-stage Dockerfile for Full Stack Mosaic Application

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

# Stage 3: Build C++ Polygon Packer (optional - graceful failure)
FROM node:20-alpine AS cpp-builder
WORKDIR /app/server/cpp-packer

# Install minimal C++ build dependencies (for stub version)
# Stub only needs standard library, no external dependencies
RUN apk add --no-cache \
    build-base \
    cmake

# Copy C++ packer source
COPY server/cpp-packer/ ./

# Try to build the C++ binary, but don't fail the whole build if it fails
# This allows the app to still run with the JS fallback
RUN mkdir -p bin && \
    (mkdir -p build && \
     cd build && \
     cmake .. -DCMAKE_BUILD_TYPE=Release -DCMAKE_CXX_FLAGS="-O3" && \
     cmake --build . --config Release -j$(nproc) && \
     cmake --install . && \
     echo "✓ C++ packer built successfully") || \
    (echo "⚠ C++ packer build failed - will use JavaScript fallback" && \
     touch bin/nest-packer.failed)

# Verify binary status (for logging only)
RUN ls -la bin/ || true

# Stage 4: Production Runtime
FROM node:20-alpine
WORKDIR /app

# Capture git info for version display
ARG GIT_BRANCH=unknown
ARG GIT_COMMIT=unknown
ARG BUILD_TIME=unknown
ENV GIT_BRANCH=${GIT_BRANCH}
ENV GIT_COMMIT=${GIT_COMMIT}
ENV BUILD_TIME=${BUILD_TIME}

# Install native dependencies for Sharp image processing
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    pixman-dev \
    libstdc++

# Install production dependencies for backend
COPY server/package.json server/package-lock.json ./
RUN npm ci --only=production

# Copy built backend
COPY --from=backend-builder /app/server/dist ./dist

# Copy built C++ packer binary (if it exists)
RUN mkdir -p ./cpp-packer/bin
COPY --from=cpp-builder /app/server/cpp-packer/bin/ ./cpp-packer/bin/
RUN if [ -f ./cpp-packer/bin/nest-packer ]; then \
        chmod +x ./cpp-packer/bin/nest-packer && \
        echo "✓ C++ packer available"; \
    else \
        echo "⚠ C++ packer not available - using JavaScript fallback"; \
    fi

# Copy built frontend (Angular outputs to dist/mosaic by default)
COPY --from=frontend-builder /app/dist/mosaic/browser ./public

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "dist/index.js"]
