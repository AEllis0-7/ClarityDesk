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

## Counter home page (9 September 2026)

- **The empty topic is folded.** "Thin and light lenses for strong prescriptions" is gone from
  the tenant and from the box's `topic` labelset (the label was removed through Manage >
  Taxonomy's route, and the single-vision definition now names thin, light and high-index
  lenses). The analysis brief says the same, so a re-run will not recreate it. Seven topics.
- **`home.style: 'counter'`** on `TenantConfig` switches the home page to the shop-floor
  layout: a customer-facing headline ("What does the customer want to know?", overridable) with
  a lede, the ask box, then the suggested questions grouped by the topic each names
  (`Question.topicId`, new) with the box's document count per group as the link into the
  library, then `home.families` as one-tap searches (Zeiss SmartLife, Essilor Crizal, ...), then
  the existing topic rows under a "Browse the guides" heading. The research tiles, the recent
  documents rail and the region band are not shown. Portals without `home` are unchanged.
- `copy.askIntro` replaces the "grounded in this portal's research" line on Ask.
- Ten questions now, each naming its topic; two new ones cover children's myopia and coating
  care so every populated topic has at least one.
- Windows note: the Tailwind standalone binary sometimes fails with `EEXIST` creating
  `apps/web/dist` inside OneDrive; building the stylesheet to a temp path and copying it in
  works, and `deno task dev`'s own start-up build is unaffected.

## Plain answer register (9 September 2026)

- **`answerRegister: 'plain'`** on `TenantConfig`. Three effects, one underlying confidence state:
  the denominator rule is left out of the prompt preamble (the population rule stays); the
  figure-audit badge stays off the answer row; and the quality control speaks in guides -
  "Backed by 3 guides" when the audit found every figure, "Backed by 3 guides - check figures"
  on a moderate answer, "Check with the optometrist" on a weak one, "Cites 2 guides - not
  checked" when nothing was scored. The panel lists the cited guide titles instead of the REMi
  meters. `plainConfidence` in `apps/web/src/lib/confidence.ts` is the pure mapping.
- **The "Try asking:" line no longer counts as an uncited claim.** `assertsFinding` treats a
  question, or a line starting "Try asking", as the portal talking to its reader, so the
  "one sentence carries no citation" footnote disappears from every ClarityDesk answer that
  ends properly. This is register-independent: it was wrong in the research register too.

## Scrivens identity (9 September 2026)

ClarityDesk is built for Scrivens Opticians & Hearing Care, so the portal wears their brand.
scrivens.com sits behind a Cloudflare human check that blocks every automated route, so the
brand was read from a Wayback Machine copy of the homepage (August 2024), its stylesheets, and
the logo files: the wordmark is `#004088` blue (sampled from `logo-scrivens.png`; the stylesheet
uses `#003f81`) over `#747474` grey, the typeface is Canada Type's Gibson served from Adobe
Fonts, the corners are 4px, and the header is white with the blue logo.

- **`scrivens` library palette** in `packages/core/src/palettes.ts`: brand blue `#003f81`, a
  sky-blue accent `#4ea1ff` with a navy on-colour (the brand blue itself fails the 3:1 the
  contract wants for the nav underline), link blue `#0b5cad`, a blue-tinted grey suite. Passes
  the full WCAG contract. It is the only palette in the library that is a real organisation's
  identity, and says so in its comment.
- **`figtree` type pairing**: Gibson is licensed and cannot be redistributed; Figtree is the
  closest open face (geometric-humanist, open apertures) and is used for headings and body.
- ClarityDesk's branding: organisation "Scrivens Opticians & Hearing Care", palette `scrivens`,
  typography `figtree`, shape `rounded`, and the four seeded colours set to the same blues so
  "default" in Manage > Appearance stays on brand. The logo was uploaded through Manage >
  Appearance on the local instance (it lives in `data/branding`, not the repo); production needs
  the same upload.

## Objections and the product lexicon (9 September 2026)

