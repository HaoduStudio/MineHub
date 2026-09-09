FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm install --global npm@12.0.2 && npm ci --ignore-scripts
COPY . .
RUN npx prisma generate && npx tsc -p tsconfig.app.json && npx tsc -p tsconfig.server.json && npx vp build

FROM node:24-bookworm-slim
WORKDIR /app
RUN npm install --global npm@12.0.2
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts /app/package.json ./
RUN mkdir -p /app/data/textures && chown -R node:node /app/data
USER node
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "--import", "tsx", "server/index.ts"]
