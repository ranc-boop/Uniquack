alter table public.questions
  drop constraint if exists questions_question_type_check;

alter table public.questions
  add constraint questions_question_type_check
  check (question_type in ('mcq', 'fill_blank', 'frq', 'mixed'));

alter table public.questions
  add column if not exists answer_spec jsonb not null default '{}'::jsonb;

alter table public.questions
  add constraint questions_answer_spec_object_check
  check (jsonb_typeof(answer_spec) = 'object');

comment on column public.questions.answer_spec is
  'Structured answer metadata for deterministic or assisted grading. Use options for MCQ choices and answer_spec for correct option IDs, fill-blank accepted answers, tolerances, and grading mode.';
