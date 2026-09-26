# Rainlit's server, for running your own (see SELF-HOSTING.md).
FROM node:24-slim

WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server.js ./
COPY lib ./lib
COPY public ./public

# Accounts, conversations, files and keys all live here: keep it (a volume) between updates.
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://localhost:3000/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "server.js"]
