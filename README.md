# Shopee Order Splitter

Vouchers have minimum spends. Splitting one food order into several lets you
stack more of them, but every order pays its own delivery fee. This works out
the cheapest way to split, and who owes what.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 59 tests, ~8s
npm run build    # -> dist/
npm run preview  # serve the built output
```

## How the search works

The interesting part is `src/lib/solver.js`.

**Voucher assignment.** Once you know an order's subtotal, voucher eligibility
is just `subtotal >= min`. That threshold structure means a greedy is optimal:
hand out the biggest discounts first, each to the *cheapest* order that still
clears its minimum. A bigger order can always take over a smaller one's
voucher, so you never want to burn a large order on a low minimum. This is
checked against a brute-force optimal matcher on 20,000 random cases in
`test/solver.test.js`.

**Two voucher pools.** Item vouchers and delivery vouchers are separate slots,
the way Shopee's discount voucher and free-shipping voucher stack on one order.
Because the pools never compete for the same slot, maximising each
independently and adding the results is the true optimum for a given split -
that is what `combinedDiscount()` does, and the search optimises the sum.

A delivery voucher is capped at the delivery fee, so a RM10 shipping voucher
against a RM6.30 fee is worth RM6.30, not RM10. Without that cap the surplus
would show up as a phantom saving on the grand total.

Worth knowing: free-shipping vouchers alone can never make *more* orders
strictly cheaper, since an extra order's fee is at most fully covered. What
they do is stop delivery from eating the gain from an extra item voucher, which
can flip which split wins. `test/plan.test.js` pins that case down.

That greedy is O(vouchers × orders), which is what makes the brute force
affordable:

| Basket | Method | Cost |
| --- | --- | --- |
| up to 14 units | every possible split (11.2M partitions) | ~440 ms, guaranteed cheapest |
| 15+ units | heuristic | single-digit ms, optimal in practice |

The exhaustive walk uses restricted growth strings, so each partition is
visited exactly once and the order count is always exact. `countPartitions()`
is asserted to equal the number of partitions actually walked.

The heuristic seeds from items sorted by price descending — contiguous slices,
round-robin, greedy balance, and seeds aimed straight at the voucher minimums —
then polishes the best of them with move/swap local search and deterministic
random restarts. It uses its own PRNG rather than `Math.random` so the same
basket always gives the same plan; the answer wobbling as you retype a price
would be worse than a slightly suboptimal split. At 15 units, where it first
kicks in, it matches the brute-force optimum on every basket tested.

All money is integer cents. In ringgit, a comparison like `subtotal >= 48.00`
can be wrong by a hundredth of a cent, which silently loses you a voucher.

## Layout

```
src/
  lib/            pure logic, no Vue - all of it unit tested
    solver.js       partitioning + voucher assignment
    plan.js         turns a split into orders, shares, near misses, summary text
    money.js        cents <-> RM
    defaults.js     the starting basket
  composables/
    useSplitter.js  state, debounced solve, derived results
  components/       one concern each, props down / events up
```

`VoucherEditor` is mounted twice, once per pool - the two are the same shape, so
they share an editor and differ only in labels.

`useSplitter` is a composable, not a Pinia store: one screen, no routing,
nothing outside the tree needs the state. Add Pinia if a second route appears.

The solve is synchronous and can take ~half a second on a large basket, so it
runs from a debounced snapshot of the inputs rather than directly off them.
Typing stays smooth, and `solving` drives the "working it out" note.

Components never mutate their props. Rows emit `update(index, field, value)`
and the parent applies it, which keeps every component trivially testable.

## Styling

Tailwind CSS v4, wired in through `@tailwindcss/vite` — no `tailwind.config.js`,
no PostCSS step. The theme lives in `src/assets/base.css`.

The palette stays in plain custom properties that flip on `prefers-color-scheme`,
and `@theme inline` republishes them as Tailwind colours:

```css
@theme inline {
  --color-card: var(--card);
  --color-accent: var(--accent);
}
```

So `bg-card` compiles to `background: var(--color-card)` → `var(--card)`, and dark
mode works without a single `dark:` variant in the markup. One palette to edit,
in one place.

Two things are deliberately not utilities:

- **Inputs are styled by element** in `@layer base`. Every text and number field
  in the app looks identical, so repeating the same eight utilities across two
  dozen inputs would be noise.
- **`.card`, `.card-title`, `.hint`, `.add`, `.del`** are `@apply` primitives in
  `@layer components`. They repeat across six components; inlining them would put
  a forty-class string on every card.

Everything else is utilities at the call site.

Semantic class names (`.item-row`, `.order`, `.persons`, `.grand`, …) are kept in
the markup as hooks even where they carry no styles. The component tests select on
them, so they are part of each component's contract — that is why the Tailwind
conversion changed no test.

## Responsive layout

The single 560px column that suited a phone wasted the whole width of a desktop
and buried the results below the fold. The page now reflows:

| Width | Layout |
| --- | --- |
| below 768px | one column — unchanged from the phone layout |
| 768px and up (`md`) | two columns: inputs \| results |

The layout uses Tailwind's stock `md` breakpoint, so there is no custom
breakpoint in the theme to keep in your head. The one raw media query in
`base.css` (body padding) is written as `width >= 48rem` to stay in step with it.

Measured on the default basket in a 900px-tall window: **2.91 screens of
scrolling before, 1.55 after**. The comparison table and the grand total are above
the fold; the payer list and the copy button sit below the plan, so reading those
still takes one scroll. That is the cost of two columns rather than three — with a
third column the payer list fitted beside the plan.

**Cards size themselves with container queries, not viewport breakpoints.** An
items card does not know whether it is in a narrow or wide column, so it measures
itself: item rows go single-line at 440px, order cards tile at 480px, the payer
list splits at 520px, and the two voucher editors sit side by side once the input
column passes 530px. In the two-column layout at 1440px that means order cards and
payers both tile three across, which is why dropping to two columns cost only
0.04 of a screen.

**The order cards tile at a width where a couple of item names wrap.** That looks
worse in isolation but measures shorter — two columns of slightly wrapped cards
beat one column of unwrapped ones by about 150px. Both were measured before
choosing.

The grand total leads the plan card rather than closing it, so the answer is on
screen before the order-by-order detail. That helps on a phone too.

## Notes on behaviour

- **Naming an item is optional.** Two rows with the same name become one
  payment, and `Mee Goreng x2` under one name means that person pays for both.
  Leave the name blank and each unit is billed on its own, which is how the app
  behaved before names existed. Units still move between orders individually -
  that is what makes the vouchers stack - so one person's items can land in
  different orders while they still owe a single amount.
- **The seeded delivery vouchers are placeholders.** `src/lib/defaults.js` ships
  a free-shipping voucher at min RM25 and a RM4-off at min RM15 so the feature
  is visible on first load. Replace them with the ones you actually hold.
- **Rows with no price are ignored.** They are almost always an empty row you
  have not filled in, and counting one as a person who owes nothing distorts
  the head count and the flat rate.
- **Shares add up exactly.** Everyone pays `their share of the food / total ×
  grand total`, rounded to the cent, and the last person absorbs the remainder —
  unless that would take them below zero, in which case the biggest payer
  absorbs it.
- **`dist/` needs to be served.** Module scripts are CORS-blocked on
  `file://`, so the built output will not run by double-clicking it. Use
  `npm run preview`, or host it. `reference/original-single-file.html` is the
  pre-Vue version, which does still work straight from disk.
