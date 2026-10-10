import { createHash } from 'node:crypto';
import { Router, type Request, type Response, type RequestHandler } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import type { AuthUser } from '../../src/auth-types.js';
import { HttpError } from '../../src/http-error.js';
import { withUser } from './db.js';
import { assessEdirLoan, edirCreditPolicySchema } from './credit.js';
import { formatEdirMoney, parseEdirMoney } from './money.js';

const creditMakerRoles = ['edir_admin', 'credit_manager'];
const creditReaderRoles = [...creditMakerRoles, 'credit_officer', 'finance_manager', 'treasurer', 'compliance', 'auditor'];
const servicingMakerRoles = ['edir_admin', 'credit_manager', 'finance_manager', 'treasurer'];
const platformAdmin = (user: AuthUser) => user.role === 'global_admin' || user.role === 'super_admin';
const h = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res).catch(next); };

async function hasStaffRole(user: AuthUser, roles: string[], client?: PoolClient) {
  if (platformAdmin(user)) return true;
  const check = async (db: PoolClient) => Boolean((await db.query(
    `SELECT 1 FROM edir_staff
     WHERE user_id=$1 AND active AND role=ANY($2::text[])`,
    [user.id, roles],
  )).rowCount);
  return client ? check(client) : withUser(user, check);
}

function requireStaffRole(roles: string[], message: string): RequestHandler {
  return (req, _res, next) => hasStaffRole(req.user!, roles).then(
    (allowed) => next(allowed ? undefined : new HttpError(403, message)),
    next,
  );
}

async function audit(client: PoolClient, actorId: string, action: string, entityId: string, detail: unknown) {
  await client.query(
    `INSERT INTO edir_audit_logs (actor_id, action, entity, entity_id, new_value)
     VALUES ($1,$2,$3,$4,$5)`,
    [actorId, action, 'edir_credit_workflow', entityId, JSON.stringify(detail)],
  );
}

const money = z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/);
const positiveMoney = money.refine((amount) => parseEdirMoney(amount) > 0n);
const reason = z.string().trim().min(10).max(1000);

export const edirCreditRouter = Router();

edirCreditRouter.get('/me', h(async (req, res) => {
  const data = await withUser(req.user!, async (client) => {
    const member = (await client.query(
      `SELECT id,status,activated_at FROM edir_memberships WHERE user_id=$1`, [req.user!.id],
    )).rows[0] ?? null;
    if (!member) return { membership: null, applications: [] };
    const applications = (await client.query(
      `SELECT id,requested_principal::text,requested_term_months,purpose,status,credit_score,
              score_factors,decision_reason,accepted_at,created_at
       FROM edir_loan_applications WHERE member_id=$1 ORDER BY created_at DESC LIMIT 50`,
      [member.id],
    )).rows;
    return { membership: member, applications };
  });
  res.json(data);
}));

edirCreditRouter.get('/policies', h(async (req, res) => {
  const policies = await withUser(req.user!, async (client) => (await client.query(
    `SELECT id,version,status,policy,change_reason,created_by,approved_by,approved_at,review_reason,created_at
     FROM edir_credit_policy_versions ORDER BY version DESC LIMIT 100`,
  )).rows);
  res.json(policies);
}));

edirCreditRouter.post('/policies', requireStaffRole(creditMakerRoles, 'Edir credit policy setup access is required'), h(async (req, res) => {
  const body = z.object({ policy: edirCreditPolicySchema, change_reason: reason }).strict().parse(req.body);
  const result = await withUser(req.user!, async (client) => {
    const organizationId = req.user!.edir_id ?? '00000000-0000-4000-8000-000000000002';
    await client.query('SELECT pg_advisory_xact_lock(779816, hashtext($1))', [organizationId]);
    const pending = await client.query(
      `SELECT id FROM edir_credit_policy_versions WHERE status='pending'`,
    );
    if (pending.rowCount) throw new HttpError(409, 'Review or reject the pending Edir credit policy before submitting another');
    const version = Number((await client.query(
      `SELECT coalesce(max(version),0)+1 AS version FROM edir_credit_policy_versions`,
    )).rows[0].version);
    const policy = (await client.query(
      `INSERT INTO edir_credit_policy_versions (version,policy,change_reason,created_by)
       VALUES ($1,$2,$3,$4)
       RETURNING id,version,status,policy,change_reason,created_by,created_at`,
      [version, JSON.stringify(body.policy), body.change_reason, req.user!.id],
    )).rows[0];
    await audit(client, req.user!.id, 'edir_credit_policy_submitted', policy.id, {
      version, policy, change_reason: body.change_reason,
    });
    return policy;
  });
  res.status(201).json(result);
}));

