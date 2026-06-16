# --- Stage 1: Build & Prune Stage ---
FROM node:20-alpine AS builder

WORKDIR /app

# Install build tools required to compile native modules (like argon2)
RUN apk add --no-cache python3 make g++

COPY package*.json ./
# 💡 Added flag to bypass the peer dependency bottleneck
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build

# 💡 Added flag here too so prune doesn't choke on verification
RUN npm prune --omit=dev --legacy-peer-deps

# --- Stage 2: Production Runner Stage ---
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./

# Copy pre-built folders directly
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["sh", "-c", "npx typeorm migration:run -d dist/typeorm.config.js && node dist/main"]

