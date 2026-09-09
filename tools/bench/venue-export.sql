-- Companion to venue-translate-audit.mjs. Two exports, run against the venues table.
-- Both are deliberately compact: 9,000-odd venues will not fit in an agent's context as JSON,
-- and neither export needs to be read by a human — the audit script parses them.
--
-- The boxes are the baked island outlines inverted back to lat/lng and padded 300 m. Selection is
-- by COORDINATE, never by area_clean, because area_clean is one of the fields a bad record gets
-- wrong and using it would hide exactly the venues worth finding.

-- 1. positions: "id,latE5,lngE5" where latE5 = round((lat - 24) * 1e5), about 1.1 m per unit.
with box(la0, la1, lo0, lo1) as (values
  (24.3937, 24.5439, 54.2971, 54.4910),   -- corniche (the whole main island)
  (24.4885, 24.5158, 54.3833, 54.3984),   -- maryah
  (24.4693, 24.5157, 54.3880, 54.4294),   -- reem
  (24.5015, 24.5905, 54.3902, 54.4804),   -- saadiyat
  (24.4508, 24.5221, 54.5688, 54.6372),   -- yas
  (24.4333, 24.4563, 54.5631, 54.6142)),  -- raha
hit as (select distinct v.id, v.lat, v.lng from venues v join box b
          on v.lat between b.la0 and b.la1 and v.lng between b.lo0 and b.lo1)
select string_agg(id || ',' || round((lat-24)*100000) || ',' || round((lng-54)*100000),
                  chr(10) order by id) as rows
from hit;

-- 2. names: "id<TAB>name<TAB>address<TAB>data_source<TAB>category" for the same ids. The audit
--    needs these to tell an indoor venue from a beach, a marina or a jet-ski operator, which must
--    not be judged by their distance to a building.
with box(la0, la1, lo0, lo1) as (values
  (24.3937, 24.5439, 54.2971, 54.4910), (24.4885, 24.5158, 54.3833, 54.3984),
  (24.4693, 24.5157, 54.3880, 54.4294), (24.5015, 24.5905, 54.3902, 54.4804),
  (24.4508, 24.5221, 54.5688, 54.6372), (24.4333, 24.4563, 54.5631, 54.6142)),
hit as (select distinct v.id from venues v join box b
          on v.lat between b.la0 and b.la1 and v.lng between b.lo0 and b.lo1)
select string_agg(
         v.id || chr(9) || replace(coalesce(v.name,''), chr(9), ' ')
              || chr(9) || replace(coalesce(v.address,''), chr(9), ' ')
              || chr(9) || coalesce(v.data_source,'?')
              || chr(9) || coalesce(v.category,''),
         chr(10) order by v.id) as rows
from venues v join hit h on h.id = v.id;