edirCreditRouter.post('/policies/:policyId/decision', requireStaffRole(creditMakerRoles, 'Edir credit policy review access is required'), h(async (req, res) => {
  const policyId = z.string().uuid().parse(req.params.policyId);
  const body = z.object({ decision: z.enum(['approve', 'reject']), reason }).strict().parse(req.body);
  const policy = await withUser(req.user!, async (client) => {
    const pending = (await client.query(
      `SELECT * FROM edir_credit_policy_versions WHERE id=$1 AND status='pending' FOR UPDATE`, [policyId],
    )).rows[0];
    if (!pending) throw new HttpError(404, 'Pending Edir credit policy was not found');
    if (pending.created_by === req.user!.id) throw new HttpError(403, 'The policy author cannot review their own policy');
    if (body.decision === 'reject') {
      const rejected = (await client.query(
        `UPDATE edir_credit_policy_versions
         SET status='rejected',approved_by=$2,approved_at=now(),review_reason=$3
         WHERE id=$1 RETURNING id,version,status,policy,approved_by,approved_at,review_reason`,
        [policyId, req.user!.id, body.reason],
      )).rows[0];
      await audit(client, req.user!.id, 'edir_credit_policy_rejected', policyId, { version: pending.version, reason: body.reason });
      return rejected;
    }
    const validatedPolicy = edirCreditPolicySchema.parse(pending.policy);
    await client.query(`UPDATE edir_credit_policy_versions SET status='superseded' WHERE status='active'`);
    const active = (await client.query(
      `UPDATE edir_credit_policy_versions
       SET status='active',approved_by=$2,approved_at=now(),review_reason=$3
       WHERE id=$1 RETURNING id,version,status,policy,approved_by,approved_at,review_reason`,
      [policyId, req.user!.id, body.reason],
    )).rows[0];
    await audit(client, req.user!.id, 'edir_credit_policy_activated', policyId, {
      version: pending.version, policy: validatedPolicy, reason: body.reason,
    });
    return active;
  });
  res.json(policy);
}));

edirCreditRouter.get('/applications', requireStaffRole(creditReaderRoles, 'Edir credit application access is required'), h(async (req, res) => {
  const rows = await withUser(req.user!, async (client) => (await client.query(
    `SELECT a.id,a.member_id,m.member_number,m.full_name AS member_name,a.requested_principal::text,
            a.requested_term_months,a.purpose,a.monthly_income::text,a.monthly_expenses::text,a.monthly_debt::text,
            a.status,a.policy_version_id,a.credit_score,a.score_factors,a.scored_by,a.scored_at,
            a.decision_by,a.decision_at,a.decision_reason,a.accepted_at,a.created_by,a.created_at
     FROM edir_loan_applications a
     JOIN edir_memberships m ON m.id=a.member_id
     ORDER BY a.created_at DESC LIMIT 200`,
  )).rows);
  res.json(rows);
}));

