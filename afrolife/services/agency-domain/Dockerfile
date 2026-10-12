FROM node:22-alpine AS build
WORKDIR /app/afrolife
COPY package.json package-lock.json ./
RUN npm ci
COPY src ./src
COPY services/agency-domain ./services/agency-domain
COPY services/worker-management ./services/worker-management
COPY services/staffing ./services/staffing
COPY services/property-management ./services/property-management
COPY services/marketplace ./services/marketplace
RUN npm run build:agency-domains

FROM node:22-alpine
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3400
ARG SERVICE_NAME=worker-management
ENV SERVICE_NAME=${SERVICE_NAME}
WORKDIR /app/afrolife
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/afrolife/dist ./dist
EXPOSE 3400
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3400)+'/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["sh", "-c", "case \"$SERVICE_NAME\" in worker-management|staffing|property-management|marketplace) exec node \"dist/services/$SERVICE_NAME/server.js\" ;; *) echo 'Unsupported SERVICE_NAME' >&2; exit 1 ;; esac"]
