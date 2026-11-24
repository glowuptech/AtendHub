create or replace function public.atendhub_valid_cpf(_cpf text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  i integer;
  j integer;
  total integer;
  check_digit integer;
  digits text := coalesce(_cpf, '');
begin
  if digits !~ '^[0-9]{11}$' or digits ~ '^(.)\1{10}$' then return false; end if;
  for j in 9..10 loop
    total := 0;
    for i in 1..j loop
      total := total + substring(digits from i for 1)::integer * (j + 2 - i);
    end loop;
    check_digit := (total * 10) % 11;
    if check_digit = 10 then check_digit := 0; end if;
    if check_digit <> substring(digits from j + 1 for 1)::integer then return false; end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.atendhub_valid_cpf(text) from public, anon, authenticated;
