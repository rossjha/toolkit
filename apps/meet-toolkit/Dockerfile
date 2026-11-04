# meet-toolkit in a container. See "Run with Docker" in README.md; compose.yaml mounts your notes folder.

FROM node:26-slim AS build
WORKDIR /app
# Inside the tools monorepo the lockfile is at the repo root, so fall back to install when there isn't one here.
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install --no-audit --no-fund; fi
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:26-slim
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    OPEN_BROWSER=false
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/public ./public
USER node
EXPOSE 4319
CMD ["node", "src/server/main.ts"]
