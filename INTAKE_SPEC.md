# The Forge — Intake Spec

This spec lives inside **Daily Warrior's Lesson**. The free tier is the calendar lesson and a short archive. The Forge is the upgrade path in the same app: twelve questions, scored into source lanes, then a 70 / 30 aimed feed.

---

## Design principle

Ask what they **admire**, not what they want. Admiration is honest; desire is performative. The gap between who they say they are and who they actually are is where the real lessons live.

---

## Section 1 — Original questions (admiration & fuel)

### 1. Who do you look up to?
Pick three from a list:
- **Warrior** — Alexander, Washington, Leonidas, Patton
- **Thinker** — Socrates, Einstein, Marcus Aurelius, Seneca
- **Builder** — Edison, Musk, Ford, the Wright brothers
- **Statesman** — Lincoln, Churchill, Washington, Marcus Aurelius
- **Father figure** — a man who raised you, a mentor, a coach
- **Religious figure** — David, Paul, a saint, a prophet

*Maps to source voice: warrior picks → history & Greene; thinker picks → Stoics & Scripture; builder picks → Greene's Mastery & 33 Strategies.*

### 2. What do you avoid?
- Fear
- Conflict
- Hard conversations
- Physical discomfort
- Being seen as weak
- Failure in public
- Responsibility for others

*Avoidance is the wound. The lesson targets it directly.*

### 3. What do you keep failing at?
- Discipline
- Patience
- Courage
- Providing
- Leading
- Staying calm under pressure
- Keeping promises to yourself

*Failure names the exact lesson.*

### 4. What makes you feel most alive?
- Building something
- Protecting someone
- Winning
- Creating
- Serving
- Mastering a craft
- Being tested

*This is their fuel. Lessons lean into it.*

### 5. What can't you stand in other men?
- Cowardice
- Dishonesty
- Laziness
- Entitlement
- Betrayal
- Weakness dressed as kindness

*People hate in others what they fear in themselves.*

### 6. What season of life are you in?
- Young and untested
- Mid-life and stuck
- Older and mentoring
- Recovering from a fall
- Starting over

*A twenty-year-old and a fifty-year-old need different lessons on the same topic.*

### 7. What does a good man owe the world?
*(Open text, 1–2 sentences.)*

*Replaces politics as a category — same signal, no fight.*

---

## Section 2 — Therapy-style questions (values & wounds)

### 8. Values card sort
Rank these from most to least important. Top five matter most:
Courage · Loyalty · Mastery · Freedom · Integrity · Strength · Wisdom · Service · Honor · Discipline · Faith · Family · Legacy · Justice · Patience

*Single best predictor of which lessons will actually land.*

### 9. The miracle question
If you woke up tomorrow and the thing holding you back was gone, what would be different?

*Bypasses the complaint. Reveals the real goal hiding underneath.*

### 10. Exception finding
When did you already handle this well — even once?

*Hunt for the moment competence already existed. That is the thread to pull.*

### 11. Cost of the status quo
What is staying where you are costing you — in health, relationships, respect, time, money?

*People stay stuck until the pain of staying outweighs the pain of changing.*

### 12. The empty chair
If the man you want to become were sitting across from you right now, what would he say to you?

*Gets raw fast. Surfaces the gap between current and ideal self.*

---

## Section 3 — Scoring logic

Each answer maps to one or more **source lanes**:

| Lane | Sources |
|---|---|
| Warrior | Alexander, Washington, Crusades, 1 Samuel, Patton |
| Thinker | Socrates, Stoics (Marcus, Epictetus, Seneca, Musonius), Proverbs |
| Builder | Greene: Mastery, 33 Strategies of War, The 50th Law |
| Power | Greene: 48 Laws of Power, Art of Seduction, Law of Human Nature, Daily Laws |
| Faith | Proverbs, James, 1 Samuel, Crusades theology |
| Odyssey | Homer, the journey archetype |

**Scoring rules:**
1. Admiration picks (Q1) weight the primary lane — 3 points each.
2. Avoidance (Q2) and failure (Q3) add 2 points to the lane that addresses that wound.
3. Values sort (Q8) adds 1 point per top-five value matched to a lane.
4. Miracle question (Q9) and empty chair (Q12) are free-text; keyword-match against lane themes, 1 point each.
5. Season of life (Q6) filters difficulty — untested gets foundational lessons, mentoring gets teaching lessons.

**Output:** top two lanes become the user's primary and secondary. Daily lessons draw 70% from primary, 30% from secondary, rotating so no source repeats within five days.

**Storage (v1):** `localStorage.forged_path` on the phone holds the scored path. The twelve questions stay free. Applying the 70 / 30 feed is the paid step: a Stripe Payment Link returns to this static site with `?forge_paid=` plus a success token, stored as `localStorage.forge_paid`. No accounts. No Stripe.js backend. See README for the placeholder URL and token.

**Archive:** stays free. Crisis copy still points to 988 / findahelpline.com.

---

## Section 4 — Safety

This is intake, not therapy. If answers indicate real depression, trauma, or self-harm risk, the app surfaces a redirect to 988 / findahelpline.com — not a quote.
