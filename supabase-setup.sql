create table if not exists public.weekly_availability (
  weekday smallint primary key check (weekday between 0 and 6),
  is_open boolean not null default false
);

insert into public.weekly_availability (weekday, is_open)
select day_number, false
from generate_series(0, 6) as day_number
on conflict (weekday) do nothing;

alter table public.weekly_availability enable row level security;

drop policy if exists "Anyone can view weekly availability" on public.weekly_availability;
create policy "Anyone can view weekly availability"
  on public.weekly_availability for select
  to anon, authenticated
  using (true);

drop policy if exists "Only the shop owner can update availability" on public.weekly_availability;
create policy "Only the shop owner can update availability"
  on public.weekly_availability for update
  to authenticated
  using ((auth.jwt() ->> 'email') = 'Mauriciodanielriveracruz@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'Mauriciodanielriveracruz@gmail.com');

grant select on public.weekly_availability to anon, authenticated;
grant update on public.weekly_availability to authenticated;