edirCreditRouter.post('/applications', h(async (req, res) => {
  const body = z.object({
    requested_principal: positiveMoney,
    requested_term_months: z.number().int().min(1).max(360),
    purpose: z.string().trim().min(3).max(1000),
    monthly_income: positiveMoney,
    monthly_expenses: money,
    monthly_debt: money,
    idempotency_key: z.string().uuid(),
  }).strict().parse(req.body);
  const result = await withUser(req.user!, async (client) => {
    const member = (await client.query(
      `SELECT id,status,activated_at FROM edir_memberships WHERE user_id=$1 FOR UPDATE`, [req.user!.id],
    )).rows[0];
    if (!member || member.status !== 'active') throw new HttpError(403, 'An active Edir membership is required to request credit');
    const payloadHash = createHash('sha256').update([
      formatEdirMoney(parseEdirMoney(body.requested_principal)), body.requested_term_months, body.purpose.trim(),
      formatEdirMoney(parseEdirMoney(body.monthly_income)),
      formatEdirMoney(parseEdirMoney(body.monthly_expenses)),
      formatEdirMoney(parseEdirMoney(body.monthly_debt)),
    ].join('\n')).digest('hex');
    const replay = (await client.query(
      `SELECT id,payload_hash,status FROM edir_loan_applications
       WHERE created_by=$1 AND idempotency_key=$2`,
      [req.user!.id, body.idempotency_key],
    )).rows[0];
    if (replay) {
      if (replay.payload_hash !== payloadHash) throw new HttpError(409, 'Idempotency key was used for a different Edir credit application');
      return { application: replay, created: false };
    }
    const activePolicy = (await client.query(
      `SELECT policy FROM edir_credit_policy_versions WHERE status='active'`,
    )).rows[0];
    const openCount = Number((await client.query(
      `SELECT count(*) AS count FROM edir_loan_applications
       WHERE member_id=$1 AND status IN ('awaiting_policy','submitted','scored','approved','accepted')`,
      [member.id],
    )).rows[0].count);
    const maxApplications = activePolicy
      ? edirCreditPolicySchema.parse(activePolicy.policy).maximum_concurrent_applications
      : 1;
    if (openCount >= maxApplications) throw new HttpError(409, 'The Edir credit application limit has been reached');
    const activatedAt = new Date(member.activated_at).getTime();
    const membershipDays = Math.max(0, Math.floor((Date.now() - activatedAt) / 86400000));
    const status = activePolicy ? 'submitted' : 'awaiting_policy';
    const application = (await client.query(
      `INSERT INTO edir_loan_applications
       (member_id,requested_principal,requested_term_months,purpose,monthly_income,monthly_expenses,monthly_debt,
        status,created_by,idempotency_key,payload_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id,requested_principal::text,requested_term_months,purpose,status,created_at`,
      [member.id, body.requested_principal, body.requested_term_months, body.purpose.trim(),
        body.monthly_income, body.monthly_expenses, body.monthly_debt, status, req.user!.id,
        body.idempotency_key, payloadHash],
    )).rows[0];
    await audit(client, req.user!.id, 'edir_loan_application_submitted', application.id, {
      status, requested_principal: body.requested_principal, requested_term_months: body.requested_term_months,
      membership_days_at_submission: membershipDays,
    });
    return { application, created: true };
  });
  res.status(result.created ? 201 : 200).json(result.application);
}));

