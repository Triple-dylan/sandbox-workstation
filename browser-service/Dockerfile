# The shared browser service. Railway builds this folder on its own (Root Directory: /browser-service).
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
# Chrome, the libraries it needs, and a virtual screen for it to draw on.
RUN npx playwright install --with-deps chromium \
  && apt-get update && apt-get install -y --no-install-recommends xvfb \
  && rm -rf /var/lib/apt/lists/*
COPY service.ts guard.ts pages.ts health.ts front.ts ./
EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", "service.ts"]
