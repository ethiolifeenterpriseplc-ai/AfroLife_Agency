export default Object.freeze({
  id: 'workforce-management',
  name: 'Workforce Management',
  logo: '/mini-apps/workforce-management/logo.svg',
  description: 'Register workers, manage profiles, and review workforce documents.',
  panels: ['workers'],
  api: ['/workers', '/documents'],
});
