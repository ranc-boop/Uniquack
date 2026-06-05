alter table public.questions
  add column if not exists content_source text,
  add column if not exists content_source_format text not null default 'html',
  add column if not exists solution_source text,
  add column if not exists solution_source_format text not null default 'html';

alter table public.questions
  drop constraint if exists questions_content_source_format_check,
  add constraint questions_content_source_format_check
    check (content_source_format in ('markdown_latex', 'html'));

alter table public.questions
  drop constraint if exists questions_solution_source_format_check,
  add constraint questions_solution_source_format_check
    check (solution_source_format in ('markdown_latex', 'html'));

update public.questions
set
  content_source = coalesce(content_source, content_html),
  content_source_format = coalesce(content_source_format, 'html'),
  solution_source = case
    when solution_source is not null then solution_source
    else solution_html
  end,
  solution_source_format = coalesce(solution_source_format, 'html')
where content_source is null
  or solution_source is null
  or content_source_format is null
  or solution_source_format is null;

comment on column public.questions.content_source is
  'Editable authoring source for the question content. Markdown + LaTeX source is preserved here while content_html stores the sanitized render output.';

comment on column public.questions.content_source_format is
  'Authoring source format for content_source: markdown_latex or html.';

comment on column public.questions.solution_source is
  'Editable authoring source for the solution. Markdown + LaTeX source is preserved here while solution_html stores the sanitized render output.';

comment on column public.questions.solution_source_format is
  'Authoring source format for solution_source: markdown_latex or html.';