edirCreditRouter.post('/applications/:applicationId/assess', requireStaffRole(['edir_admin', 'credit_officer', 'credit_manager'], 'Edir credit assessment access is required'), h(async (req, res) => {
  const applicationId = z.string().uuid().parse(req.params.applicationId);
  const result = await withUser(req.user!, async (client) => {
    const application = (await client.query(
      `SELECT a.*,
              greatest(floor(extract(epoch FROM (now()-m.activated_at))/86400),0)::int AS membership_days_at_assessment
       FROM edir_loan_applications a
       JOIN edir_memberships m ON m.id=a.member_id
       WHERE a.id=$1 FOR UPDATE OF a`,
      [applicationId],
    )).rows[0];
    if (!application) throw new HttpError(404, 'Edir credit application was not found');
    if (!['awaiting_policy', 'submitted'].includes(application.status)) {
      throw new HttpError(409, 'Only a submitted application can be assessed');
    }
    if (application.created_by === req.user!.id) {
      throw new HttpError(403, 'The applicant cannot assess their own Edir credit request');
    }
    const activePolicy = (await client.query(
      `SELECT id,version,policy FROM edir_credit_policy_versions WHERE status='active'`,
    )).rows[0];
    if (!activePolicy) throw new HttpError(409, 'This Edir must independently approve a credit policy before underwriting applications');
    const policy = edirCreditPolicySchema.parse(activePolicy.policy);
    const balance = (await client.query(
      `SELECT coalesce(sum(l.credit-l.debit),0)::text AS balance
       FROM edir_member_accounts ma
       JOIN edir_financial_products p ON p.id=ma.product_id AND p.product_type='savings'
       JOIN edir_financial_journal_lines l ON l.member_account_id=ma.id
       JOIN edir_financial_journals j ON j.id=l.journal_id AND j.status='posted'
       WHERE ma.member_id=$1 AND ma.status='active'`,
      [application.member_id],
    )).rows[0].balance;
    const membershipDays = Number(application.membership_days_at_assessment);
    const assessment = assessEdirLoan({
      policy,
      requestedPrincipal: String(application.requested_principal),
      requestedTermMonths: Number(application.requested_term_months),
      monthlyIncome: String(application.monthly_income),
      monthlyExpenses: String(application.monthly_expenses),
      monthlyDebt: String(application.monthly_debt),
      savingsBalance: balance,
      membershipDays,
    });
    const scored = (await client.query(
      `UPDATE edir_loan_applications
       SET status='scored',policy_version_id=$2,credit_score=$3,score_factors=$4,scored_by=$5,scored_at=now()
       WHERE id=$1
       RETURNING id,status,policy_version_id,credit_score,score_factors,scored_by,scored_at`,
      [application.id, activePolicy.id, assessment.score, JSON.stringify(assessment.factors), req.user!.id],
    )).rows[0];
    await audit(client, req.user!.id, 'edir_loan_application_assessed', application.id, {
      policy_version: activePolicy.version, score: assessment.score, factors: assessment.factors,
      eligible: assessment.eligible,
    });
    return { ...scored, eligible: assessment.eligible, policy_version: activePolicy.version };
  });
  res.json(result);
}));

edirCreditRouter.post('/applications/:applicationId/decision', requireStaffRole(creditMakerRoles, 'Edir credit approval access is required'), h(async (req, res) => {
  const applicationId = z.string().uuid().parse(req.params.applicationId);
  const body = z.object({ decision: z.enum(['approve', 'reject']), reason }).strict().parse(req.body);
  const result = await withUser(req.user!, async (client) => {
    const application = (await client.query(
      `SELECT * FROM edir_loan_applications WHERE id=$1 AND status='scored' FOR UPDATE`, [applicationId],
    )).rows[0];
    if (!application) throw new HttpError(404, 'Scored Edir credit application was not found');
    if ([application.created_by, application.scored_by].includes(req.user!.id)) {
      throw new HttpError(403, 'The applicant and credit assessor cannot decide this application');
    }
    const policyRow = (await client.query(
      `SELECT policy FROM edir_credit_policy_versions WHERE id=$1 AND status IN ('active','superseded')`,
      [application.policy_version_id],
    )).rows[0];
    if (!policyRow) throw new HttpError(409, 'The approved policy used for scoring is unavailable');
    const policy = edirCreditPolicySchema.parse(policyRow.policy);
    const factors = z.object({
      affordability: z.number().int().min(0).max(100),
      savings: z.number().int().min(0).max(100),
      membership_tenure: z.number().int().min(0).max(100),
      debt_service_bps: z.number().int().nonnegative(),
      membership_days: z.number().int().nonnegative(),
    }).strict().parse(application.score_factors);
    const recomputedScore = Math.round(
      (factors.affordability * policy.scorecard.weights.affordability
        + factors.savings * policy.scorecard.weights.savings
        + factors.membership_tenure * policy.scorecard.weights.membership_tenure) / 100,
    );
    const otherOpenApplications = Number((await client.query(
      `SELECT count(*) AS count FROM edir_loan_applications
       WHERE member_id=$1 AND id<>$2
         AND status IN ('awaiting_policy','submitted','scored','approved','accepted')`,
      [application.member_id, application.id],
    )).rows[0].count);
    const withinPolicy = parseEdirMoney(String(application.requested_principal)) <= parseEdirMoney(policy.maximum_principal)
      && Number(application.requested_term_months) <= policy.maximum_tenor_months
      && factors.membership_days >= policy.minimum_membership_days
      && factors.debt_service_bps <= policy.maximum_debt_service_bps
      && factors.savings >= 100
      && otherOpenApplications < policy.maximum_concurrent_applications
      && recomputedScore === Number(application.credit_score)
      && recomputedScore >= policy.scorecard.minimum_score;
    const status = body.decision === 'approve' && withinPolicy ? 'approved' : body.decision === 'reject' ? 'rejected' : null;
    if (!status) throw new HttpError(409, 'The application does not satisfy the approved policy limits and cannot be approved');
    const updated = (await client.query(
      `UPDATE edir_loan_applications
       SET status=$2,decision_by=$3,decision_at=now(),decision_reason=$4
       WHERE id=$1
       RETURNING id,status,requested_principal::text,requested_term_months,decision_by,decision_at,decision_reason`,
      [application.id, status, req.user!.id, body.reason],
    )).rows[0];
    await audit(client, req.user!.id, `edir_loan_application_${status}`, application.id, {
      status, policy_version_id: application.policy_version_id, reason: body.reason,
    });
    return updated;
  });
  res.json(result);
}));

