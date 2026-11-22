# Stage 1: Build Expo Web Production SPA Bundle
FROM node:24-bookworm-slim AS web-builder
WORKDIR /app

COPY shared ./shared
COPY mobile/package*.json ./mobile/
WORKDIR /app/mobile
RUN npm install

COPY mobile ./
ARG EXPO_PUBLIC_API_URL=""
ENV EXPO_PUBLIC_API_URL=${EXPO_PUBLIC_API_URL}
RUN npx expo export --platform web --output-dir dist

# Stage 2: Production Relay + SQLite WAL + FFmpeg + Static Web Host
FROM node:24-bookworm-slim
WORKDIR /app

COPY shared ./shared
COPY server/package*.json ./server/
WORKDIR /app/server
RUN npm install

COPY server ./
RUN npm run typecheck

COPY --from=web-builder /app/mobile/dist /app/mobile/dist
RUN mkdir -p /app/server/data /app/server/uploads

EXPOSE 4000
ENV NODE_ENV=production
ENV PORT=4000
ENV STATIC_WEB_DIR=/app/mobile/dist

CMD ["npm", "start"]
