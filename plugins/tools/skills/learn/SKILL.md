---
name: learn
description: Use for any learning-workflow request — starting a new topic, continuing a session, grilling/quizzing understanding, or a quick daily debrief. Runs DiSSS planning, Feynman-style teaching, spaced-retrieval interrogation, and a 60-second cross-topic debrief, all against plans stored in a configured local/git location (see <storage_config>).
---

<objective>
One skill, four modes, against a shared store of learning plans (location set in <storage_config>):
- **Plan** — DiSSS breakdown + Mission, producing a new topic's `plan.md`
- **Session** — run the next session against an existing plan: teach, checkpoint, log
- **Grill** — Feynman-style interrogation, schedule-aware (Ghost Protocol's Day 1/4/11/25 stages)
- **Debrief** — a 60-second cross-topic recall pulse-check

Replaces the former `study-coach-plan`, `study-coach`, and `study-coach-grill` skills.
</objective>

<storage_config>
Settings live outside the plugin, in `~/.config/tools/learn.md`, so plugin updates never overwrite them. Read that file before anything else.

If it doesn't exist, copy `config.example.md` from this skill's folder to `~/.config/tools/learn.md`, ask the user for each value in one message, and write their answers in. Every other section refers to "the configured location" and "the configured tooling" rather than hardcoding either.

"Commit" instructions elsewhere in this skill mean: commit locally, and push only if the config sets a remote.
</storage_config>

<context>
All learning data lives at the configured location (see <storage_config>):
- `index.md` (root) — global index of all active plans
- `<topic-slug>/plan.md` — the plan for one topic, including its Mission, DiSSS breakdown, sequence, and each completed item's retrieval schedule
- `<topic-slug>/resources.md` — vetted sources this topic's teaching is grounded in, split Knowledge/Wisdom
- `<topic-slug>/reference.md` — a living, compressed cheat-sheet for the topic
- `<topic-slug>/flashcards.md` — spaced-repetition cards in Obsidian Spaced Repetition plugin syntax (see <flashcards>) — this skill only authors cards; reviewing/scheduling is owned entirely by whatever renders that syntax (Obsidian's plugin, today)
- `<topic-slug>/notes/<YYYY-MM-DD>.md` — dated session transcripts

Use the configured tooling to read and write files. Commit each change with a clear message (push only per <storage_config>).

Topic slug = lowercase, hyphen-separated (e.g. "Go concurrency" → `go-concurrency`).
</context>

<flashcards>
Cards live in `<topic-slug>/flashcards.md`, written in plain Obsidian Spaced
Repetition plugin syntax — this skill never writes scheduling data. The
first time a card is reviewed (in Obsidian or any compatible renderer), the
reviewer's own tool appends an HTML comment tracking its schedule
(`<!--SR:!2026-09-22,3,269-->`); this skill neither writes nor depends on
that comment except in <flashcard_due_check> below. Authoring is the only
job here — rendering/reviewing is deliberately left to the reader's tool of
choice, which is why the syntax is plain portable markdown rather than
anything Obsidian-specific to set up.

**File shape:**
```markdown
# Flashcards: [Topic Name]

#flashcards/<topic-slug>

[question]::[answer]

[question]::[answer]
```
The `#flashcards/<topic-slug>` tag applies to every card below it. Create
the file with just the heading + tag on first use (Plan mode); append cards
under it from Session/Grill mode.

**Card syntax — pick per concept, not uniformly:**
- **Q&A** (default, most concepts): `question::answer` — single line
- **Cloze** (exact syntax/command recall — e.g. "fill in the missing flag"):
  `==text==` marks each blank; multiple `==...==` in one line produces one
  sibling card per blank. Example:
  `rg ==-C 4== "pattern" prints 9 total lines of context`
- **Multi-line** (long answers): front line(s), a lone `?` on its own line,
  then back line(s) — use when a single-line answer would be unreadably long

One card per concept. Question tests understanding, not exact wording.

**Cloze leak trap:** everything outside `==...==` on a cloze line stays fully
visible during review — and on a sibling card, *other* blanks from the same
line render fully revealed too (not hidden). Don't restate a blanked term in
the surrounding explanation, and don't let one blank's text contain
another blank's text verbatim (e.g. blanking both `127.0.0.1` and
`TEMPORAL_ADDRESS=127.0.0.1:7233` on the same line leaks the first via the
second). If a card needs explanation, put the bare cloze on its own line and
add a separate `::` Q&A card for the reasoning — never append the
explanation to the same cloze line.

**Formatting for readability:** when a card centers on a command/flag/API
call, nest backticks *inside* the highlight markers — `` ==`--flag`== ``,
not `` `` ==--flag== `` `` — so the blanked text keeps its monospace code
styling when revealed instead of rendering as plain highlighted prose. Put
the command on its own line (a single line break, not a blank line — a
blank line ends the card) separate from any lead-in question or prose, so
it reads as a displayed command rather than text buried mid-sentence.
</flashcards>

<flashcard_due_check>
Optional, best-effort — used by Debrief mode and (optionally) Grill mode's
scope check. Scan each relevant topic's `flashcards.md` for
`<!--SR:!YYYY-MM-DD,...-->` comments trailing a card line. A comment only
exists once that specific card has been reviewed at least once in Obsidian
(or another compatible renderer) — most cards, especially newly-written
ones, won't have one yet, and that's expected, not an error. If the date is
today or earlier, treat that card as due.

This is genuinely optional: if `flashcards.md` doesn't exist yet, or no
comments are found, skip silently — do not block, error, or mention the
absence to the user. It's a nice-to-have signal layered on top of
<due_schedule_check>, never a requirement.
</flashcard_due_check>

<mode_detection>
Determine the mode before doing anything else:

1. **Explicit keyword wins:**
   - "grill me" / "quiz me" / "test me on X" / "interrogate me" → **Grill**
   - "debrief" / "morning debrief" / "quick debrief" → **Debrief**
   - "new topic" / "start learning X" / "plan a topic" / "I want to learn X" → **Plan**
2. **No keyword matched:** read `index.md` at the configured location.
   - No active plans → **Plan**
   - One or more active plans → **Session**

If ambiguous (e.g. multiple plans exist and no topic named), ask the user which plan before proceeding, per <plan_discovery> below.
</mode_detection>

<plan_discovery>
Shared by Session, Grill, and Debrief modes (Plan mode doesn't need this — it creates a plan).

Read `index.md` from the root of the configured location. Find the "Active Plans" section.

- If no plans exist → tell the user: "No learning plan found. Let's start one." and switch to Plan mode.
- If one plan exists → use it.
- If multiple plans exist and the mode/keyword didn't name one → ask the user which one.
- Debrief mode is the exception: it doesn't pick one plan, it scans **all** active plans for due material (see the Debrief mode section).

Read the chosen plan file. Parse the frontmatter for metadata and the Sequence section for progress.
</plan_discovery>

<due_schedule_check>
Shared by Session, Grill, and Debrief modes. After locating a plan (or, for Debrief, across all plans):

Scan every sequence item with `status: completed` for a `schedule` block. Collect any stage (`day1`, `day4`, `day11`, `day25`) where the date is today or earlier and `done: false`. Sort oldest-first.

If any are due, surface them before teaching new material: "Before we continue — [item]'s Day [N] [stage name] is due." Session mode still proceeds to teach the next new topic afterward; it doesn't block on this. Grill mode, when invoked with no specific topic named, runs through the due stages first.

This never silently drops a stage — if the user skips a session, overdue stages accumulate and are shown next time, oldest first.
</due_schedule_check>

<plan_mode>
Triggered when no plan exists yet, or the user explicitly asks to start a new topic.

**Ask these questions one at a time. Do not batch them.**

0. **Mission — why do you want to learn this?**
   "What's the real-world reason you want to learn this? What will you be able to do once you have it?" Free text, 2-4 sentences. This grounds everything that follows — DiSSS Selection in particular should refer back to it.

1. **What do you want to learn?**
   Open-ended. Examples: "LazyVim motions", "Go concurrency", "Russian basics for travel", "modern frontend stack by building a project".

2. **Do you have source material to work from?**
   "Do you have a book, course, syllabus, video, or other material you want to extract the 20% from? If so, paste or describe it. If not, I'll deconstruct the topic myself and go find sources."
   - If provided: extract structure from the material (TOC, chapter breakdown, syllabus topics), and treat it as the first entry in `resources.md`.
   - If not: use your knowledge and web search to map the full territory of the topic, and to find 2-4 high-trust sources for `resources.md` before teaching begins.

**Then run DiSSS:**

3. **Deconstruction** — Break the topic into ALL its component parts. Present the full breakdown as a numbered list. Ask the user to review: "Does this capture the full territory? Anything missing or mischaracterised?"

4. **Selection (The 20%)** — Apply Pareto, referring back to the Mission from question 0. Propose which components are the 20% that deliver 80% of the value *given that mission*. For each selected item, explain WHY it made the cut. For excluded items, briefly note what's being left out and why.

   Challenge the user during selection — use interrogation style:
   - "Is [X] really in your 20%, or is it a nice-to-have?"
   - "What would you lose if we dropped [Y]?"
   - "Are you picking [Z] because it's high-value, or because it's familiar?"
   - "Does [Z] actually serve [the stated mission], or is it scope creep?"

5. **Sequencing** — Order the selected components into a learning sequence.
   - For code/infrastructure/tools: sequence by dependency (need X before Y)
   - For conceptual topics: sequence foundation-first, build up
   - Tag each item with its learning mode:
     - `task-driven` — code, infrastructure, tools (build something concrete)
     - `guided` — concepts, theory, languages, maths (teach with Feynman simplicity)

6. **Stakes setup** — Show the plan summary with number of sequence items and estimated sessions. No commitments required — just visibility.

7. **Seed resources.md** — Write `<topic-slug>/resources.md` with whatever sources were found in question 2, split into Knowledge (source material, docs, papers, courses) and Wisdom (communities, forums, people worth asking judgement calls). It's fine to start with just 1-2 entries — this grows during Session mode.

8. **Seed reference.md** — Write `<topic-slug>/reference.md` with just a `# Reference: <Topic Name>` heading. It stays empty until the first Session mode run populates it.

9. **Write the plan file** to `<topic-slug>/plan.md` at the configured location, using the format below. Commit message: `Create plan: <topic-name>`.

10. **Update the global index** at `index.md` (root): read the current contents, append a line under "Active Plans" with the new plan, write back. Commit message: `Index: add <topic-name>`. If `index.md` doesn't exist, create it from the seed format below.

11. **Seed flashcards.md:** create `<topic-slug>/flashcards.md` with just the heading and `#flashcards/<topic-slug>` tag from <flashcards> — no cards yet, Session/Grill modes append them. Works identically everywhere (no tooling restriction — it's a plain file write).

<plan_file_format>

```markdown
---
topic: "[Topic name]"
slug: "[topic-slug]"
created: [YYYY-MM-DD]
last-session: null
sessions-completed: 0
source-material: "[description, optional]"
learning-mode: [task-driven | guided | mixed]
---

# Learning Plan: [Topic Name]

## Mission
[The concrete real-world reason for learning this topic, 2-4 sentences]

## Deconstruction
[The full breakdown of the topic into component parts]

## Selection (The 20%)
[The selected components with rationale for inclusion/exclusion, tied back to the Mission]

## Sequence

### 1. [Topic Name]
- **mode:** [task-driven | guided]
- **status:** pending
- **sessions:** []
- **key-concepts:** []
- **gaps:** []
- **schedule:** null
- **description:** [What this covers and why it's in the 20%]

### 2. [Next Topic]
- **mode:** [task-driven | guided]
- **status:** pending
- **sessions:** []
- **key-concepts:** []
- **gaps:** []
- **schedule:** null
- **description:** [What this covers and why it's in the 20%]

[Continue for all sequence items...]

## Session Log
[Empty — populated by Session and Grill modes]
```

</plan_file_format>

<resources_file_format>

```markdown
# Resources: [Topic Name]

## Knowledge
High-trust sources this topic's teaching is grounded in.
- [Title](url) — one-line note on what it's good for

## Wisdom
Communities, forums, people to go to for judgement calls a source can't answer.
- [Name/place](url) — one-line note
```

</resources_file_format>

<reference_file_format>

```markdown
# Reference: [Topic Name]
```

(Starts empty beyond the heading — Session mode fills it in.)

</reference_file_format>

<index_file_format>

If `index.md` exists, append under "Active Plans":

```markdown
- [<Topic Name>](<topic-slug>/plan.md) — 0% complete, created [YYYY-MM-DD]
```

If `index.md` doesn't exist, create with:

```markdown
# Learning Index

Plans managed by the `learn` skill. Each topic lives in its own folder with a `plan.md`, `resources.md`, `reference.md`, `flashcards.md`, and a `notes/` directory.

## Active Plans

- [<Topic Name>](<topic-slug>/plan.md) — 0% complete, created [YYYY-MM-DD]
```

</index_file_format>

<plan_mode_success_criteria>
- Mission captured before Deconstruction
- All four DiSSS steps completed with user collaboration
- Plan file written to `<topic-slug>/plan.md`, including a `schedule: null` field on every sequence item
- `resources.md` and `reference.md` seeded
- Global `index.md` updated (or created)
- User has reviewed and approved the selection (the 20%)
- `flashcards.md` seeded with heading + deck tag
</plan_mode_success_criteria>
</plan_mode>

<session_mode>
Triggered when a plan exists and no other mode keyword matched.

Uses <plan_discovery> to locate the plan, then <due_schedule_check> to surface any overdue retrieval stages before teaching new material.

<process>

**1. Show Status**

Display a brief status line:
- "You're [X]% through [topic]. Last session: [N days ago / never]."
- Show which sequence item is next (first item with status `pending` or `in-progress`)
- If <due_schedule_check> found anything due, mention it here (oldest first), then proceed.

**2. Spaced Retrieval Warm-Up**

If there are completed topics with key-concepts recorded:

- Pull 2-3 key concepts from previous sessions
- Mix recent concepts with older ones (spaced repetition)
- Ask retrieval questions one at a time — not quiz-style multiple choice, but "explain this back to me" style
- Assess responses honestly:
  - **Solid:** move forward to next topic
  - **Shaky:** "Looks like [concept] hasn't fully stuck. Let's revisit before moving on." Return to that topic for a brief reinforcement before proceeding.

If this is the first session, skip the warm-up and go straight to teaching.

**3. Run the Session**

Check the current topic's `mode` tag and adapt:

**If mode is `task-driven` (code, infrastructure, tools):**
- Give a concrete task to build or do
- Coach through it — don't just give answers
- Explain the "why" as you go using the Feynman approach: plain language, no jargon without unpacking it
- Connect to things the user already knows (management analogies, team dynamics, system design where relevant)
- Pause at natural points: "Before I show you — what do you think happens here?"

**If mode is `guided` (concepts, theory, languages, maths):**
- Teach the concept with radical simplicity — Feynman style
- Use elaboration: connect to the user's existing knowledge
- Interleave "why" questions alongside "what" — don't just describe, challenge understanding
- Build up from first principles, not from jargon
- Ground claims in `resources.md` where possible: if you're teaching something a listed source covers, say so and cite it ("per [Source]..."). If you find yourself teaching a concept none of the listed resources cover, that's a sign to go find one — add it to `resources.md` before the session ends (see step 7).

**For both modes:**
- Adapt depth to how the user is responding:
  - Breezing through → push harder, go deeper, cover more ground
  - Struggling → slow down, break it smaller, revisit foundations
- Never dump information passively — every explanation should be followed by engagement
- Session length is organic — typically one sequence item, but adapt. User can stop at any time.

**4. Checkpoint**

At natural stopping points, do a comprehension check:
- Not a quiz — ask the user to explain back what was covered and why it matters
- "In your own words, what's the key insight here?"
- "How would you explain this to someone on your team?"
- If gaps appear, note them but don't derail — they'll feed into the next session or Grill mode

**5. Write Session Notes**

Write notes to `<topic-slug>/notes/<YYYY-MM-DD>.md` at the configured location. Capture explanations, analogies, and key insights from the session — reference material the user can return to, not a transcript. If a notes file for today already exists, append to it.

Commit message: `Notes: <topic> session <YYYY-MM-DD>`.

**6. Update reference.md**

Fold any newly-solidified facts, syntax, or short diagrams-in-text from this session into `<topic-slug>/reference.md`. Rewrite/compress rather than append — prune anything this session superseded. If nothing durable enough for a cheat-sheet came up this session, leave it unchanged.

**7. Update resources.md**

If this session cited or leaned on a source not already in `resources.md`, append it to the appropriate bucket (Knowledge or Wisdom) before moving on.

**8. Update the Plan**

Update `<topic-slug>/plan.md`:
- Update the current topic's `status` (to `in-progress` or `completed`)
- Add today's date to its `sessions` list
- Record key concepts covered in `key-concepts`
- Note any gaps identified in `gaps`
- **If status just flipped to `completed`:** populate its `schedule` field with day1/4/11/25 dates (today + 1, +4, +11, +25 days), each `done: false`.
- Add a session log entry with brief summary
- Update frontmatter: `last-session` date, increment `sessions-completed`

Commit message: `Plan: <topic> session <YYYY-MM-DD>`.

**9. Update the Index**

Update `index.md` to reflect the new completion percentage for this plan. Commit message: `Index: <topic> progress`.

**10. Write Flashcards**

Per <flashcards>, append 1 card per key-concept covered this session to `<topic-slug>/flashcards.md`, under the existing `#flashcards/<topic-slug>` tag. Pick Q&A vs cloze per concept — cloze for exact syntax/command recall, Q&A otherwise. No scheduling data to write; that's the reviewer's job, not this skill's. Works the same on every platform — no tooling restriction.

**11. Close**

Brief summary:
- What was covered
- What's next in the sequence
- Any gaps to revisit
- Any retrieval-schedule stages now due for other items
- Flashcards added to `flashcards.md`

</process>

<session_mode_success_criteria>
- Plan located and status shown, including any due schedule stages
- Retrieval warm-up completed (if prior sessions exist)
- Session ran in the correct mode (task-driven or guided)
- Comprehension checked at natural stopping points
- Session notes written; `reference.md` and `resources.md` updated where applicable
- Plan file updated with progress, concepts, gaps, and (if newly completed) a retrieval schedule
- Global index updated
- Flashcards written to `flashcards.md` for this session's key-concepts
</session_mode_success_criteria>
</session_mode>

<grill_mode>
Triggered by "grill me" / "quiz me" / "test me on X" / "interrogate me".

Sustained Feynman-style comprehension testing. Not a quiz — an interrogation that maps understanding depth and finds gaps. Gaps are written back to the learning plan so Session mode can revisit them.

Uses <plan_discovery> to locate the plan.

<scope>
Check if the user provided a target topic or concept:
- No scope → use <due_schedule_check> to find due stages across this plan's completed items, and run those. If nothing is due, fall back to covering ALL completed/in-progress topics (the old default sweep).
- Scoped (e.g. "Kafka consumer groups") → narrow to that specific topic or area, and if it has a due stage, run that stage's format; otherwise run a general Day-4-style Mechanism Synthesis interrogation.

If scoped and the topic doesn't match any sequence item, ask the user to clarify.
</scope>

<input_privacy_reminder>
Claude Code's input box can show a previous answer as ghost-text prompt-suggestion before the user starts typing — there's no per-skill toggle to disable this (global-only setting). Once per grill session, right after scope is determined and before the first question, remind the user: "Reminder — Claude Code may ghost-suggest a past answer in the input box before you start typing. Cover the input line (hand, card, whatever) until you've recalled your own answer." Do not repeat this reminder before every subsequent question in the same session.
</input_privacy_reminder>

<pre_grill_stats>
Optional — run <flashcard_due_check> for this topic before starting. If it
surfaces due cards, you can weight questions toward those concepts. If it
finds nothing (no file yet, or nothing reviewed in Obsidian yet), skip
silently — verbal grill responses are sufficient on their own either way.
</pre_grill_stats>

<stage_handlers>

**Day 1 — Memory-Only Recall.** State up front: "This is zero-notes recall — don't check reference.md for this one." Ask the user to explain the item's key concepts from memory, one at a time. Do not give your own explanation until *after* they've attempted an answer (unlike the other stages, where comparison is immediate) — the point is forcing retrieval, not recognition.

**Day 4 — Mechanism Synthesis.** This is the core Feynman interrogation:

Ask questions one at a time. Wait for the user's response before continuing.

Question style:
- "Explain [concept] to me like I just joined your team and have no context."
- "Why does [X] work that way?"
- "What would happen if [Y] wasn't there?"
- "How is [X] different from [Y]?"
- "Give me an analogy for [concept]."
- "You used the term [jargon] — unpack that for me in plain language."

Follow-up relentlessly:
- If the explanation uses jargon, ask them to unpack it
- If the explanation is vague, ask for specifics
- If the explanation is confident, probe the edges: "What breaks if...?", "When would this NOT apply?"
- Walk the dependency tree: if their explanation of topic B relies on topic A, drill into A to check the foundation

After each response, provide your recommended answer: your own clear, simple explanation of the same concept, framed as "Here's how I'd explain it:" not "Here's the right answer:" — lets the user compare their mental model to a reference one.

For code/infrastructure topics specifically:
- May ask: "What does this code do?" (show a snippet)
- May ask: "How would you build [X]?" (sketch before showing)
- May ask: "What's wrong with this approach?" (test critical thinking)
- Tests application and reasoning, not recall

**Day 11 — Rapid Compression Quiz.** Rapid-fire flashcard-style recall, not deep interrogation. If `flashcard_due_check` surfaced anything for this topic, pull those first; otherwise generate rapid-fire prompts directly from the item's `key-concepts`. Move fast — this is drilling, not teaching. Give the correct answer immediately after each response (unlike Day 1).

**Day 25 — Master Debrief.** A full interrogation of this specific item, capped around 5 minutes — run the Day 4 Mechanism Synthesis style, but scoped tightly and moving faster, covering every key-concept for the item at least once. This closes the schedule: after this stage, mark all four stages `done: true` on this item, regardless of individual stage history.

</stage_handlers>

**Tone (all stages):**
- Curious colleague, not examiner
- Intense but not adversarial — Matt Pocock "grill-me" energy
- Don't let the user off the hook, but don't make them feel bad
- "I'm not convinced you've got this yet — try again" is fine
- "Wrong!" is not

<gap_mapping>
Silently track assessment for each concept as you go:

- **Solid:** Can explain simply, handles follow-ups, connects to other concepts
- **Shallow:** Has the gist but can't go deeper, relies on jargon, or can't connect it
- **Gap:** Can't explain without jargon, hits a wall, or has misconceptions

Do not reveal the tracking during the interrogation — save it for the gap-map presentation at the end.
</gap_mapping>

<gap_map>
When the interrogation is complete (all due stages covered, or user stops), present the gap map:

```
## Understanding Map

### Solid
- [Concept A] — clean explanation, handled edge cases
- [Concept B] — good analogy, connected to [related concept]

### Shallow
- [Concept C] — got the gist but couldn't explain why
- [Concept D] — relied on jargon, struggled with follow-ups

### Gap
- [Concept E] — couldn't explain without looking it up
- [Concept F] — had a misconception about [specific thing]
```

No judgement — just honest assessment. Frame it as a map of where to focus next.
</gap_map>

<plan_update>
After the gap-map presentation, update `<topic-slug>/plan.md`:

- Write identified gaps into the relevant sequence items' `gaps` field
- Mark whichever schedule stage(s) were just run as `done: true`
- Add a session log entry: `Grill session [YYYY-MM-DD]: [N] solid, [N] shallow, [N] gaps identified`

Commit message: `Plan: <topic> grill <YYYY-MM-DD>`.

Update `index.md` only if completion percentage shifted (rare — grills annotate items, they don't move them).

**Write flashcards for gaps:** per <flashcards>, append a card to `flashcards.md` for each concept that landed in Shallow or Gap — these are the ones worth drilling later. Skip Solid concepts; no need to card everything. No scheduling data to write — same as Session mode.
</plan_update>

<grill_mode_success_criteria>
- Scope correctly identified (due schedule stage, named topic, or full sweep)
- The right stage handler used when a schedule stage was due
- Questions asked one at a time, Feynman style where applicable
- Jargon challenged, follow-ups pursued (Day 4 / Day 25)
- Recommended answer provided after each response (except Day 1, which withholds until after the attempt)
- Gap map presented after interrogation
- Gaps written back to the plan file; due schedule stages marked done
- Flashcards written for Shallow/Gap concepts
</grill_mode_success_criteria>
</grill_mode>

<debrief_mode>
Triggered by "debrief" / "morning debrief" / "quick debrief".

A 60-second cross-topic recall pulse-check — not a teaching moment, not a full grill. Never auto-suggested; only runs when explicitly asked for.

<process>

1. **Find what's due, across all active plans:** read `index.md`, then each plan's completed items for due schedule stages (via <due_schedule_check>, applied across every plan rather than one). Also run <flashcard_due_check> for each topic — optional, best-effort, skip silently wherever it finds nothing. Pool everything due into one list.

2. **Pick 1-2 items.** Prefer the most overdue. If nothing is due anywhere, say so plainly: "Nothing's due right now — nice job staying on top of it," and stop here.

3. **Ask, zero notes, hard 60-second framing.** State up front: "Quick debrief — no notes, keep it tight." Ask one question per chosen item (a due plan-schedule concept, or a due flashcard's question text). Do not show a reference answer, during or after — this is a pulse-check, not a lesson. If the user gets it wrong or hesitates badly, just note it silently; it will resurface at that item's next real schedule stage, or next time it's reviewed in Obsidian.

4. **Close immediately.** No debrief, no gap map, no discussion. "Got it — see you next time." (If the user wants to actually discuss what they got wrong, that's a cue to switch to Session or Grill mode, not something Debrief mode does itself.)

Debrief mode writes nothing — not to `notes/`, `reference.md`, `resources.md`, `plan.md`, or `flashcards.md`. It's a read-only pulse-check; SM-2 state is Obsidian's to own, and only a real review there updates it.

</process>

<debrief_mode_success_criteria>
- Never runs without an explicit "debrief" keyword
- At most 1-2 questions, pulled from what's actually due across all plans (plan schedules, plus flashcards.md when <flashcard_due_check> finds something)
- No reference answer shown, no teaching, no gap map
- Interaction stays short — this is a pulse-check
- No files written — Debrief mode is read-only
</debrief_mode_success_criteria>
</debrief_mode>
