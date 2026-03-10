FROM node:20-alpine AS builder

WORKDIR /app

# Fix permissions
RUN chmod -R 777 /tmp

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install --ignore-scripts

# Copy source and build
COPY . .
RUN npm run build

# Production stage - serve with nginx
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
