-- Tighten the collection-sharing SECURITY DEFINER functions: Postgres
-- grants EXECUTE to PUBLIC by default when a function is created in an
-- exposed schema. anon/authenticated already have explicit EXECUTE
-- grants (see the baseline migration) and are the only roles that should
-- be able to call these, so revoke the redundant PUBLIC grant.
--
-- Flagged by `supabase db advisors --type security`
-- (anon_security_definer_function_executable /
-- authenticated_security_definer_function_executable) and tracked as a
-- Medium follow-up in the 2026-08-27 supabase-security-scanner audit.
-- See docs/collection-sharing.md and docs/data-model.md.

revoke execute on function public.get_shared_collection (uuid) from public;
revoke execute on function public.get_shared_collection_notes (uuid) from public;
