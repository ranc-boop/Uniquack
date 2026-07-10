-- Blueprint Library 0031 post-apply grant correction.
-- Use only if migration 0031 was already applied but live Blueprint Library smoke
-- fails while a real teacher inserts question_blueprint_folders/question_blueprints.
-- This file does not create, update, or delete application data.

grant select, insert, update, delete on public.question_blueprints to authenticated;
grant select, insert, update, delete on public.question_blueprint_folders to authenticated;
grant select, insert, update, delete on public.question_blueprint_examples to authenticated;
grant select, insert on public.question_blueprint_versions to authenticated;
grant select, insert, update, delete on public.question_blueprint_calibration_runs to authenticated;
grant select, insert, update, delete on public.bank_blueprints to authenticated;

grant execute on function private.can_read_question_blueprint(uuid) to authenticated;
grant execute on function private.can_manage_question_blueprint(uuid) to authenticated;
grant execute on function private.can_read_question_blueprint_folder(uuid) to authenticated;
grant execute on function private.can_manage_question_blueprint_folder(uuid) to authenticated;
