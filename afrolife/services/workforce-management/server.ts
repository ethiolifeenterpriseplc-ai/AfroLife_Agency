import { startAgencyDomainService } from '../agency-domain/runtime.js';
await startAgencyDomainService('workforce-management', 3400, async () => (
  await import('./router.js')
).router);
