import { cp,mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const source=resolve('services/accounting/web');
const destination=resolve('dist/services/accounting/web');
await mkdir(destination,{recursive:true});
await cp(source,destination,{recursive:true,force:true});
await cp(resolve('public/accounting-operations.js'),resolve(destination,'operations.js'));
