-- Retain older audit history without preserving its retired provider identity.
update public.inbox_records set classification_method = 'legacy'
  where classification_method is not null
    and classification_method not in ('deterministic', 'groq', 'nvidia', 'cerebras');
update public.classification_decisions set method = 'legacy'
  where method not in ('groq', 'nvidia', 'cerebras');
update public.classification_runs set method = 'legacy'
  where method not in ('deterministic', 'groq', 'nvidia', 'cerebras');

alter table public.inbox_records drop constraint if exists inbox_records_classification_method_check;
alter table public.inbox_records add constraint inbox_records_classification_method_check
  check (classification_method in ('deterministic', 'groq', 'nvidia', 'cerebras', 'legacy'));

alter table public.classification_decisions drop constraint if exists classification_decisions_method_check;
alter table public.classification_decisions add constraint classification_decisions_method_check
  check (method in ('groq', 'nvidia', 'cerebras', 'legacy'));

alter table public.classification_runs drop constraint if exists classification_runs_method_check;
alter table public.classification_runs add constraint classification_runs_method_check
  check (method in ('deterministic', 'groq', 'nvidia', 'cerebras', 'legacy'));

comment on column public.classification_decisions.raw_model_output is
  'Provider response retained beside the reproducible final decision.';
