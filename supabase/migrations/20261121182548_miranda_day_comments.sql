begin;

create table public.miranda_day_comments (
  id uuid primary key,
  agenda_day date not null check (agenda_day between date '2000-01-01' and date '2100-12-31'),
  body text not null check (char_length(body) between 1 and 2000 and body ~ '[^[:space:]]'),
  author_id uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  mentioned_user_id uuid references public.profiles(id),
  read_at timestamptz
);
create index miranda_day_comments_by_day on public.miranda_day_comments(agenda_day,created_at,id);
create index miranda_day_comments_unread on public.miranda_day_comments(mentioned_user_id,created_at,id)
  where mentioned_user_id is not null and read_at is null;

alter table public.miranda_day_comments enable row level security;
revoke all on public.miranda_day_comments from public,anon,authenticated;
grant select, insert(id,agenda_day,body), update(read_at) on public.miranda_day_comments to authenticated;
create policy agenda_comments_read on public.miranda_day_comments for select to authenticated
  using ((select public.can_manage_miranda_schedule()));
create policy agenda_comments_post on public.miranda_day_comments for insert to authenticated
  with check ((select public.can_manage_miranda_schedule()) and author_id=(select auth.uid()));
create policy agenda_comments_acknowledge on public.miranda_day_comments for update to authenticated
  using ((select public.can_manage_miranda_schedule()) and mentioned_user_id=(select auth.uid()) and read_at is null)
  with check ((select public.can_manage_miranda_schedule()) and mentioned_user_id=(select auth.uid()) and read_at is not null);

create function sculpy_private.agenda_comment_mention() returns trigger
language plpgsql security invoker set search_path='' as $$
declare peer_name text;
begin
  select case username when 'sculp_jz' then 'Miranda' when 'sculp_miranda' then 'JZ' end
    into peer_name from public.profiles where id=auth.uid();
  if new.body ~* ('(^|[^a-zA-Z0-9_.@＠])[@＠]' || peer_name || '([^a-zA-Z0-9_]|$)') then
    select id into new.mentioned_user_id from public.profiles where active and
      ((peer_name='Miranda' and username='sculp_miranda' and role='owner')
      or (peer_name='JZ' and username='sculp_jz' and role='operations'));
    if new.mentioned_user_id is null then
      raise exception 'Mention recipient unavailable' using errcode='22023';
    end if;
  end if;
  return new;
end $$;
revoke all on function sculpy_private.agenda_comment_mention() from public,anon,authenticated;
create trigger agenda_comment_mention before insert on public.miranda_day_comments
  for each row execute function sculpy_private.agenda_comment_mention();

notify pgrst,'reload schema';
commit;
