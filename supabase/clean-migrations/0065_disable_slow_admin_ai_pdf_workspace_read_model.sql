-- Forward safety correction for 0063/0064.
--
-- Hosted RLS validation showed that this aggregate read model can exceed the
-- navigation latency budget. Keep the function unavailable to browser roles;
-- the application continues to use its bounded parallel table queries.

revoke execute on function public.get_admin_ai_pdf_workspace_v1(text)
  from authenticated;

comment on function public.get_admin_ai_pdf_workspace_v1(text) is
  'Disabled by 0065 after hosted RLS latency validation exceeded the navigation budget; browser code uses bounded parallel queries.';
