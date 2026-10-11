const os = require('node:os');
// tsx's Windows loader falls back to os.userInfo() when geteuid is absent.
if (typeof process.geteuid !== 'function') process.geteuid = () => -1;
try {
  os.userInfo();
} catch (error) {
  if (error?.syscall !== 'uv_os_get_passwd') throw error;
  os.userInfo = () => ({
    uid: -1,
    gid: -1,
    username: process.env.USERNAME || 'afrolife-build',
    homedir: process.env.USERPROFILE || process.cwd(),
    shell: process.env.ComSpec || null,
  });
}
