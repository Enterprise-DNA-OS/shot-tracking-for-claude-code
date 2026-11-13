# Compliance: the rebate rules this system watches

A post, digital and visual effects (PDV) studio in Australia or New Zealand usually works on shows that claim a government rebate on qualifying local spend. The claim is made by the production company, but it is built from the studio's records: who worked on the show, where, for how long, at what cost, and which invoices back the vendor spend. Get those records wrong during the show and the evidence is hard to rebuild at the end.

`node scripts/shots.mjs compliance` (the `/compliance` command) checks the records against the rules below. The rates and thresholds live in the `rebate_schemes` table so a rule change is one migration.

Checked against the sources on 2026-11-13. Confirm the current rules with the agency before a claim; schemes change.

## 1. Australia: PDV Offset

- **Rule:** a 30 percent rebate on qualifying Australian production expenditure (QAPE) on post, digital and visual effects production, with a minimum of A$500,000 of PDV QAPE.
- **Source:** Office for the Arts, *Tax rebates for film and television producers*, https://arts.gov.au/funding-and-support/tax-rebates-film-and-television-producers ; ATO, *The post, digital and visual effects (PDV) tax offset*, https://www.ato.gov.au/forms-and-instructions/film-industry-incentives-2019/the-post-digital-and-visual-effects-pdv-tax-offset
- **In the data:** `rebate_schemes` row `au_pdv` (3000 basis points, threshold 50,000,000 cents AUD). A show with `rebate_scheme = 'au_pdv'` must be in AUD.
- **Check:** qualifying spend against the threshold (state `watch` until reached).
- **Note:** a 2021 application form described a planned rise of the threshold to A$1 million for PDV work starting on or after 1 July 2021. Current Office for the Arts and Ausfilm material states A$500,000. Confirm which applies to your show and change the row if needed.

## 2. New Zealand: Screen Production Rebate, international PDV

- **Rule:** a 20 percent cash rebate on qualifying New Zealand production expenditure (QNZPE) for PDV productions, 25 percent for applicants who pass a points test, with a threshold of NZ$250,000 QNZPE.
- **Rule:** a PDV production registers within 20 working days of a qualifying bid being accepted.
- **Source:** New Zealand Film Commission, *NZSPR International*, https://www.nzfilm.co.nz/incentives-co-productions/nzspg-international , and the NZFC summary sheets linked from that page.
- **In the data:** `rebate_schemes` row `nz_pdv` (2000 basis points, threshold 25,000,000 cents NZD, `register_working_days` 20). Shows record `bid_accepted_on` and `rebate_registered_on`.
- **Checks:** registration deadline (breach when more than 20 working days have passed with no registration date; due within five working days of it); qualifying spend against the threshold. The estimate uses the base 20 percent; change `rate_bps` on your show's scheme row if you pass the points test.
- **Working days:** the system counts Monday to Friday and does not remove public holidays. A deadline that falls near a holiday is a few days later than shown: check the NZFC definition for the exact date.

## 3. Evidence for every cost

- **Rule:** spend is claimed with evidence. An in-country vendor cost with no invoice or receipt reference is reported separately and left out of qualifying spend.
- **Source:** the scheme guidance above (claims are assessed on documented expenditure).
- **Check:** vendor spend in the scheme's country with an empty `evidence_ref` (state `breach`).

## 4. Time that cannot be costed

- **Rule:** artist time counts at a cost. In-country hours logged by a person with no day rate cannot be valued, so they are left out and flagged.
- **Check:** in-country minutes where `people.day_rate_cents = 0` (state `breach`).

## 5. Work outside the country

- **Rule:** only spend in the scheme's country counts. Time logged with location `offshore` (or the other country) and vendor spend outside the country are reported, never counted.
- **Check:** `outside_country_cents` on the `rebate_spend` view (state `info`).

## How the estimate is built

`rebate_spend` (a view in `supabase/migrations/0001_shot_tracking.sql`): logged minutes at the scheme's country, divided by the `working_day_minutes` setting (480), times each person's day rate, plus evidenced in-country vendor spend. The rebate estimate is that total times the scheme rate. It is a working number for the producer and the production accountant during the show. The claim itself, and what counts as QAPE or QNZPE, is settled with the accountant and the agency.