edirCreditRouter.post('/applications/:applicationId/accept', h(async (req, res) => {
  const applicationId = z.string().uuid().parse(req.params.applicationId);
  const body = z.object({
    accept: z.literal(true),
    savings_account_id: z.string().uuid(),
  }).strict().parse(req.body);
  const application = await withUser(req.user!, async (client) => {
    const row = (await client.query(
      `SELECT a.id,a.member_id,a.status,a.requested_principal::text,a.requested_term_months,
              a.policy_version_id,m.organization_id
       FROM edir_loan_applications a
       JOIN edir_memberships m ON m.id=a.member_id
       WHERE a.id=$1 AND m.user_id=$2 FOR UPDATE OF a`,
      [applicationId, req.user!.id],
    )).rows[0];
    if (!row) throw new HttpError(404, 'Edir loan offer was not found for this member');
    const existing = (await client.query(
      `SELECT loan.id,loan.status,loan.principal_amount::text,loan.term_months,
              loan.member_account_id,loan.principal_repaid::text,loan.disbursed_at
       FROM edir_loans loan WHERE loan.application_id=$1`,
      [applicationId],
    )).rows[0];
    if (existing) {
      if (existing.member_account_id !== body.savings_account_id) {
        throw new HttpError(409, 'This accepted Edir loan is already assigned to a different savings account');
      }
      return { ...row, loan: existing, created: false };
    }
    if (row.status !== 'approved') throw new HttpError(409, 'Only an approved Edir loan offer can be accepted');
    const acceptance = (await client.query(
      `INSERT INTO edir_loan_acceptances
         (application_id,member_id,member_account_id,accepted_by,consent_text)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING accepted_at`,
      [
        applicationId, row.member_id, body.savings_account_id, req.user!.id,
        `I accept ETB ${row.requested_principal} as an interest-free, fee-free principal-only loan for ${row.requested_term_months} months, disbursed only to my selected AfroLife Edir savings account.`,
      ],
    )).rows[0];
    const loan = (await client.query(
      `INSERT INTO edir_loans
         (organization_id,application_id,member_id,member_account_id,policy_version_id,
          principal_amount,term_months,accepted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id,status,principal_amount::text,term_months,member_account_id,
                 principal_repaid::text,disbursed_at`,
      [row.organization_id, applicationId, row.member_id, body.savings_account_id,
        row.policy_version_id, row.requested_principal, row.requested_term_months, acceptance.accepted_at],
    )).rows[0];
    await audit(client, req.user!.id, 'edir_loan_offer_accepted', applicationId, {
      requested_principal: row.requested_principal, requested_term_months: row.requested_term_months,
      member_account_id: body.savings_account_id, loan_id: loan.id,
    });
    return { ...row, status: 'accepted', accepted_at: acceptance.accepted_at, loan, created: true };
  });
  res.status(application.created === false ? 200 : 201).json(application);
}));

