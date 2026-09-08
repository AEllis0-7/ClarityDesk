# ClarityDesk - project notes

ClarityDesk is a CorpusKit portal for the shop floor. The reader is an in-store eyewear adviser
with no optical training, standing beside a customer, who needs a plain, correct answer about a
lens, a coating or a frame in the time it takes to say it. It is not a research portal, even
though it runs on one: every decision below follows from that reader.

## What is in place (8 September 2026)

- **Tenant in code.** `claritydesk` is a seeded tenant in `apps/api/src/tenants.ts` beside the
  two showcase portals, so its branding, questions and prompt are versioned with the repo rather
  than living in the gitignored `data/tenants.json`.
- **Knowledge box.** Bound through the env file (`ARAG_KB_CLARITYDESK` and its token, zone
  `aws-us-east-2-1`). The box holds 55 lens-maker white papers (Essilor, Hoya, Nikon, Zeiss and
  trade press) - see `corpus/vendor-whitepapers/manifest.tsv` outside the repo for provenance.
- **Plain-language answer prompt.** A new optional `askPrompt` on `TenantConfig` gives a portal
  its own default system prompt. `resolvePrompts` (in `tenants.ts`, shared with the Cloudflare
  store) lets a prompt saved in Manage > Behaviour win, and treats a cleared field as "back to the
  portal's own default", not "back to the analyst prompt". The prompt is stripped from the public
  `GET /api/t/:slug/config`.
- **Customer-phrased questions.** Eight suggested questions written the way a shopper asks them
  ("Do I really need an anti-reflective coating?"), shown as chips on the home page and in the
  Ask empty state.

## What the first real answers showed

- The prompt does its job: answers open in everyday words, name the maker a claim comes from, and
  end with a "Try asking:" line the adviser can use to keep the conversation going.
- REMi groundedness comes back low (2 of 5) for both the analyst prompt and the plain one on the
  same question, so the score reflects the box, not the prompt. The likely causes are the raw,
  un-enriched PDFs and the platform's known sensitivity to thin context (docs/ARAG-DEV.md). Until
  that is fixed the confidence banner will read "Low confidence" on most answers, which is the
  wrong message to put in front of a salesperson.
- The home page shows "Nothing to browse yet" because the box has no topic labelset, and
  citations show raw filenames because the enrichment agents have not run.
- The research trust layer still speaks in its own register. On "Which lenses are thinnest for
  a strong prescription?" the answer was right (Zeiss ClearView, up to 13% thinner) but the
  portal appended "*Denominators: 8%, 13% are stated without a denominator*", and every answer
  carries the "one sentence carries no citation" note because the "Try asking:" line is not a
  claim. Both come from `variantPreamble` and the answer audit in `apps/web/src/lib`, which
  were written for clinical figures. ClarityDesk needs a tenant-level way to turn the
  denominator rule off and to exempt the closing line from the audit.

## Enrichment run (8 September 2026, later the same day)

- **Research-summary enrichment: done.** All 55 resources enriched, no errors. The Library and
  every citation now show real titles and summaries ("HOYA VisuPro Advanced Focus Lenses for
  Young Presbyopes", not a filename). The records live in the app-side enrichment store (local
  `data/`, gitignored); a backup export is at `corpus/claritydesk-enrichments-2026-09-08.json`
  outside the repo and can be re-imported through Manage > Enrichments.
- **Corpus analysis: half done.** The design step worked (8 topics, 5 kinds, generated from a
  sample of the corpus) and the topics are saved as a tenant override, but creating the
  labelsets and labelling the resources all returned 403. The box token in `.env` is
  read-only: a `PATCH` on a non-existent resource answers 403 where a writer key answers 404.
  Analysis reports "Labelset already exists - reusing it" in that case because it treats any
  creation error as a conflict; the box actually has no labelsets. The topic filters in the
  Library therefore all show zero until a key with the owner role replaces the current one and
  the labelling is re-run.
- Analysis also overwrote the suggested questions and search placeholder with its own
  researcher-style set; those overrides were removed from `data/tenants.json` so the seeded
  customer questions show again. Re-running analysis will overwrite them again.
- First answer after enrichment scored groundedness 5 of 5 but answer relevance 1 on "How long
  does it take to get used to progressive lenses?": retrieval pulled myopia-management papers
  and the answer was one statistic. Retrieval tuning (intents, entity terms) is the next lever.

## Analysis re-run with an owner key (8 September 2026, evening)

- The box token was replaced with an owner-role key (write probe answers 404, as a writer
  should) and analysis completed: `topic` and `kind` labelsets created on the box, 55 of 55
  resources labelled, no errors. The Library topic filters now carry real counts and the home
  page browses by topic.
