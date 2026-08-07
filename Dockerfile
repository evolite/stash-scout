FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/frontend/dist ./frontend/dist

# Secrets (StashDB/Stash/Whisparr keys) and saved filters live here, encrypted
# at rest — mount a volume so they survive container recreation.
VOLUME ["/app/data"]

EXPOSE 8787
CMD ["node", "dist-server/server/index.js"]
