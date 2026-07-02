-- Align clean provider profile constraints with the provider mode values used
-- by the current app UI. The app stores bounded adapter-mode identifiers in
-- ai_provider_profiles.provider, not only coarse provider family names.

alter table public.ai_provider_profiles
  drop constraint if exists ai_provider_profiles_provider_check;

alter table public.ai_provider_profiles
  add constraint ai_provider_profiles_provider_check
  check (
    provider in (
      'openai_compatible',
      'deepseek_openai',
      'gemini_openai',
      'gemini_native',
      'mock',
      'openai',
      'deepseek',
      'gemini',
      'compatible'
    )
  );
