# Stage 1: build dependencies & compile TS to JS
FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

COPY src ./src
RUN npm run build

# Stage 2: runtime image
FROM node:22-alpine AS runtime

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production

COPY --from=builder /app/dist ./dist

# Expose the HTTP streaming port
EXPOSE 3000

# Run the compiled server
CMD ["node", "dist/index.js"]