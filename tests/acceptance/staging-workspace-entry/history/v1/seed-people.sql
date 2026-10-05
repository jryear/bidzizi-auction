-- Only synthetic people; no provider, membership import or real identity.
INSERT INTO bz_orgs(id,name,initials) VALUES
 ('10000000-0000-4000-8000-000000000001','Saturn Barter','SB'),
 ('10000000-0000-4000-8000-000000000002','Pine Street Exchange','PE');
INSERT INTO bz_people(id,alias,name,active,is_test) VALUES
 ('20000000-0000-4000-8000-000000000001','staff-saturn','Test Saturn Staff',true,true),
 ('20000000-0000-4000-8000-000000000002','staff-pine','Test Pine Staff',true,true),
 ('20000000-0000-4000-8000-000000000003','bidder-juniper','Test Juniper Bidder',true,true),
 ('20000000-0000-4000-8000-000000000004','bidder-harbor','Test Harbor Bidder',true,true),
 ('20000000-0000-4000-8000-000000000005','bidder-juniper-coworker','Test Juniper Coworker',true,true),
 ('20000000-0000-4000-8000-000000000006','bidder-member','Test Member Only',true,true),
 ('20000000-0000-4000-8000-000000000007','bidder-viewer','Test View Only',true,true),
 ('20000000-0000-4000-8000-000000000008','bidder-unlisted','Test Unlisted Person',true,true),
 ('20000000-0000-4000-8000-000000000009','bidder-pine','Test Pine Bidder',true,true),
 ('20000000-0000-4000-8000-000000000010','bidder-bid-only','Test Bid Only',true,true);
INSERT INTO bz_staff_grants(person_id,org_id,active) VALUES
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',true),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',true);
