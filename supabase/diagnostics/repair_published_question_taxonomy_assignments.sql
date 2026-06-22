-- One-time repair for development/admin use.
-- Publishes may have moved questions from draft to published before their
-- imported taxonomy assignments were approved. Public/search paths only use
-- approved assignments, so those tags can look missing after publish.

update public.question_taxonomy_assignments assignment
set
  approved_at = coalesce(assignment.approved_at, now()),
  review_status = 'approved',
  updated_at = now()
from public.questions question
where question.id = assignment.question_id
  and question.status = 'published'
  and assignment.review_status in ('pending_review', 'needs_review');

select
  question_id,
  count(*) as approved_assignment_count
from public.question_taxonomy_assignments
where review_status = 'approved'
group by question_id
order by approved_assignment_count desc;
