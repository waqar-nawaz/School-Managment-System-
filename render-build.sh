#!/usr/bin/env bash
# Render build script: builds the Angular frontend, then the Express backend.
# Run from the repository root (Render Blueprint buildCommand).
set -euo pipefail

echo "==> Building frontend"
cd frontend
npm ci --no-audit --no-fund
npm run build -- --configuration production
cd ..

echo "==> Building backend"
cd backend
npm ci --no-audit --no-fund
npm run build
cd ..

echo "==> Build complete"