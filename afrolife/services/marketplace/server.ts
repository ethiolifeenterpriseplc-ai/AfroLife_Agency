import { startAgencyDomainService } from '../agency-domain/runtime.js';
await startAgencyDomainService('marketplace', 3403, async () => (
  await import('./router.js')
).router);