- **`home.objections`** on `TenantConfig`: the pushbacks a customer raises, worded as they say
  them, rendered as their own group on the counter home after the situation groups ("When the
  customer pushes back"). ClarityDesk carries eight, each checked live against the box before
  it went in; a pushback the guides cannot answer (price against online sellers) is left out
  rather than handed to the model.
- **`entityTerms`** seeded with every product family, coating and range the guides cover
  (SmartLife, ClearView, DuraVision, Crizal, Varilux XR, Stellest, Transitions GEN S, ...). The
  retrieval pin resolves a named product to its guide, and the question-clause decomposition
  already turns "How does Varilux XR compare with SmartLife Individual?" into per-product
  searches. Note that `comparisonEntities` counts only medication-shaped lexicon terms, by
  design for the clinical portal; product names go through the pin and the clauses instead.
- **The box has grown.** On 9 September it held 123 resources: the 55 enriched, labelled
  vendor guides plus 68 open-access papers, ABDO and GOC documents and the WHO vision report.
  Three of the 68 were the corpus folder's own `README`, `manifest` and `links-to-ingest`
  files; Alfie deleted them, leaving 120. Enrichment and analysis over the full set are the
  section below.

## The whole corpus, enriched and filed (9 September 2026)

- **All 120 documents are enriched.** The 65 that arrived unenriched (open-access papers, the
  ABDO and GOC documents, the WHO vision report) went through the research-summary agent in one
  `scope: missing` run: 65 enriched, 0 errors. The Library shows plain titles for the whole
  corpus now, not raw filenames.
- **Analysis labels every resource, not just the sampled half.** The design prompt is capped at
  14,000 characters of inventory, so at 120 resources it sees a stride sample of about half and
  the rest kept no topic at all - they would have vanished from the filters and the topic rows.
  `analyseTenant` now runs a second pass: `chunkInventory` splits whatever the sample missed
  into further batches, and each batch is classified against the taxonomy the design just fixed
  (`ASSIGN_SCHEMA`, `assignmentPrompt`). A batch that fails costs its own batch, not the run.
  Result on the box: **120 of 120 labelled, `untagged.topic` 0.**
- **Eight situations, not seven.** The first re-run under the old brief folded sun lenses,
  blue-light and night driving into one 29-document "UV and glare" bucket. The brief now names
  the eight situations to keep apart and asks for sentence-case labels, and the taxonomy came
  back as: progressive and multifocal (15), everyday single vision (13), coatings and treatments
  (10), sun, UV and light-adaptive (12), screens, driving and glare (15), children and myopia
  control (33), measurements and fit (10), how lenses are made (12). Kinds gained
  `professional-standard` for the ABDO and GOC documents.
- **Copy and prompt follow the corpus.** The home lede and the ask intro said every answer comes
  from "the lens makers' guides", which is no longer true of two thirds of the box. Both now say
  the guides and the research behind them. The answer prompt used to require naming a maker for
  every claim; it now asks the answer to say where a claim comes from - the maker when it is the
  maker's own guide, independent research or the professional standards when it is not - and
  never to present one as the other.
- **Seed topic ids changed.** `driving-screen-office` and `light-adaptive-sun-lenses` are gone,
  replaced by `screens-driving-glare` and `sun-uv-light-adaptive`, plus the new
  `measurements-fit`; the suggested questions were remapped onto them.

## Next steps, in order

1. **Answer feedback from the floor.** The thumbs on every answer already reach the platform;
   surfacing them in Manage gives the list of questions the corpus answers badly, which matters
   more now the corpus is 120 documents rather than 55.
2. **Product explainer cards.** See the ideas below - the largest visible feature still open.
3. **Confidence for non-experts - remaining.** The plain-register wording is a first pass; watch
   real answers for a week and tune. Maker logos beside the guide titles need a maker field on
   the enrichment schema (a "lens" agent), which is Phase 2 of enrichments upstream.
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
