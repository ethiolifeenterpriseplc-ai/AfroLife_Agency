import workforceManagement from './workforce-management/manifest.js';
import staffing from './staffing/manifest.js';
import propertyManagement from './property-management/manifest.js';
import marketplace from './marketplace/manifest.js';
import accounting from './accounting/manifest.js';

export const miniApps = Object.freeze([
  workforceManagement,
  staffing,
  propertyManagement,
  marketplace,
  accounting,
]);

export const miniAppByPanel = Object.freeze(Object.fromEntries(
  miniApps.flatMap((miniApp) => miniApp.panels.map((panel) => [panel, miniApp])),
));
