FROM node:22-alpine AS build
WORKDIR /app/afrolife
COPY package.json package-lock.json ./
RUN npm ci
COPY src ./src
COPY services/sacco-mfi ./services/sacco-mfi
RUN npm run build:mfi

FROM node:22-alpine
ENV NODE_ENV=production
ENV HOST=0.0.0.0
WORKDIR /app/afrolife
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/afrolife/dist ./dist
EXPOSE 3300
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3300)+'/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/services/sacco-mfi/server.js"]
