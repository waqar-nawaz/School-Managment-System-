# Backend image
# Stage 1: build TypeScript
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Stage 2: production runtime
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src

RUN mkdir -p /app/uploads && addgroup -S app && adduser -S app -G app
USER app

EXPOSE 3000
CMD ["node", "dist/server.js"]