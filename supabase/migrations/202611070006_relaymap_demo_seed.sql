-- RelayMap migration 6: idempotent synthetic demo seed.
--
-- This migration defines a function only. It never runs automatically and it
-- refuses to seed unless the caller is an organisation admin/manager.
-- Invoke explicitly, for example:
--   select public.seed_relaymap_demo('<profile-uuid>', '<organisation-uuid>');
-- Remove with:
--   delete from public.projects where id = '11111111-1111-4111-8111-111111111111';
begin;

create or replace function public.seed_relaymap_demo(
  p_owner uuid,
  p_organization uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_id constant uuid := '11111111-1111-4111-8111-111111111111';
  src_github constant uuid := '22222222-2222-4222-8222-222222222201';
  src_meeting constant uuid := '22222222-2222-4222-8222-222222222202';
  src_chat constant uuid := '22222222-2222-4222-8222-222222222203';
  src_tasks constant uuid := '22222222-2222-4222-8222-222222222204';
  src_finance constant uuid := '22222222-2222-4222-8222-222222222205';
  github_text text;
  meeting_text text;
  chat_text text;
  tasks_text text;
  finance_text text;
begin
  if not exists (
    select 1 from public.organization_members m
    where m.organization_id = p_organization
      and m.user_id = p_owner
      and m.role in ('admin','manager')
  ) then
    raise exception 'Only an organisation admin or manager can seed the synthetic demo';
  end if;

  if exists (select 1 from public.projects where id = project_id) then
    return project_id;
  end if;

  github_text := E'# CampusConnect README\n\nDeployment target: Vercel.\n\n## Ownership\n\nAarav maintains the deployment workflow.\n\nIssue #42: Reconcile rider alerts before the pilot.';
  meeting_text := E'# Pilot readiness meeting\n\nDecision: We moved the production deployment to Netlify for the pilot.\n\nThe team selected the new route importer, but the meeting notes do not record why.\n\nAarav is currently the only person who knows the bus-map import process.';
  chat_text := E'Meera: Can someone own rider-alert reconciliation?\nRiya: I can review it after the pilot.\nAarav: I will document the route import steps this week.';
  tasks_text := E'CC-42 · Reconcile rider alerts · Status: Open · Assignee: Unassigned\nCC-31 · Document route import · Status: In progress · Assignee: Aarav\nCC-38 · Confirm production deployment target · Status: Open · Assignee: Meera\nCC-44 · Add backup owner for route operations · Status: Open · Assignee: Unassigned';
  finance_text := E'SYNTHETIC DEMO ONLY - not real sponsor data.\nSample sponsor budget: $18,400.\nFictional demo contact: +1 (202) 555-0147.';

  insert into public.projects(
    id, organization_id, name, description, owner_id, status
  ) values (
    project_id, p_organization,
    'CampusConnect rider experience',
    'Synthetic CampusConnect pilot preparing a role-aware handover. All records are fictional.',
    p_owner, 'active'
  );

  insert into public.project_members(project_id, user_id, role, joined_at)
    values(project_id, p_owner, 'lead', now())
    on conflict on constraint project_members_project_id_user_id_key
    do update set role = 'lead';

  insert into public.sources(
    id, project_id, source_type, filename, content, access_level,
    uploaded_by, processing_status, content_hash, size_bytes,
    extraction_status, is_synthetic
  ) values
    (src_github, project_id, 'markdown', 'CampusConnect-GitHub-export.md',
      github_text, 'project', p_owner, 'processed',
      'sha256:' || encode(pg_catalog.sha256(convert_to(github_text, 'UTF8')), 'hex'),
      length(github_text), 'parsed', true),
    (src_meeting, project_id, 'meeting', 'pilot-readiness-meeting.md',
      meeting_text, 'project', p_owner, 'processed',
      'sha256:' || encode(pg_catalog.sha256(convert_to(meeting_text, 'UTF8')), 'hex'),
      length(meeting_text), 'parsed', true),
    (src_chat, project_id, 'chat', 'campusconnect-chat.txt',
      chat_text, 'project', p_owner, 'processed',
      'sha256:' || encode(pg_catalog.sha256(convert_to(chat_text, 'UTF8')), 'hex'),
      length(chat_text), 'parsed', true),
    (src_tasks, project_id, 'task_board', 'pilot-launch-tasks.csv',
      tasks_text, 'project', p_owner, 'processed',
      'sha256:' || encode(pg_catalog.sha256(convert_to(tasks_text, 'UTF8')), 'hex'),
      length(tasks_text), 'parsed', true),
    (src_finance, project_id, 'text', 'sponsor-commitment-restricted.txt',
      finance_text, 'finance', p_owner, 'processed',
      'sha256:' || encode(pg_catalog.sha256(convert_to(finance_text, 'UTF8')), 'hex'),
      length(finance_text), 'parsed', true);

  insert into public.source_chunks(
    id, source_id, project_id, chunk_index, page_number, section_title,
    content, char_start, char_end, content_hash
  ) values
    ('44444444-4444-4444-8444-444444444401', src_github, project_id, 0, null,
      'Document', github_text, 0, length(github_text),
      'sha256:' || encode(pg_catalog.sha256(convert_to(github_text, 'UTF8')), 'hex')),
    ('44444444-4444-4444-8444-444444444402', src_meeting, project_id, 0, null,
      'Document', meeting_text, 0, length(meeting_text),
      'sha256:' || encode(pg_catalog.sha256(convert_to(meeting_text, 'UTF8')), 'hex')),
    ('44444444-4444-4444-8444-444444444403', src_chat, project_id, 0, null,
      'Document', chat_text, 0, length(chat_text),
      'sha256:' || encode(pg_catalog.sha256(convert_to(chat_text, 'UTF8')), 'hex')),
    ('44444444-4444-4444-8444-444444444404', src_tasks, project_id, 0, null,
      'Document', tasks_text, 0, length(tasks_text),
      'sha256:' || encode(pg_catalog.sha256(convert_to(tasks_text, 'UTF8')), 'hex')),
    ('44444444-4444-4444-8444-444444444405', src_finance, project_id, 0, null,
      'Document', finance_text, 0, length(finance_text),
      'sha256:' || encode(pg_catalog.sha256(convert_to(finance_text, 'UTF8')), 'hex'));

  insert into public.knowledge_items(
    id, project_id, category, title, description, verification_status,
    access_level, confidence_score, created_by, reviewer_id, reviewer_note,
    claim_type, subject_key, attributes, evidence_status, is_synthetic
  ) values
    ('33333333-3333-4333-8333-333333333301', project_id, 'Decision',
      'Production deployment target is conflicting',
      'The repository export says Vercel, while the latest pilot meeting says Netlify. A reviewer must confirm the current target.',
      'CONFLICTING', 'project', 0.520, p_owner, null, null,
      'DECISION', 'deployment-target', '{"target":"vercel,netlify","conflict":"netlify,vercel"}',
      'CONFLICTING', true),
    ('33333333-3333-4333-8333-333333333302', project_id, 'Decision',
      'Route importer decision has no rationale',
      'A route importer was selected, but the available meeting note does not explain the trade-off or alternatives.',
      'MISSING_EVIDENCE', 'project', 0.380, p_owner, null, null,
      'DECISION', 'decision-rationale', '{}', 'MISSING_EVIDENCE', true),
    ('33333333-3333-4333-8333-333333333303', project_id, 'Risk',
      'Bus-map import knowledge is concentrated',
      'The notes identify Aarav as the only current holder of the bus-map import process. Add a backup owner and document the runbook.',
      'APPROVED', 'project', 0.960, p_owner, p_owner,
      'Approved synthetic fixture: the quotation is exact.',
      'RISK', 'knowledge-concentration', '{}', 'SUPPORTED', true),
    ('33333333-3333-4333-8333-333333333304', project_id, 'Task',
      'Rider-alert reconciliation has no owner',
      'Task CC-42 is open with no assignee. Confirm an owner before the pilot handover.',
      'NEEDS_REVIEW', 'project', 0.990, p_owner, null, null,
      'TASK', 'ownership-gap', '{"taskStatus":"open","reference":"CC-42"}',
      'SUPPORTED', true),
    ('33333333-3333-4333-8333-333333333305', project_id, 'Task',
      'Document route import',
      'Aarav is documenting the route-import steps this week.',
      'APPROVED', 'project', 0.880, p_owner, p_owner,
      'Approved synthetic fixture: task and owner are directly quoted.',
      'TASK', null, '{"taskStatus":"in_progress","reference":"CC-31"}',
      'SUPPORTED', true),
    ('33333333-3333-4333-8333-333333333306', project_id, 'Task',
      'Confirm production deployment target',
      'Meera owns the task to confirm the current deployment target before the pilot.',
      'NEEDS_REVIEW', 'project', 0.800, p_owner, null, null,
      'TASK', 'deployment-target-task', '{"taskStatus":"open","reference":"CC-38"}',
      'SUPPORTED', true),
    ('33333333-3333-4333-8333-333333333307', project_id, 'Task',
      'Add backup owner for route operations',
      'No backup owner is assigned for route operations.',
      'NEEDS_REVIEW', 'project', 0.950, p_owner, null, null,
      'TASK', 'ownership-gap', '{"taskStatus":"open","reference":"CC-44"}',
      'SUPPORTED', true),
    ('33333333-3333-4333-8333-333333333308', project_id, 'Dependency',
      'Pilot launch depends on rider-alert reconciliation',
      'Issue #42 records that rider alerts must be reconciled before the pilot can proceed.',
      'APPROVED', 'project', 0.860, p_owner, p_owner,
      'Approved synthetic fixture: exact issue reference.',
      'DEPENDENCY', 'pilot-dependency', '{}', 'PARTIAL', true),
    ('33333333-3333-4333-8333-333333333309', project_id, 'Question',
      'Who will own rider-alert reconciliation?',
      'Meera asked for an owner in the team chat. Riya offered to review it after the pilot, which is not a confirmed handover owner.',
      'NEEDS_REVIEW', 'project', 0.700, p_owner, null, null,
      'QUESTION', 'ownership-question', '{}', 'SUPPORTED', true),
    ('33333333-3333-4333-8333-333333333310', project_id, 'Next action',
      'Riya to review rider-alert reconciliation after the pilot',
      'Riya offered a review after the pilot. The offer has no due date and is not a commitment to own the work.',
      'NEEDS_REVIEW', 'project', 0.640, p_owner, null, null,
      'NEXT_ACTION', null, '{}', 'SUPPORTED', true),
    ('33333333-3333-4333-8333-333333333311', project_id, 'Note',
      'Synthetic sponsor commitment',
      'Restricted synthetic finance record included to demonstrate role-aware redaction. Not real sponsor data.',
      'APPROVED', 'finance', 1.000, p_owner, p_owner,
      'Synthetic finance fixture, restricted by clearance.',
      'NOTE', null, '{}', 'SUPPORTED', true);

  insert into public.evidence_citations(
    id, knowledge_item_id, source_id, chunk_id, exact_snippet,
    source_location, page_number
  ) values
    ('55555555-5555-4555-8555-555555555501',
      '33333333-3333-4333-8333-333333333301', src_github,
      '44444444-4444-4444-8444-444444444401', 'Deployment target: Vercel.',
      'README.md · Deployment', null),
    ('55555555-5555-4555-8555-555555555502',
      '33333333-3333-4333-8333-333333333301', src_meeting,
      '44444444-4444-4444-8444-444444444402',
      'Decision: We moved the production deployment to Netlify for the pilot.',
      'Pilot readiness · Decision', null),
    ('55555555-5555-4555-8555-555555555503',
      '33333333-3333-4333-8333-333333333302', src_meeting,
      '44444444-4444-4444-8444-444444444402',
      'The team selected the new route importer, but the meeting notes do not record why.',
      'Pilot readiness · Rationale gap', null),
    ('55555555-5555-4555-8555-555555555504',
      '33333333-3333-4333-8333-333333333303', src_meeting,
      '44444444-4444-4444-8444-444444444402',
      'Aarav is currently the only person who knows the bus-map import process.',
      'Pilot readiness · Knowledge concentration', null),
    ('55555555-5555-4555-8555-555555555505',
      '33333333-3333-4333-8333-333333333304', src_tasks,
      '44444444-4444-4444-8444-444444444404',
      'CC-42 · Reconcile rider alerts · Status: Open · Assignee: Unassigned',
      'Task board · CC-42', null),
    ('55555555-5555-4555-8555-555555555506',
      '33333333-3333-4333-8333-333333333305', src_tasks,
      '44444444-4444-4444-8444-444444444404',
      'CC-31 · Document route import · Status: In progress · Assignee: Aarav',
      'Task board · CC-31', null),
    ('55555555-5555-4555-8555-555555555507',
      '33333333-3333-4333-8333-333333333306', src_tasks,
      '44444444-4444-4444-8444-444444444404',
      'CC-38 · Confirm production deployment target · Status: Open · Assignee: Meera',
      'Task board · CC-38', null),
    ('55555555-5555-4555-8555-555555555508',
      '33333333-3333-4333-8333-333333333307', src_tasks,
      '44444444-4444-4444-8444-444444444404',
      'CC-44 · Add backup owner for route operations · Status: Open · Assignee: Unassigned',
      'Task board · CC-44', null),
    ('55555555-5555-4555-8555-555555555509',
      '33333333-3333-4333-8333-333333333308', src_github,
      '44444444-4444-4444-8444-444444444401',
      'Issue #42: Reconcile rider alerts before the pilot.',
      'README.md · Issue #42', null),
    ('55555555-5555-4555-8555-555555555510',
      '33333333-3333-4333-8333-333333333309', src_chat,
      '44444444-4444-4444-8444-444444444403',
      'Meera: Can someone own rider-alert reconciliation?',
      'Chat · Ownership question', null),
    ('55555555-5555-4555-8555-555555555511',
      '33333333-3333-4333-8333-333333333310', src_chat,
      '44444444-4444-4444-8444-444444444403',
      'Riya: I can review it after the pilot.',
      'Chat · Riya offer', null),
    ('55555555-5555-4555-8555-555555555512',
      '33333333-3333-4333-8333-333333333311', src_finance,
      '44444444-4444-4444-8444-444444444405',
      'Sample sponsor budget: $18,400.',
      'Restricted note · Budget', null);

  insert into public.knowledge_relationships(
    id, project_id, from_claim_id, to_claim_id, relation, confidence,
    created_by, created_at
  ) values
    ('66666666-6666-4666-8666-666666666601', project_id,
      '33333333-3333-4333-8333-333333333301',
      '33333333-3333-4333-8333-333333333306', 'AFFECTS', 0.900, p_owner, now()),
    ('66666666-6666-4666-8666-666666666602', project_id,
      '33333333-3333-4333-8333-333333333306',
      '33333333-3333-4333-8333-333333333304', 'DEPENDS_ON', 0.850, p_owner, now()),
    ('66666666-6666-4666-8666-666666666603', project_id,
      '33333333-3333-4333-8333-333333333304',
      '33333333-3333-4333-8333-333333333307', 'DEPENDS_ON', 0.800, p_owner, now()),
    ('66666666-6666-4666-8666-666666666604', project_id,
      '33333333-3333-4333-8333-333333333303',
      '33333333-3333-4333-8333-333333333307', 'AFFECTS', 0.880, p_owner, now()),
    ('66666666-6666-4666-8666-666666666605', project_id,
      '33333333-3333-4333-8333-333333333308',
      '33333333-3333-4333-8333-333333333304', 'DEPENDS_ON', 0.760, p_owner, now());

  insert into public.tasks(
    id, project_id, claim_id, title, description, status, priority, due_date
  ) values
    ('99999999-9999-4999-8999-999999999901', project_id,
      '33333333-3333-4333-8333-333333333304',
      'Reconcile rider alerts', 'Synthetic task CC-42.', 'open', 'high', '2026-11-03'),
    ('99999999-9999-4999-8999-999999999902', project_id,
      '33333333-3333-4333-8333-333333333305',
      'Document route import', 'Synthetic task CC-31.', 'in_progress', 'high', '2026-11-04'),
    ('99999999-9999-4999-8999-999999999903', project_id,
      '33333333-3333-4333-8333-333333333306',
      'Confirm production deployment target', 'Synthetic task CC-38.', 'open', 'high', '2026-11-05'),
    ('99999999-9999-4999-8999-999999999904', project_id,
      '33333333-3333-4333-8333-333333333307',
      'Add backup owner for route operations', 'Synthetic task CC-44.', 'open', 'high', '2026-11-07');

  insert into public.review_records(
    id, knowledge_item_id, reviewer_id, action, comment, prior_status, next_status
  ) values
    ('77777777-7777-4777-8777-777777777701',
      '33333333-3333-4333-8333-333333333303', p_owner, 'approve',
      'Approved synthetic fixture: quotation is exact.', 'NEEDS_REVIEW', 'APPROVED'),
    ('77777777-7777-4777-8777-777777777702',
      '33333333-3333-4333-8333-333333333305', p_owner, 'approve',
      'Approved synthetic fixture: task and owner are quoted.', 'NEEDS_REVIEW', 'APPROVED'),
    ('77777777-7777-4777-8777-777777777703',
      '33333333-3333-4333-8333-333333333308', p_owner, 'approve',
      'Approved synthetic fixture: exact issue reference.', 'NEEDS_REVIEW', 'APPROVED'),
    ('77777777-7777-4777-8777-777777777704',
      '33333333-3333-4333-8333-333333333311', p_owner, 'approve',
      'Synthetic finance fixture, restricted by clearance.', 'NEEDS_REVIEW', 'APPROVED');

  insert into public.interview_questions(
    id, project_id, claim_id, question, rationale, status
  ) values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', project_id,
      '33333333-3333-4333-8333-333333333301',
      'Which deployment target is current: Vercel or Netlify, and why was it changed?',
      'Two source records disagree and no rationale is recorded.', 'open'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02', project_id,
      '33333333-3333-4333-8333-333333333304',
      'Who will own rider-alert reconciliation before the pilot?',
      'CC-42 is open with no assignee.', 'open'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03', project_id,
      '33333333-3333-4333-8333-333333333302',
      'Why was the new route importer selected over the alternatives?',
      'The meeting note says the reason is not recorded.', 'open'),
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04', project_id,
      '33333333-3333-4333-8333-333333333303',
      'What is the recovery procedure if the route importer fails during the pilot?',
      'Only one person currently knows the bus-map import process.', 'open');

  insert into public.audit_logs(
    id, organization_id, actor_id, action, entity_type, entity_id, metadata, project_id
  ) values
    ('88888888-8888-4888-8888-888888888801', p_organization, p_owner,
      'source.added', 'source', src_github,
      '{"title":"GitHub export ingested"}', project_id),
    ('88888888-8888-4888-8888-888888888802', p_organization, p_owner,
      'claim.approved', 'knowledge_item',
      '33333333-3333-4333-8333-333333333303',
      '{"title":"Continuity risk approved after evidence check"}', project_id),
    ('88888888-8888-4888-8888-888888888803', p_organization, p_owner,
      'conflict.detected', 'knowledge_item',
      '33333333-3333-4333-8333-333333333301',
      '{"title":"Vercel and Netlify deployment records disagree"}', project_id);

  return project_id;
end;
$$;

revoke all on function public.seed_relaymap_demo(uuid, uuid) from public, anon;
grant execute on function public.seed_relaymap_demo(uuid, uuid) to authenticated;

commit;
