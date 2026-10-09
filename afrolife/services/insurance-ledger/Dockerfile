FROM node:22-alpine AS build
WORKDIR /app/afrolife
COPY package.json package-lock.json ./
RUN npm ci
COPY src ./src
COPY services/insurance-ledger ./services/insurance-ledger
COPY migrations/026_insurance_ledger.sql ./migrations/026_insurance_ledger.sql
RUN npm run build:insurance

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app/afrolife
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/afrolife/dist ./dist
COPY --from=build /app/afrolife/migrations/026_insurance_ledger.sql ./migrations/026_insurance_ledger.sql
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3100)+'/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/services/insurance-ledger/server.js"]
