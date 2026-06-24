# Current Taxonomy Architecture

`taxonomy_*` is now the official tag source of truth.

Five-facet tagging is the product structure inside that taxonomy: curriculum, concept, method, task, and form.

Legacy `tags`, `question_tags`, and `video_tags` tables are deprecated compatibility data and should not appear as the primary product UI.

Historical `five_facet_*` tables are compatibility-only unless a future PR explicitly reactivates them.

AI import and batch import should use active assignable taxonomy leaf IDs only.
