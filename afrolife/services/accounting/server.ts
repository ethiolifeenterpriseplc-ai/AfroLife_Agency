import '../../src/env.js';
import express from 'express';
import { join } from 'node:path';
import { HttpError } from '../../src/http-error.js';
import { correlationIdMiddleware,getCorrelationId } from '../../src/request-context.js';
import { authenticateAccounting, localAuthRouter } from './auth.js';
import { authenticateIngest,createIngestHandler } from './ingest.js';
import { pool,withUser,assertServiceDatabaseSafety } from './db.js';
import { createAccountingRouter } from './router.js';

const app=express();
app.use(correlationIdMiddleware);
app.use(express.json({limit:'100kb'}));
app.get('/healthz',async(_req,res,next)=>{try{await pool.query('SELECT 1');res.json({ok:true,service:'accounting',database:'connected'});}catch(error){next(error);}});
if(process.env.ACCOUNTING_AUTH_MODE==='local')app.use(express.static(join(import.meta.dirname,'web')));
if(process.env.ACCOUNTING_AUTH_MODE==='local') app.use('/api/v1/accounting/auth',localAuthRouter);
const ingestHandler=createIngestHandler(withUser);
app.post('/api/v1/accounting/internal/events',authenticateIngest,(req,res,next)=>{ingestHandler(req,res).catch(next);});
app.use('/api/v1/accounting',authenticateAccounting,createAccountingRouter(withUser));
app.use((error:unknown,req:express.Request,res:express.Response,_next:express.NextFunction)=>{
  const id=getCorrelationId(req); const send=(status:number,body:Record<string,unknown>)=>res.status(status).json({...body,correlation_id:id});
  if(error instanceof HttpError)return send(error.status,{error:error.message});
  if(error instanceof Error&&'flatten' in error&&typeof error.flatten==='function')return send(400,{error:'Invalid input',details:error.flatten()});
  if(typeof error==='object'&&error!==null&&'code' in error){const code=error.code;
    if(code==='22P02')return send(400,{error:'Invalid id or value'});
    if(code==='23505')return send(409,{error:'Duplicate record'});
    if(code==='P0001'||code==='23514')return send(422,{error:error instanceof Error?error.message:'Invalid accounting transition'});
  }
  console.error(`Accounting service request failed [${id}]`,error);return send(500,{error:'Internal error'});
});
const port=Number(process.env.PORT??3301);
await assertServiceDatabaseSafety();
const server=app.listen(port,process.env.HOST??'0.0.0.0',()=>console.log(`Accounting service listening on ${port}`));
for(const signal of ['SIGTERM','SIGINT'] as const)server.once(signal,()=>server.close(()=>pool.end().finally(()=>process.exit(0))));
