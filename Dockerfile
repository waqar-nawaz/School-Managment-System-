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

COPY --from=build /build/backend/package.json /build/backend/package-lock.json backend/
RUN cd backend && npm ci --omit=dev --no-audit --no-fund

COPY --from=build /build/backend/dist backend/dist
COPY --from=build /build/frontend/dist/sms-frontend frontend/dist/sms-frontend

WORKDIR /app/backend
EXPOSE 3000
CMD ["node", "dist/server.js"]