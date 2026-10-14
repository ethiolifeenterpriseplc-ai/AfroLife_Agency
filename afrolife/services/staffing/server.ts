import { startAgencyDomainService } from '../agency-domain/runtime.js';
await startAgencyDomainService('staffing', 3401, async () => (
  await import('./router.js')
).router);