edirCreditRouter.get('/loans/me', h(async (req, res) => {
  const loans = await withUser(req.user!, async (client) => (await client.query(
    `SELECT loan.id,loan.application_id,loan.status,loan.principal_amount::text,
            loan.principal_repaid::text,(loan.principal_amount-loan.principal_repaid)::text AS outstanding_principal,
            loan.term_months,loan.accepted_at,loan.disbursed_at,loan.member_account_id,
            account.product_id,product.name AS savings_product_name,
            coalesce(installment_data.schedule,'[]'::jsonb) AS schedule,
            coalesce(operation_data.operations,'[]'::jsonb) AS operations
     FROM edir_loans loan
     JOIN edir_memberships member ON member.id=loan.member_id
     JOIN edir_member_accounts account ON account.id=loan.member_account_id
     JOIN edir_financial_products product ON product.id=account.product_id
     LEFT JOIN LATERAL (
       SELECT jsonb_agg(jsonb_build_object(
              'installment_no',installment.installment_no,'due_on',installment.due_on,
              'principal_due',installment.principal_due::text,'principal_paid',installment.principal_paid::text,
              'status',installment.status
            ) ORDER BY installment.installment_no) AS schedule
       FROM edir_loan_installments installment
       WHERE installment.loan_id=loan.id AND installment.organization_id=loan.organization_id
     ) installment_data ON true
     LEFT JOIN LATERAL (
       SELECT jsonb_agg(jsonb_build_object(
              'id',operation.id,'operation_type',operation.operation_type,'amount',operation.amount::text,
              'status',operation.status,'created_at',operation.created_at,'reviewed_at',operation.reviewed_at,
              'review_reason',operation.review_reason
            ) ORDER BY operation.created_at) AS operations
       FROM edir_loan_operations operation
       WHERE operation.loan_id=loan.id AND operation.organization_id=loan.organization_id
     ) operation_data ON true
     WHERE member.user_id=$1
     ORDER BY loan.accepted_at DESC`,
    [req.user!.id],
  )).rows);
  res.json(loans);
}));

edirCreditRouter.get('/loans', requireStaffRole(creditReaderRoles, 'Edir credit servicing access is required'), h(async (_req, res) => {
  const loans = await withUser(_req.user!, async (client) => (await client.query(
    `SELECT loan.id,loan.application_id,loan.member_id,member.member_number,member.full_name AS member_name,
            loan.status,loan.principal_amount::text,loan.principal_repaid::text,
            (loan.principal_amount-loan.principal_repaid)::text AS outstanding_principal,
            loan.term_months,loan.accepted_at,loan.disbursed_at,loan.member_account_id,
            coalesce(installment_data.schedule,'[]'::jsonb) AS schedule,
            coalesce(operation_data.operations,'[]'::jsonb) AS operations
     FROM edir_loans loan
     JOIN edir_memberships member ON member.id=loan.member_id
     LEFT JOIN LATERAL (
       SELECT jsonb_agg(jsonb_build_object(
              'installment_no',installment.installment_no,'due_on',installment.due_on,
              'principal_due',installment.principal_due::text,'principal_paid',installment.principal_paid::text,
              'status',installment.status
            ) ORDER BY installment.installment_no) AS schedule
       FROM edir_loan_installments installment
       WHERE installment.loan_id=loan.id AND installment.organization_id=loan.organization_id
     ) installment_data ON true
     LEFT JOIN LATERAL (
       SELECT jsonb_agg(jsonb_build_object(
              'id',operation.id,'operation_type',operation.operation_type,'amount',operation.amount::text,
              'status',operation.status,'created_by',operation.created_by,'reviewed_by',operation.reviewed_by,
              'created_at',operation.created_at,'reviewed_at',operation.reviewed_at,'review_reason',operation.review_reason
            ) ORDER BY operation.created_at) AS operations
       FROM edir_loan_operations operation
       WHERE operation.loan_id=loan.id AND operation.organization_id=loan.organization_id
     ) operation_data ON true
     ORDER BY loan.accepted_at DESC LIMIT 200`,
  )).rows);
  res.json(loans);
}));

