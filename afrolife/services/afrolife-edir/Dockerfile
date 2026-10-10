FROM node:22-alpine AS build
WORKDIR /app/afrolife
COPY package.json package-lock.json ./
RUN npm ci
COPY src ./src
COPY services/afrolife-edir ./services/afrolife-edir
RUN npm run build:edir

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app/afrolife
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/afrolife/dist ./dist
COPY --from=build /app/afrolife/services/afrolife-edir/001_schema.sql ./services/afrolife-edir/001_schema.sql
COPY --from=build /app/afrolife/services/afrolife-edir/002_staff_and_lifecycle.sql ./services/afrolife-edir/002_staff_and_lifecycle.sql
COPY --from=build /app/afrolife/services/afrolife-edir/003_financial_core.sql ./services/afrolife-edir/003_financial_core.sql
COPY --from=build /app/afrolife/services/afrolife-edir/004_hierarchical_edirs.sql ./services/afrolife-edir/004_hierarchical_edirs.sql
COPY --from=build /app/afrolife/services/afrolife-edir/005_credit_workflow.sql ./services/afrolife-edir/005_credit_workflow.sql
COPY --from=build /app/afrolife/services/afrolife-edir/006_loan_servicing.sql ./services/afrolife-edir/006_loan_servicing.sql
EXPOSE 3200
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3200)+'/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/services/afrolife-edir/server.js"]
