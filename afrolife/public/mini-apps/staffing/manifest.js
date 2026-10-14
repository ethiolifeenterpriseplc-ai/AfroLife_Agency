export default Object.freeze({
  id: 'staffing',
  name: 'Staffing',
  logo: '/mini-apps/staffing/logo.svg',
  description: 'Create staffing requests and match them with eligible workers.',
  panels: ['requests'],
  api: ['/requests', '/matches'],
});
