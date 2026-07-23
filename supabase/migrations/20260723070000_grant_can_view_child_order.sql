-- can_view_child_order is called inside the orders SELECT RLS policy but was
-- never granted to authenticated (unlike has_role / user_has_company_access).
-- Any non-admin whose query touched orders — e.g. the vendor portal's CPO
-- embed — failed with "permission denied for function can_view_child_order".

GRANT EXECUTE ON FUNCTION public.can_view_child_order(uuid, uuid) TO authenticated;
