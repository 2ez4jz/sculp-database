-- Deployment rollback: disable the new API and retain all task/audit history.
-- Apply only if V3 tasks have to be disabled; do not drop tables containing data.
revoke execute on function public.sculpy_crm_command(uuid,text,jsonb) from authenticated;
revoke execute on function sculpy_private.crm_command(uuid,text,jsonb) from authenticated;
-- Restore application code to the recorded previous commit separately.
-- Re-enable only after a fixed version and its role tests pass.
