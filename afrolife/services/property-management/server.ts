import { startAgencyDomainService } from '../agency-domain/runtime.js';
await startAgencyDomainService('property-management', 3402, async () => (
  await import('./router.js')
).router);
