-- A staff account that can sign in on the customer side of every company to see
-- exactly what that customer sees - without appearing to them as a colleague.
--
-- Marking the account in one place rather than flagging each user_roles row
-- means adding a company later needs no extra bookkeeping, and removing the
-- observer is a single delete.

create table if not exists public.portal_observer_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);

-- No policies: this table is only ever read from SECURITY DEFINER functions
-- below (and by service_role). RLS on with zero policies denies everyone else.
alter table public.portal_observer_accounts enable row level security;

comment on table public.portal_observer_accounts is
  'Staff accounts holding customer-side seats for support/QA. Hidden from the '
  'team lists customers see; still fully visible to vibe admins.';

-- Who has access - observers filtered out for everyone except vibe admins, so
-- an admin auditing a company still sees the complete picture.
create or replace function public.company_team_members(p_company_id uuid)
returns table (user_id uuid, email text, role app_role)
language sql
stable
security definer
set search_path to 'public'
as $$
  select ur.user_id, au.email::text, ur.role
  from public.user_roles ur
  join auth.users au on au.id = ur.user_id
  where ur.company_id = p_company_id
    and (
      public.has_role(auth.uid(), 'vibe_admin'::app_role)
      or public.user_has_company_access(auth.uid(), p_company_id)
    )
    and (
      public.has_role(auth.uid(), 'vibe_admin'::app_role)
      or not exists (
        select 1 from public.portal_observer_accounts o where o.user_id = ur.user_id
      )
    )
  order by au.email
$$;

-- Same treatment for invitations, in case an observer is ever seated by invite
-- rather than by a direct grant.
create or replace function public.company_pending_invitations(p_company_id uuid)
returns table (
  id uuid,
  email text,
  role app_role,
  status text,
  created_at timestamptz,
  expires_at timestamptz,
  is_expired boolean
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select ci.id, ci.email, ci.role, ci.status, ci.created_at, ci.expires_at,
         ci.expires_at <= now() as is_expired
  from public.company_invitations ci
  where ci.company_id = p_company_id
    and ci.status = 'pending'
    and (
      public.has_role(auth.uid(), 'vibe_admin'::app_role)
      or public.user_has_company_access(auth.uid(), p_company_id)
    )
    and (
      public.has_role(auth.uid(), 'vibe_admin'::app_role)
      or not exists (
        select 1
        from public.portal_observer_accounts o
        join auth.users au on au.id = o.user_id
        where lower(au.email) = lower(ci.email)
      )
    )
  order by ci.created_at desc
$$;

revoke all on function public.company_team_members(uuid) from public, anon;
revoke all on function public.company_pending_invitations(uuid) from public, anon;
grant execute on function public.company_team_members(uuid) to authenticated;
grant execute on function public.company_pending_invitations(uuid) to authenticated;
