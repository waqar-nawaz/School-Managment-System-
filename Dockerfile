# Railway deploy image: builds Angular SPA + Express API into one runtime.
FROM node:20-alpine AS build
WORKDIR /build

# 1) Frontend
COPY frontend/package.json frontend/package-lock.json frontend/
RUN cd frontend && npm ci --no-audit --no-fund
COPY frontend frontend
RUN cd frontend && npm run build -- --configuration production

# 2) Backend
COPY backend/package.json backend/package-lock.json backend/
RUN cd backend && npm ci --no-audit --no-fund
COPY backend backend
RUN cd backend && npm run build

# ---------- runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Create a non-root user so the container does not run as root in production.
RUN addgroup -S app && adduser -S app -G app \
    && mkdir -p /app/backend/uploads && chown -R app:app /app

COPY --from=build /build/backend/package.json /build/backend/package-lock.json backend/
RUN cd backend && npm ci --omit=dev --no-audit --no-fund

COPY --from=build /build/backend/dist backend/dist
COPY --from=build /build/frontend/dist/sms-frontend frontend/dist/sms-frontend

USER app
WORKDIR /app/backend
EXPOSE 3000
CMD ["node", "dist/server.js"]