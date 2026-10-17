import { randomBytes,scrypt as scryptCallback,timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import express from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import type { RequestHandler } from 'express';
import { verifyServiceAssertion } from '../../src/insurance-service-gateway.js';
import { pool } from './db.js';

const scrypt=promisify(scryptCallback);
const authMode=process.env.ACCOUNTING_AUTH_MODE??'local';
const gatewaySecret=process.env.ACCOUNTING_GATEWAY_SECRET??'';
const jwtSecret=process.env.ACCOUNTING_JWT_SECRET??'';
if(!['local','gateway'].includes(authMode))throw new Error('ACCOUNTING_AUTH_MODE must be local or gateway');
if(authMode==='gateway'&&gatewaySecret.length<32)throw new Error('ACCOUNTING_GATEWAY_SECRET must contain at least 32 characters');
if(authMode==='local'&&jwtSecret.length<32)throw new Error('ACCOUNTING_JWT_SECRET must contain at least 32 characters in local auth mode');

export async function hashPassword(password:string):Promise<string>{
  const salt=randomBytes(16); const derived=await scrypt(password,salt,64) as Buffer; return `${salt.toString('hex')}:${derived.toString('hex')}`;
}
async function verifyPassword(password:string,stored:string):Promise<boolean>{
  const [saltHex,hashHex]=stored.split(':'); if(!saltHex||!hashHex)return false;
  const expected=Buffer.from(hashHex,'hex'); const actual=await scrypt(password,Buffer.from(saltHex,'hex'),expected.length) as Buffer;
  return expected.length===actual.length&&timingSafeEqual(expected,actual);
}

export const localAuthRouter=express.Router();
const credentials=z.object({email:z.string().trim().email().max(320),password:z.string().min(12).max(200)}).strict();
localAuthRouter.post('/bootstrap',async(req,res,next)=>{
  try{
    const input=credentials.extend({name:z.string().trim().min(2).max(160)}).strict().parse(req.body);
    const client=await pool.connect();
    try{
      await client.query('BEGIN'); await client.query("SELECT pg_advisory_xact_lock(hashtext('accounting-local-bootstrap'))");
      const count=Number((await client.query('SELECT count(*)::int AS n FROM accounting_local_users')).rows[0].n);
      if(count) {await client.query('ROLLBACK');res.status(409).json({error:'Local administrator is already initialized'});return;}
      const userId=(await client.query('INSERT INTO accounting_local_users(email,display_name,password_hash,platform_role) VALUES(lower($1),$2,$3,\'super_admin\') RETURNING id,email,display_name,platform_role',[input.email,input.name,await hashPassword(input.password)])).rows[0];
      await client.query('COMMIT'); const token=jwt.sign({sub:userId.id,role:userId.platform_role},jwtSecret,{algorithm:'HS256',expiresIn:'8h',issuer:'afrolife-accounting'});
      res.status(201).json({token,user:userId});
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }catch(error){next(error);}
});

localAuthRouter.post('/login',async(req,res,next)=>{
  try{
    const input=credentials.parse(req.body);
    const user=(await pool.query('SELECT id,email,display_name,platform_role,password_hash,active FROM accounting_local_users WHERE email=lower($1)',[input.email])).rows[0];
    if(!user||!user.active||!(await verifyPassword(input.password,user.password_hash))){res.status(401).json({error:'Invalid email or password'});return;}
    const token=jwt.sign({sub:user.id,role:user.platform_role},jwtSecret,{algorithm:'HS256',expiresIn:'8h',issuer:'afrolife-accounting'});
    res.json({token,user:{id:user.id,email:user.email,display_name:user.display_name,platform_role:user.platform_role}});
  }catch(error){next(error);}
});

export const authenticateAccounting:RequestHandler=(req,res,next)=>{
  if(authMode==='gateway'){
    const assertion=req.get('x-afrolife-identity')??''; const signature=req.get('x-afrolife-signature')??'';
    const user=verifyServiceAssertion(gatewaySecret,assertion,signature,req.method,req.originalUrl,req.body,Date.now(),req.get('idempotency-key')??null);
    if(!user){res.status(401).json({error:'Invalid or expired gateway identity assertion'});return;}
    req.user={id:user.userId,role:user.role}; next(); return;
  }
  const match=/^Bearer\s+(.+)$/i.exec(req.get('authorization')??'');
  if(!match){res.status(401).json({error:'Accounting session required'});return;}
  try{
    const claims=jwt.verify(match[1],jwtSecret,{algorithms:['HS256'],issuer:'afrolife-accounting'}) as jwt.JwtPayload;
    if(typeof claims.sub!=='string'||typeof claims.role!=='string')throw new Error('Invalid claims');
    req.user={id:claims.sub,role:claims.role};next();
  }catch{res.status(401).json({error:'Invalid or expired Accounting session'});}
};
