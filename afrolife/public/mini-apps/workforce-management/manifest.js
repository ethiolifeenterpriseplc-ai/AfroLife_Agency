export default Object.freeze({
  id: 'workforce-management',
  name: 'Workforce Management',
  logo: '/mini-apps/workforce-management/logo.svg',
  description: 'Worker self-service for job terms, work reports, and support, plus workforce administration.',
  panels: ['workers'],
  api: ['/workers', '/documents', '/staffing-engagements/mine', '/staffing-work-periods/mine', '/worker-support'],
});
