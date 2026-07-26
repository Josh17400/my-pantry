# Architect decisions — answers to Track A open questions + change requests

Track A (units) shipped clean: 62/62 tests, verified independently in isolation.
These are the rulings on its seven open questions, plus corrections and change requests to
apply during M1 integration (after Track B lands — not while B is still writing to
`packages/core`).

---

## Answers to Track A's open questions

**1. Edge factor convention — keep as implemented.**
`toBase = fromBase * factor`, expressed in each form's own base unit. Seed data expresses
edges in base units, not display units, so seed authoring never carries unit-parsing burden.
No change.

**2. Bidirectional edges — CHANGE REQUESTED.**
Auto-invert by default. Most culinary conversions are genuinely symmetric (1 clove = 3 g
implies 3 g = 1 clove), and forcing the seed to emit both directions doubles its size and
invites the two directions to drift out of sync.

But some conversions are **physically one-way**: whole chicken → boneless yield is lossy, and
you cannot invert it. So:

```ts
ConversionEdge { …, oneWay?: boolean }   // default false
```

`convert()` walks declared edges plus the inverse (`1/factor`) of every edge not marked
`oneWay`. Inverted edges must carry the same `uncertaintyPct` and a path key that makes the
inversion visible (e.g. `b->a~inv`).

**3. Volume↔count chaining density + gramsPerCount, double-counting uncertainty — accept.**
Conservative is correct here. A two-bridge path genuinely is less trustworthy than either
bridge alone. No change.

**4. Range handling — CHANGE REQUESTED.**
Midpoint alone is not sufficient, because the two consumers want opposite ends:

- **Grocery list / shortfall** wants the **high** end — under-buying means a second trip.
- **Pantry deduction** wants the **midpoint** — deducting the high end drifts inventory low.

So expose all three rather than deciding in the parser:
`{ kind: 'quantity', qty: midpoint, low, high, isRange: true }`.
Callers choose. Do not collapse the range at parse time.

**5. Non-quantified display strings — UI-only.**
Core returns the phrase key (`'to-taste'`, `'pinch'`). Core stays string-free and
locale-free; UI owns all user-facing copy. No change.

**6. Imperial / UK units — confirmed out of scope, but CHANGE REQUESTED.**
Never accept Imperial aliases. However, silently reading a UK recipe's "1 pint milk" as the
US 473 ml when it means 568 ml is a **20% silent corruption** — exactly the failure class this
whole unit system exists to prevent. It becomes reachable in M3 via URL recipe import.

Add `ambiguousLocale: true` to the unit definitions that differ between US and Imperial —
`pint`, `quart`, `gallon`, `fl oz`, `cup`. `parseQuantity` surfaces the flag so the import
path can ask instead of guessing. Do not reject; do not silently assume. Flag it.

**7. Uncertainty display markers — UI concern.**
`formatQuantity` keeps stripping unjustified precision and stays free of `±`/`~` glyphs, but
must **return** the uncertainty alongside the string so the provenance UI can render its own
marker. Presentation is not core's job; the number is.

---

## Correction — terminology, not math

The report calls `236.5882365 ml` the **"US legal cup."** It is not. That is the US
**customary** cup (1/16 US gallon). The US **legal** cup is exactly **240 ml** (FDA, used for
nutrition labeling).

**The implemented value is correct** — recipes use the customary cup, so no math changes. But
the comment must be fixed, because someone later reading "legal cup" next to 236.588 will
"correct" it to 240 and silently break every recipe conversion in the app.

Flag for later: if nutrition panels or package serving sizes are ever parsed (post-M3), those
use the 240 ml legal cup and need a **separate** unit id — not a redefinition of `cup`.

---

## Integration work (architect-owned, after Track B lands)

1. Wire `packages/core/src/index.ts` — neither track was allowed to touch it.
2. Reconcile the A/B seam: Track B defined a local structural type rather than importing from
   `src/units/` (correct call — units was churning). Replace with the real shared types.
3. Apply change requests 2, 4, 6 above and the terminology fix.
4. Full-workspace `npm run typecheck` + `npm run test` green — the real gate, which neither
   track could satisfy alone while the other was mid-flight.
