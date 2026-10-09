import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import dotenv from 'dotenv';

const localConfig = process.env.LOCALAPPDATA
  ? join(process.env.LOCALAPPDATA, 'AfroLife', 'afrolife.env')
  : undefined;
const configuredPath = process.env.AFROLIFE_ENV_FILE;
const envPath = configuredPath && existsSync(configuredPath)
  ? configuredPath
  : existsSync(resolve('.env'))
    ? resolve('.env')
    : localConfig && existsSync(localConfig)
      ? localConfig
      : resolve('.env');

dotenv.config({ path: envPath });
