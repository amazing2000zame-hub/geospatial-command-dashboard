FROM node:20-alpine

WORKDIR /app

# Fix permissions
RUN chmod -R 777 /tmp

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install --ignore-scripts

# Copy source
COPY . .

# Build TypeScript (tsx doesn't need esbuild postinstall)
RUN npm run build

# Expose port
EXPOSE 4000

# Start server
CMD ["npm", "start"]
