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

# Stage 3: Build C++ Polygon Packer
FROM node:20-alpine AS cpp-builder
WORKDIR /app/server/cpp-packer

# Install C++ build dependencies
RUN apk add --no-cache \
    build-base \
    cmake \
    boost-dev \
    git \
    linux-headers

# Copy C++ packer source
COPY server/cpp-packer/ ./

# Build the C++ binary
RUN chmod +x build.sh && \
    mkdir -p build bin && \
    cd build && \
    cmake .. -DCMAKE_BUILD_TYPE=Release && \
    cmake --build . --config Release -j$(nproc) && \
    cmake --install .

# Verify binary was created
RUN ls -la bin/ && test -f bin/nest-packer || (echo "ERROR: nest-packer binary not found!" && exit 1)

# Stage 4: Production Runtime
FROM node:20-alpine
WORKDIR /app

# Install native dependencies for Sharp image processing and C++ runtime
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    pixman-dev \
    boost-system \
    boost-thread \
    libstdc++

# Install production dependencies for backend
COPY server/package.json server/package-lock.json ./
RUN npm ci --only=production

# Copy built backend
COPY --from=backend-builder /app/server/dist ./dist

# Copy built C++ packer binary
COPY --from=cpp-builder /app/server/cpp-packer/bin/nest-packer ./cpp-packer/bin/nest-packer
RUN chmod +x ./cpp-packer/bin/nest-packer

# Copy built frontend (Angular outputs to dist/mosaic by default)
COPY --from=frontend-builder /app/dist/mosaic/browser ./public

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "dist/index.js"]
