import type { AuthUser } from '../../src/auth-types.js';
import type { PoolClient } from 'pg';

export type WithUser = <T>(user:AuthUser,fn:(client:PoolClient)=>Promise<T>)=>Promise<T>;
