-- Let a company manage its own portal access.
--
-- Settings > Team already renders for customers, but every query behind it was
-- denied for a plain `company` user:
--
--   * user_roles SELECT is limited to `auth.uid() = user_id`, so the member list
--     only ever returned the viewer themselves - a company of one.
--   * company_invitations carries vibe_admin-only policies, so the Invite button
--     failed on INSERT and pending invites were never readable.
--
-- These are deliberately NOT fixed by opening the tables directly.
-- company_invitations.invitation_token is a bearer secret: a member who could
-- read the row could claim an invitation issued to somebody else, including one
-- a vibe admin raised at the `admin` role. So access goes through three
-- SECURITY DEFINER entry points gated on company membership, and the token is
-- returned only to the caller who creates the invitation.
--
-- user_has_company_access() is used rather than get_user_company(), which
-- LIMIT 1s and so picks an arbitrary company for anyone who belongs to several.

-- ---------------------------------------------------------------- who has access
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
  order by au.email
$$;

-- ------------------------------------------------------------ outstanding invites
-- invitation_token is deliberately absent from the projection.
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
  order by ci.created_at desc
$$;

-- ------------------------------------------------------------------ send an invite
-- Role is pinned to 'company' regardless of caller: a member must not be able to
-- mint an `admin` or `vibe_admin` seat for their own company.
create or replace function public.create_company_invitation(
  p_company_id uuid,
  p_email text
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_email text := lower(btrim(p_email));
  v_existing record;
  v_token text;
begin
  if auth.uid() is null then
    return json_build_object('success', false, 'error', 'Not authenticated');
  end if;

  if not (
    public.has_role(auth.uid(), 'vibe_admin'::app_role)
    or public.user_has_company_access(auth.uid(), p_company_id)
  ) then
    return json_build_object('success', false, 'error', 'You do not have access to this company');
  end if;

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return json_build_object('success', false, 'error', 'Enter a valid email address');
  end if;

  -- Already has a seat here? Nothing to send.
  if exists (
    select 1
    from public.user_roles ur
    join auth.users au on au.id = ur.user_id
    where ur.company_id = p_company_id
      and lower(au.email) = v_email
  ) then
    return json_build_object('success', false, 'error', 'That person already has access');
  end if;

  -- Reuse a live invite so repeat clicks don't pile up rows; refresh its clock
  -- so the link the caller walks away with is good for another week.
  select * into v_existing
  from public.company_invitations
  where company_id = p_company_id
    and lower(email) = v_email
    and status = 'pending'
  order by created_at desc
  limit 1;

  if found then
    update public.company_invitations
    set expires_at = now() + interval '7 days',
        invited_by = coalesce(invited_by, auth.uid()),
        updated_at = now()
    where id = v_existing.id
    returning invitation_token into v_token;

    return json_build_object(
      'success', true,
      'invitation_token', v_token,
      'email', v_email,
      'reused', true
    );
  end if;

  insert into public.company_invitations (company_id, email, role, invited_by, status)
  values (p_company_id, v_email, 'company'::app_role, auth.uid(), 'pending')
  returning invitation_token into v_token;

  return json_build_object(
    'success', true,
    'invitation_token', v_token,
    'email', v_email,
    'reused', false
  );
end;
$$;

revoke all on function public.company_team_members(uuid) from public;
revoke all on function public.company_pending_invitations(uuid) from public;
revoke all on function public.create_company_invitation(uuid, text) from public;

grant execute on function public.company_team_members(uuid) to authenticated;
grant execute on function public.company_pending_invitations(uuid) to authenticated;
grant execute on function public.create_company_invitation(uuid, text) to authenticated;
