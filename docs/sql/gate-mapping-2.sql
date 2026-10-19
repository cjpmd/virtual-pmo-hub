-- APPLIED 16/10/2026 as migration 20261016154517_gate_mapping_2 (approved 16/10).
--
--   GATE 1 - Ready to Deliver     16 rows  -> Phase 3 (phase_id set, stays a gate)
--   Design authority approval     34 rows  -> not a phase gate: type 'key_date' (there is no
--                                             approval or committee milestone type; key_date is
--                                             the closest existing non-gate type), with
--                                             report_to_committee = true (all 34 already are), no
--                                             phase required.
-- Runs as the migration owner, so the "a gate needs a phase" trigger (signed-in users only)
-- doesn't apply. Each organisation's own Phase 3 (sort_order 3). Update only: no DROP, no DELETE.

update public.milestones m
set phase_id = lp.id
from public.lifecycle_phases lp
where m.type = 'gate'
  and m.phase_id is null
  and regexp_replace(btrim(m.title), '\s+', ' ', 'g') = 'GATE 1 - Ready to Deliver'
  and lp.organisation_id = m.organisation_id
  and lp.sort_order = 3;

update public.milestones
set type = 'key_date', report_to_committee = true, phase_id = null
where type = 'gate'
  and regexp_replace(btrim(title), '\s+', ' ', 'g') = 'Design authority approval';

-- DRY RUN (16/10/2026, one transaction, rolled back), demo organisation:
--   gate titles after   GATE 0 - Ready to Design 34 (P2), GATE 1 - Ready to Deliver 16 (P3),
--                       Closure report approved 3 (P6); Design authority approval: key_date,
--                       report_to_committee true, no phase (34)
--   current gates       10 (EBB gains GATE 1 for Phase 3)
--   "No gate milestone for this phase", before -> after (EBB drops off):
--     P1 CSCSI DOM PMS(proposed) SDO(closed) STBP WAH; P3 ARB CYB DMDR SAM TAWS WPCMP;
--     P4 ACA CAIG DOC(proposed) IOFTC(on hold) NRDC(proposed) W11; P5 BCT BMF CMI(on hold) DSA VDI;
--     P6 ASS BCMF IRS(on hold) KBR
--     (Phase 1 has no gate milestones; Phases 4-5 have none mapped; Phase 3 projects without a
--     "GATE 1 - Ready to Deliver" milestone have none)
--   "Gate N not passed", before 4 -> after 19 rows:
--     Gate 2 (MS-002 GATE 0): ARB, CYB, EBB in P3; NRDC in P4
--     Gate 3 (MS-006 GATE 1, forecast 2027): ACA CAIG DOC IOFTC NRDC W11 (P4), BCT BMF CMI DSA
--     VDI (P5), ASS BCMF IRS KBR (P6)
--     The signal shows the earliest per project and is suppressed for closed projects.
-- As intended.
