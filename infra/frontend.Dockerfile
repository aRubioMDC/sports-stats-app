# Frontend-only image for self-host (split-container architecture): builds the
# Vite SPA then serves it as static files from nginx (no Node at runtime).
FROM node:20-slim AS build
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /frontend/dist /usr/share/nginx/html
COPY infra/nginx/frontend.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD wget -qO- http://localhost/ >/dev/null || exit 1
