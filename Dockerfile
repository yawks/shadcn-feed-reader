# Stage 1: Build Frontend
FROM node:20-slim AS frontend-builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Stage 2: Build Backend
FROM rust:slim-bookworm AS backend-builder
WORKDIR /app
RUN apt-get update && apt-get install -y pkg-config libssl-dev
COPY src-tauri ./src-tauri
WORKDIR /app/src-tauri
# Check if there is a separate lock file or not. 
# We assume standard src-tauri location.
# Build only the server binary
RUN cargo build --release --bin shadcn-feed-server --no-default-features

# Stage 3: Runtime
FROM debian:bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y libssl3 ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy frontend assets
COPY --from=frontend-builder /app/dist ./dist

# Copy backend binary
COPY --from=backend-builder /app/src-tauri/target/release/shadcn-feed-server ./server

ENV PORT=3005
EXPOSE 3005

CMD ["./server"]
