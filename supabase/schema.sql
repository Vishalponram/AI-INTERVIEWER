create table if not exists public.interviews (
  id uuid primary key,
  candidate_name text not null,
  role text not null,
  experience_level text not null,
  resume_name text not null,
  status text not null default 'IN_PROGRESS'
    check (status in ('IN_PROGRESS', 'COMPLETED', 'TERMINATED', 'ERROR')),
  total_score numeric(6, 2) not null default 0,
  evaluation_count integer not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.interview_messages (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references public.interviews(id) on delete cascade,
  speaker text not null check (speaker in ('AI', 'CANDIDATE')),
  text text not null,
  message_order integer not null,
  stage text,
  created_at timestamptz not null default now(),
  unique (interview_id, message_order)
);

create table if not exists public.interview_answers (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references public.interviews(id) on delete cascade,
  question_number integer not null,
  stage text not null,
  question text not null,
  answer text not null,
  evaluation_key text not null,
  follow_up_used boolean not null default false,
  score numeric(4, 2) not null default 0,
  relevance numeric(4, 2) not null default 0,
  technical_correctness numeric(4, 2) not null default 0,
  depth numeric(4, 2) not null default 0,
  clarity numeric(4, 2) not null default 0,
  completeness numeric(4, 2) not null default 0,
  decision text not null default 'PASS' check (decision in ('PASS', 'FAIL')),
  follow_up_required boolean not null default false,
  follow_up_question text not null default '',
  strengths jsonb not null default '[]'::jsonb,
  weaknesses jsonb not null default '[]'::jsonb,
  internal_summary text not null default '',
  evaluation_status text not null default 'PENDING'
    check (evaluation_status in ('PENDING', 'COMPLETED')),
  created_at timestamptz not null default now(),
  evaluated_at timestamptz,
  unique (interview_id, evaluation_key)
);

create table if not exists public.evaluations (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references public.interviews(id) on delete cascade,
  evaluation_key text not null,
  question text not null,
  answer text not null,
  score numeric(4, 2) not null default 0,
  relevance numeric(4, 2) not null default 0,
  technical_correctness numeric(4, 2) not null default 0,
  depth numeric(4, 2) not null default 0,
  clarity numeric(4, 2) not null default 0,
  completeness numeric(4, 2) not null default 0,
  decision text not null default 'PASS' check (decision in ('PASS', 'FAIL')),
  follow_up_required boolean not null default false,
  follow_up_question text not null default '',
  strengths jsonb not null default '[]'::jsonb,
  weaknesses jsonb not null default '[]'::jsonb,
  internal_summary text not null default '',
  created_at timestamptz not null default now(),
  unique (interview_id, evaluation_key)
);

create or replace function public.refresh_interview_score()
returns trigger
language plpgsql
as $$
begin
  update public.interviews
  set
    total_score = coalesce((
      select sum(score) from public.evaluations where interview_id = new.interview_id
    ), 0),
    evaluation_count = (
      select count(*) from public.evaluations where interview_id = new.interview_id
    )
  where id = new.interview_id;

  return new;
end;
$$;

drop trigger if exists evaluations_refresh_interview_score on public.evaluations;

create trigger evaluations_refresh_interview_score
after insert or update of score on public.evaluations
for each row execute function public.refresh_interview_score();
