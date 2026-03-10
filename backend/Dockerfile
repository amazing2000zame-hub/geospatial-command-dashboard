FROM node:20-slim AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --ignore-scripts
RUN node node_modules/esbuild/install.js 2>/dev/null || true
COPY . .
RUN npx tsc

FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --ignore-scripts
COPY --from=builder /app/dist ./dist
EXPOSE 4000
CMD ["node", "dist/index.js"]