async function requestLoanOperation(
  req: Request, loanId: string, operationType: 'disbursement' | 'repayment', amount: string,
  idempotencyKey: string,
) {
  const payloadHash = createHash('sha256')
    .update(JSON.stringify({ loan_id: loanId, operation_type: operationType, amount }))
    .digest('hex');
  return withUser(req.user!, async (client) => {
    const inserted = await client.query(
      `INSERT INTO edir_loan_operations
         (loan_id,operation_type,amount,idempotency_key,payload_hash,created_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (organization_id,created_by,idempotency_key) DO NOTHING
       RETURNING id`,
      [loanId, operationType, amount, idempotencyKey, payloadHash, req.user!.id],
    );
    const operation = (await client.query(
      `SELECT id,loan_id,operation_type,amount::text,status,created_by,reviewed_by,reviewed_at,
              review_reason,created_at,payload_hash
       FROM edir_loan_operations WHERE organization_id=$1 AND created_by=$2 AND idempotency_key=$3`,
      [req.user!.edir_id ?? '00000000-0000-4000-8000-000000000002', req.user!.id, idempotencyKey],
    )).rows[0];
    if (!operation) throw new HttpError(404, 'Edir loan was not found or is not available in this organization');
    if (operation.payload_hash !== payloadHash) {
      throw new HttpError(409, 'Idempotency key was already used for a different Edir loan operation');
    }
    delete operation.payload_hash;
    return { ...operation, created: Boolean(inserted.rowCount) };
  });
}

edirCreditRouter.post('/loans/:loanId/disbursements', requireStaffRole(servicingMakerRoles, 'Edir loan disbursement access is required'), h(async (req, res) => {
  const loanId = z.string().uuid().parse(req.params.loanId);
  const body = z.object({ amount: positiveMoney, idempotency_key: z.string().uuid() }).strict().parse(req.body);
  const operation = await requestLoanOperation(req, loanId, 'disbursement', body.amount, body.idempotency_key);
  res.status(operation.created ? 201 : 200).json(operation);
}));

edirCreditRouter.post('/loans/:loanId/repayments', h(async (req, res) => {
  const loanId = z.string().uuid().parse(req.params.loanId);
  const body = z.object({ amount: positiveMoney, idempotency_key: z.string().uuid() }).strict().parse(req.body);
  const operation = await requestLoanOperation(req, loanId, 'repayment', body.amount, body.idempotency_key);
  res.status(operation.created ? 201 : 200).json(operation);
}));

