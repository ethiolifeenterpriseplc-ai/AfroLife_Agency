FROM node:22-alpine AS build
WORKDIR /app/afrolife
COPY package.json package-lock.json ./
RUN npm ci
COPY src ./src
COPY services/agency-domain/runtime.ts ./services/agency-domain/runtime.ts
COPY services/workforce-management ./services/workforce-management
COPY services/worker-management ./services/worker-management
COPY services/staffing ./services/staffing
COPY services/property-management ./services/property-management
COPY services/marketplace ./services/marketplace
ARG SERVICE_NAME=workforce-management
RUN case "$SERVICE_NAME" in \
      workforce-management|worker-management) npm run build:workforce-management ;; \
      staffing) npm run build:staffing ;; \
      property-management) npm run build:property-management ;; \
      marketplace) npm run build:marketplace ;; \
      *) echo "Unsupported SERVICE_NAME: $SERVICE_NAME" >&2; exit 1 ;; \
    esac

FROM node:22-alpine
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3400
ARG SERVICE_NAME=workforce-management
ENV SERVICE_NAME=${SERVICE_NAME}
WORKDIR /app/afrolife
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/afrolife/dist ./dist
EXPOSE 3400
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3400)+'/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["sh", "-c", "case \"$SERVICE_NAME\" in worker-management) SERVICE_NAME=workforce-management ;; esac; exec node \"dist/services/$SERVICE_NAME/server.js\""]