- **The generated taxonomy is organised by maker, not by customer need**: `zeiss-smartlife`
  (8), `zeiss-myopia` (11), `zeiss-technology` (7), `hoya-technology` (4),
  `essilor-innovations` (14), `transitions-and-others` (11). That is what the corpus inventory
  looks like to a research-portal prompt. A sales adviser thinks in situations - progressives,
  coatings, driving, screen work, children's myopia, thin lenses - so the taxonomy should be
  redesigned around those before it is baked into `tenants.ts`. Two routes: edit the labels in
  Manage > Taxonomy and rebuild the labeller, or give `analyse.ts` a tenant-aware design prompt.
  Until then the topics stay as an override in `data/tenants.json`.
- The knowledge graph is still empty: relation extraction (Manage > Graph, propose then
  implement) has not been run. Search and the Library do not need it.

## Tenant-aware analysis (8 September 2026, late)

- `TenantConfig` gains an optional `analysis` block: a `brief` that states who reads the portal
  and how topics should be organised, fed into the taxonomy design prompt ahead of the design
  rules, and `keepQuestions`, which makes analysis rewrite the taxonomy without touching the
  portal's own suggested questions or search placeholder. Portals without a brief get the old
  research-portal framing unchanged.
- Analysis no longer reports "Labelset already exists - reusing it" on a failure. Setting a
  labelset replaces it on the platform, so there was never a conflict to reuse; a failure is
  now an error event that names the labelset and the likely cause (a read-only key) and stops
  before the labelling loop fails fifty-five times.
- Re-run on the box with the ClarityDesk brief: 8 topics by customer situation, 5 kinds by what
  a document is to a salesperson, 55 of 55 labelled, questions kept. Counts on the box:
  children and myopia control 19, progressive and multifocal 10, coatings 6, single vision 5,
  light-adaptive 5, driving/screen/office 5, lens manufacturing 5, thin and light lenses 0. The
  ids are now in `tenants.ts` and the data-file override is gone.
- "Thin and light lenses for strong prescriptions" has no documents. The Zeiss ClearView paper
  answers the question but was filed under single vision. Either merge the topic away or source
  a high-index material guide for it.

## Next steps, in order

1. **Fill or fold the empty topic.** Source one or two high-index or lens-material guides, or
   merge "thin and light" into "everyday single vision" and re-run analysis.
2. **Sales-floor home page.** Replace the research hero ("What would you like to explore?") with a
   counter-first layout: the ask box, the eight questions grouped by situation (new to
   progressives, screen work, driving, strong prescription), and the product families in the box.
3. **Confidence for non-experts.** Decide what the adviser should see instead of a REMi meter:
   probably "Backed by Zeiss and Hoya guides" with the source logos, and a quiet "check with the
   optometrist" line when the audit finds an uncited sentence.
4. **Rotate the box token** and consider turning off anonymous reads on the box before the URL is
   shared with anyone.

## Ideas worth building

Ordered roughly by value to the adviser at the counter over effort.

- **Product explainer cards.** A page per lens family (Zeiss SmartLife, Hoya Hoyalux iD, Essilor
  Varilux, Nikon Presio) generated from the box with `answer_json_schema`: who it is for, what
  the customer will notice, what it costs more for, and the three questions to ask before
  recommending it. The Generate page's "briefing" kind is most of the machinery already.
- **"Explain it to the customer" mode.** A toggle on any answer that rewrites it as something the
  adviser says out loud in two sentences, plus a one-line analogy ("an anti-reflective coating is
  like the coating on a camera lens"). Same grounding, different register, no new retrieval.
- **Compare two lenses side by side.** The Compare Configurations component exists; pointing it at
  two product names with a fixed rubric (adaptation time, field of view, thickness, coatings,
  price band) is the comparison a customer is silently making anyway.
- **Prescription-strength guidance.** Ask for the customer's rough prescription band (not the
  exact numbers) and let the answer say which materials and designs the guides recommend for it.
  Keep it as guidance from the makers' documents, never as clinical advice.
- **Jargon glossary, built from the corpus.** Every technical term the prompt brackets on first
  use ("presbyopia", "aspheric", "index") becomes a hover card with the plain definition and the
  guide it comes from. A synthetic-questions DA task can harvest the terms.
- **Sales-floor lexicon for the router.** CorpusKit's intent routing recognises entity terms.
  Seeding `entityTerms` with product names and coating brand names means "Is Crizal the same as
  DuraVision?" routes as an exact lookup, not a fuzzy search.
- **Objection handling.** A curated set of the questions customers push back with ("Why is this
  twice the price of online?", "Will I get headaches?") with answers grounded in the guides and
  a line on what the guides do not claim. Suggested-question groups make this a content task.
- **Store tablet layout.** The portal already scales down to 390px. A kiosk view with larger
  type, the ask box pinned, and no admin chrome is a small appearance-system preset.
- **Answer feedback from the floor.** The platform's `/feedback` endpoint takes a thumbs up or
  down per answer. A two-button rating on each answer tells you which questions the guides answer
  badly, which is the list of white papers to source next.
- **Frame-side content.** The box is lens-only today. Frame material, fit and face-shape guides
  from the frame makers would let the same portal cover the second half of every sale.
- **Multilingual answers.** The makers publish in several languages and the platform generates in
  them; a language switch on the answer is close to free and useful in a mixed-language store.
