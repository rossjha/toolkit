# meet-toolkit in a container. See "Run" in README.md; compose.yaml mounts your notes folder.
# compose.yaml builds from the tools repo root with APP=apps/meet-toolkit, so npm ci installs from the root lockfile.
# APP=. builds this folder on its own, which needs a package-lock.json here.

FROM node:26-slim AS build
ARG APP=.
WORKDIR /app
COPY package.json package-lock.json ./
COPY ${APP}/package.json ${APP}/
RUN if [ "$APP" = . ]; then npm ci; else npm ci -w "$APP"; fi
COPY ${APP} ${APP}
RUN cd "$APP" && npm run build
RUN npm prune --omit=dev

FROM node:26-slim
ARG APP=.
WORKDIR /app/${APP}
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    OPEN_BROWSER=false
# The whole pruned tree: the root node_modules plus the app, including any app-level node_modules npm created.
COPY --from=build /app /app
USER node
EXPOSE 4319
CMD ["node", "src/server/main.ts"]
