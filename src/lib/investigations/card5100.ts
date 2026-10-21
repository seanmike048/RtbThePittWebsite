/**
 * Investigator v4.6 Slack card for Tubi TV STR (#5100), exactly as node "15 Final Report" of workflow 4JGsgrMbBGWqcev7
 * (version 3e4c9b35, 2026-10-21) builds it. Evidence lines come from the workflow's own code run on Snowflake rows read
 * 2026-10-21 (queries 01c7e167-020c-f86c-0000-08896b452f46 and 01c7e168-020c-fa97-0000-08896b45b08a). The AI-written parts
 * (leading hypothesis, claim reviews, the publisher message and the "42%" warning) are test text, not model output.
 */
export const CARD_5100_TEXT = `*THE PITT | Tubi TV STR · Network #5100 · Amazon DSP*
Disconnected 2026-09-25 08:11 · Priority *P0 HIGHEST* · :white_check_mark: Investigation complete

*EXECUTIVE SUMMARY*
• Spend at stake: *€16,037 per week* of Amazon DSP spend before the cut (TechOps disconnection alert · EUR, source-documented, not Finance-validated); about €59,566 over the 26 days since at that rate (estimate, not a confirmed loss)
• RPMBr before the cut: *€19.45* per million bid requests sent to Amazon DSP seats (network, all DSPs: €2.55) · UTC days 2026-09-18 to 2026-09-24, gross exchange price
• Quality checks: ads.txt PASS · Supply chain PASS · Blocked inventory PASS · IVT PASS
• Cause of the cut: *no operator or reason in the connection log* · cause from the data: *not established* (confidence low)

*SEATS BEFORE THE CUT* (last 14 days)
• Amazon DSP CTV B (492): €11,267/week · 17.04% of calls sent · 1.4M wins/day · main block: Equativ call limiter 74.75%
• Amazon DSP Video B (491): €4,770/week · 2.35% of calls sent · 205.8K wins/day
_Outside each seat's setup (expected): Video B (seat 491) 93.35% of calls; setups last changed 2026-09-30 (after the cut)._
_Not set up for this inventory (expected): Native B (seat 490) (Native), AMER Display B (seat 437) (Banner)._

*Leading hypothesis* (medium, not confirmed): Internal seat phase-out on the Equativ side (not confirmed)

*TECHOPS* → msteitieh@equativ.com
• Amazon DSP CTV B (seat 492): DiscardedByLimitator on 74.75% of pre-cut calls - App In-stream 74.75% · no bid on 97.74% of requests sent
   ↳ Ask #help-call-limiter whether limitation is expected for Amazon DSP CTV B (seat 492) on this network, or whether a deal with Amazon DSP could apply.
• 19.95% of auctions on ads.txt files that were not crawled
   ↳ Check crawler coverage for these domains/bundles so buyers can verify authorisation.

*PARTNERSHIPS*
• Amazon DSP CTV B (seat 492): No Bid on 97.74% of requests sent - App In-stream 16.65%
   ↳ Ask Amazon DSP for bid-side diagnostics on Amazon DSP CTV B (seat 492) for this inventory (targeting, floors, brand safety).
• Evidence gap: Ask Amazon DSP whether the 5 seats were cut on their side.

*PUBLISHER KAM* → sreiter@equativ.com
Message to the publisher (draft, not sent):
> Hi, we see that your network has been disconnected from Amazon DSP since 2026-09-25. We are checking the situation on our side and will follow up.
> Could you let us know if anything changed on your side around that date?

*CLAIMS CHECKED*
• *NOT SUPPORTED*: Jira says creative errors, but no creative blocks were recorded, so the claim is not supported.
• *CANNOT CHECK*: Slack says the publisher moved supply to another path; the evidence has no data on other paths.

:warning: Numbers not found in the evidence: 42%

_Figures from Snowflake. Failed checks and blocks are observations, not proof of the partner's reason._`;
