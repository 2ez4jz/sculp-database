-- Real public team profiles only. No login accounts or private employee data.
insert into public.artists (slug,name,level,bio,specialties,employment_status) values
('miranda','Miranda','Signature Artist / Founder','Editorial perspective shaped by fashion, celebrity beauty, and luxury bridal work.',array['Editorial','Luxury Bridal','Destination'],'profile_only'),
('yuki','Yuki','Director Artist','Technical bridal expertise with education and entrepreneurship experience.',array['Bridal','Education','Technical'],'profile_only'),
('mira','Mira','Director Artist','Modern bridal beauty with a focus on New Chinese Style.',array['Modern Bridal','New Chinese Style'],'profile_only'),
('angelina','Angelina','Senior Artist','Modern Korean-inspired bridal, editorial, and commercial beauty.',array['Korean-inspired','Bridal','Editorial'],'profile_only'),
('elaine','Elaine','Senior Artist','Soft and modern bridal, portrait, and special-event styling.',array['Bridal','Portrait','Event'],'profile_only'),
('emily','Emily','Senior Artist','Fresh and polished beauty shaped around the client.',array['Fresh','Polished','Personalized'],'profile_only'),
('michelle','Michelle','Senior Artist','Refined and balanced beauty with a calm, attentive approach.',array['Refined','Balanced','Personalized'],'profile_only'),
('giselle','Giselle','Senior Artist','Soft glam and fashion-led Western and Thai-inspired beauty.',array['Soft Glam','Western','Thai-inspired'],'profile_only')
on conflict (slug) do update set name=excluded.name,level=excluded.level,bio=excluded.bio,specialties=excluded.specialties;

insert into public.artists (slug,name,level,bio,specialties,employment_status,member_type) values
('jz','Jz','Operations & Product / Administrator','Operations systems, data structure, workflow design, and product development.',array['Operations','Product','Data'],'profile_only','operations')
on conflict (slug) do update set name=excluded.name,level=excluded.level,bio=excluded.bio,specialties=excluded.specialties,member_type=excluded.member_type;

insert into public.services (code,name,default_price_cad) values
('wedding','Wedding Day Styling',null),
('trial','Wedding Trial',null),
('event','Event Styling',350),
('personal','Personal Styling',450),
('commercial','Commercial Beauty',550),
('photoshoot','Photoshoot Styling',null),
('education','Education',null)
on conflict (code) do update set name=excluded.name,default_price_cad=excluded.default_price_cad;