edirCreditRouter.post('/operations/:operationId/decision',
  requireStaffRole(servicingMakerRoles, 'Edir loan servicing review access is required'),
  h(async (req, res) => {
    const operationId = z.string().uuid().parse(req.params.operationId);
    const body = z.object({ decision: z.enum(['approved', 'rejected']), reason }).strict().parse(req.body);
    const operation = await withUser(req.user!, async (client) => {
      const current = (await client.query(
        `SELECT operation.*,loan.member_id,loan.application_id,loan.member_account_id,
                loan.principal_amount::text,loan.principal_repaid::text,loan.status AS loan_status
         FROM edir_loan_operations operation
         JOIN edir_loans loan ON loan.id=operation.loan_id AND loan.organization_id=operation.organization_id
         WHERE operation.id=$1 FOR UPDATE OF operation,loan`,
        [operationId],
      )).rows[0];
      if (!current) throw new HttpError(404, 'Edir loan operation was not found');
      if (current.created_by === req.user!.id) throw new HttpError(403, 'The operation maker cannot review the same operation');
      if (current.status !== 'pending') throw new HttpError(409, 'This Edir loan operation has already been reviewed');
      if (body.decision === 'approved' && current.operation_type === 'disbursement'
          && (current.loan_status !== 'accepted'
            || parseEdirMoney(String(current.amount)) !== parseEdirMoney(current.principal_amount))) {
        throw new HttpError(409, 'Only the full accepted Edir loan principal can be disbursed once');
      }
      if (body.decision === 'approved' && current.operation_type === 'repayment') {
        const outstanding = parseEdirMoney(current.principal_amount) - parseEdirMoney(current.principal_repaid);
        if (current.loan_status !== 'disbursed' || parseEdirMoney(String(current.amount)) > outstanding) {
          throw new HttpError(409, 'The requested repayment exceeds the outstanding Edir loan principal');
        }
        const account = (await client.query(
          `SELECT edir_loan_account_balance(account.id)::text AS balance,
                  account.status AS account_status,product.status AS product_status,
                  product.minimum_balance::text
           FROM edir_member_accounts account
           JOIN edir_financial_products product
             ON product.id=account.product_id AND product.organization_id=account.organization_id
           WHERE account.id=$1 AND account.organization_id=$2 AND account.member_id=$3`,
          [current.member_account_id, req.user!.edir_id ?? '00000000-0000-4000-8000-000000000002', current.member_id],
        )).rows[0];
        if (!account || account.account_status !== 'active' || account.product_status !== 'active'
            || parseEdirMoney(account.balance) - parseEdirMoney(String(current.amount))
              < parseEdirMoney(account.minimum_balance)) {
          throw new HttpError(409, 'The selected Edir savings account has insufficient available balance for repayment');
        }
      }
      const updated = (await client.query(
        `UPDATE edir_loan_operations
         SET status=$2,reviewed_by=$3,reviewed_at=now(),review_reason=$4
         WHERE id=$1
         RETURNING id,loan_id,operation_type,amount::text,status,created_by,reviewed_by,reviewed_at,review_reason`,
        [operationId, body.decision, req.user!.id, body.reason],
      )).rows[0];
      let journalId: string | null = null;
      if (body.decision === 'approved') {
        const mapping = (await client.query(
          `SELECT receivable.id AS loan_ledger_id,product.ledger_account_id AS savings_ledger_id
           FROM edir_loans loan
           JOIN edir_member_accounts account ON account.id=loan.member_account_id
             AND account.organization_id=loan.organization_id
           JOIN edir_financial_products product ON product.id=account.product_id
             AND product.organization_id=account.organization_id
           JOIN edir_ledger_accounts receivable ON receivable.organization_id=loan.organization_id
             AND receivable.code='1300' AND receivable.active
           WHERE loan.id=$1`,
          [updated.loan_id],
        )).rows[0];
        if (!mapping) throw new HttpError(503, 'Required Edir savings or loan receivable ledger mappings are unavailable');
        journalId = (await client.query(
          `INSERT INTO edir_loan_journals (operation_id,amount)
           VALUES ($1,$2) RETURNING id`,
          [updated.id, updated.amount],
        )).rows[0].id;
        const isDisbursement = updated.operation_type === 'disbursement';
        const journalLines = isDisbursement
          ? [
            [mapping.loan_ledger_id, null, updated.amount, '0'],
            [mapping.savings_ledger_id, current.member_account_id, '0', updated.amount],
          ]
          : [
            [mapping.savings_ledger_id, current.member_account_id, updated.amount, '0'],
            [mapping.loan_ledger_id, null, '0', updated.amount],
          ];
        for (const [ledgerId, accountId, debit, credit] of journalLines) {
          await client.query(
            `INSERT INTO edir_loan_journal_lines
               (journal_id,ledger_account_id,member_account_id,debit,credit)
             VALUES ($1,$2,$3,$4,$5)`,
            [journalId, ledgerId, accountId, debit, credit],
          );
        }
        await client.query(
          `UPDATE edir_loan_journals SET status='posted',posted_by=$2,posted_at=now() WHERE id=$1`,
          [journalId, req.user!.id],
        );
      }
      await audit(client, req.user!.id, `edir_loan_${updated.operation_type}_${body.decision}`, operationId, {
        loan_id: updated.loan_id, amount: updated.amount, reason: body.reason, journal_id: journalId,
      });
      return { ...updated, journal_id: journalId };
    });
    res.json(operation);
  }),
);
