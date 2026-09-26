FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .
RUN mkdir -p data/cache data/config data/darwin data/validation \
  && chown -R node:node /app

USER node
ENV NODE_ENV=production
EXPOSE 8787

CMD ["npm", "run", "display"]
