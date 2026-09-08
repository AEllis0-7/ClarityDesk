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

## Next steps, in order

1. **Run corpus analysis and the enrichment agents** on the box (Manage > Analyse). This produces
   real titles, hooks and summaries for the 55 papers, a topic labelset the home page can browse,
   and the graph entities. Then copy the resulting topic ids into the tenant's `topics`.
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
