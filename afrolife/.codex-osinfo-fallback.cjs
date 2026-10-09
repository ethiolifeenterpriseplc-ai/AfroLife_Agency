const os = require('node:os');
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
