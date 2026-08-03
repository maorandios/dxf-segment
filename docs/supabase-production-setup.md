# Supabase production setup — OMEGA / SEGMENT Invite-Only OTP + Credits v1

Do **not** put secrets in this document or in git.

## 1. Vercel environment variables

Set for **Production** and **Preview** (and copy into local `.env.local`):

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://eebudcxiknuanxmbqhxm.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Prefer publishable key from Supabase Dashboard → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Legacy fallback only if publishable key is unavailable |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only. Never use `NEXT_PUBLIC_*`. Never commit. |

Redeploy after changing env vars.

## 2. Run the migration

Apply:

`supabase/migrations/20260803120000_omega_users_auth_credits.sql`

via Supabase SQL Editor or CLI (`supabase db push` / migrate).

Confirm tables:

- `public.omega_users`
- `public.omega_credit_ledger`

## 3. Verify RLS

- RLS enabled on both tables
- Authenticated users can `SELECT` only their own active `omega_users` row (`auth.uid() = auth_user_id`)
- No client `INSERT` / unrestricted `UPDATE` / `DELETE` on credits or status
- Company updates go through `update_omega_company_profile`

## 4. Auth URLs

Supabase Dashboard → Authentication → URL Configuration:

- **Site URL**: production app origin (e.g. `https://segment.getsegments.co` or the Vercel URL)
- **Redirect URLs**: production origin, Vercel preview origins, `http://localhost:3000`

OTP login does **not** require a clickable magic link; redirect URLs still matter for session cookies.

## 5. OTP email template (six-digit code — not Magic Link)

Authentication → Email Templates → Magic Link (used for Email OTP):

```html
<h2>קוד הכניסה שלך ל-OMEGA</h2>
<p>הזן את הקוד הבא באפליקציה:</p>
<p style="font-size:32px;font-weight:700;letter-spacing:8px;">
  {{ .Token }}
</p>
<p>אם לא ביקשת להתחבר, ניתן להתעלם מהודעה זו.</p>
```

Do **not** make `{{ .ConfirmationURL }}` the primary login action.

Also enable Email OTP / disable password signup in Auth providers as appropriate for invite-only.

**Disable Confirm email** (required for OTP-only login):

Authentication → Providers → Email → **Confirm email** → **OFF**

If Confirm email stays ON, first-time Auth users may receive a signup-confirmation
message before the 6-digit code. The app also pre-creates a confirmed Auth user
for allowlisted emails so OTP is sent without a confirmation step — but turn
Confirm email off in the Dashboard as well.

## 6. Production SMTP

Configure custom SMTP in Supabase Auth settings for reliable delivery.

Do **not** store SMTP credentials in source control.

## 7. Before User Created Hook (required)

The migration creates `public.hook_allow_omega_user(jsonb)`.

You must enable it in the Dashboard:

**Authentication → Hooks → Before User Created → select `public.hook_allow_omega_user`**

Without this, a direct Auth API call could create users outside the UI precheck.

Rejected message:

`כתובת הדוא"ל אינה רשומה במערכת`

## 8. Monthly credit renewal Cron (UTC)

Credit periods use **UTC** calendar months.

Enable `pg_cron` (or Supabase Scheduled Functions) and schedule:

```sql
select cron.schedule(
  'omega-monthly-credit-renewal',
  '15 0 1 * *',
  $$ select public.renew_permanent_user_credits(); $$
);
```

Runs shortly after midnight UTC on the 1st of each month.

Also call `ensure_current_credit_period()` during authenticated profile load / credit consumption so a delayed Cron cannot leave a permanent user on the previous month.

## 9. Manual user provisioning (no admin UI)

### Trial user (expects `credits_balance = 10`)

```sql
insert into public.omega_users (
  email,
  company_name,
  company_registration_number,
  address,
  phone,
  contact_name,
  account_status
)
values (
  lower(trim('customer@example.com')),
  'Example Company',
  '515000000',
  'Company address',
  '0500000000',
  'Contact Name',
  'trial'
);
```

### Permanent user (expects `credits_balance = 500`)

```sql
insert into public.omega_users (
  email,
  company_name,
  company_registration_number,
  address,
  phone,
  contact_name,
  account_status
)
values (
  lower(trim('customer@example.com')),
  'Example Company',
  '515000000',
  'Company address',
  '0500000000',
  'Contact Name',
  'permanent'
);
```

### Convert trial → permanent (expects reset to 500)

```sql
update public.omega_users
set account_status = 'permanent'
where email = lower(trim('customer@example.com'));
```

### Disable access

```sql
update public.omega_users
set is_active = false
where email = lower(trim('customer@example.com'));
```

Do **not** manually insert into `auth.users`. First OTP login creates the Auth user; the DB trigger links `auth_user_id`.

## 10. Acceptance checklist

- [ ] Env vars set on Vercel Production + Preview + `.env.local`
- [ ] Migration applied
- [ ] RLS verified
- [ ] Site URL + redirect URLs configured
- [ ] OTP email template uses `{{ .Token }}`
- [ ] Production SMTP configured
- [ ] Before User Created Hook enabled
- [ ] Monthly Cron scheduled (UTC)
- [ ] First manual allowlisted user inserted
- [ ] First-time OTP login works
- [ ] `auth_user_id` linked on `omega_users`
- [ ] Trial = 10 credits; permanent = 500; renewal date correct
- [ ] Unauthorized email rejected with Hebrew message
- [ ] New quotation analysis consumes 1 credit; save/open/export do not
- [ ] No quotation / DXF / `.segment` data in Supabase

## Boundaries

Supabase stores: authentication, profile, account status, credits, credit ledger.

Supabase must **not** store: quotation projects, PDF/Excel material lists, DXF files, AI results, nesting, pricing drafts, or `.segment` / `.omega` project files.

## Credit refund policy

1. Consume exactly one credit immediately before the paid AI provider call (idempotent key `quotation-analysis:{runId}:{runId}`).
2. If the provider request **definitively fails before a usable analysis result**, refund automatically via `refund_quotation_credit` with the same consume key.
3. Retries after ambiguous timeouts reuse the same idempotency key (charge once).
