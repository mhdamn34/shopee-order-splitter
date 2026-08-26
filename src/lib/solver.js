import { toCents } from './money.js'

export const MAX_ORDERS = 4

// If a basket can be partitioned in more ways than this we stop trying every
// possibility and switch to the heuristic. 12 million partitions is 14
// individual units, which takes roughly half a second.
export const MAX_PARTITIONS = 12_000_000

// Heuristic tuning: how many "cut the sorted list into k blocks" starting
// points we look at, and how many of the best ones we then polish.
const SEED_LIMIT = 40_000
const SEEDS_TO_POLISH = 12

/* ------------------------------------------------------------------ */
/* Voucher assignment                                                   */
/*                                                                      */
/* Given the subtotals of the orders in one split, work out the best     */
/* total discount. Because a voucher is eligible purely on "subtotal >=  */
/* min spend", handing out the biggest discounts first and giving each   */
/* one to the *cheapest* order that still clears its minimum is provably */
/* optimal - a bigger order can always take over a smaller order's       */
/* voucher, so we never want to spend a big order on a low minimum.      */
/* That keeps this O(vouchers x orders), which matters because it runs   */
/* millions of times inside the exhaustive search.                       */
/* ------------------------------------------------------------------ */

const scratchOrder = new Int32Array(MAX_ORDERS)
const scratchTaken = new Uint8Array(MAX_ORDERS)
const scratchPicks = new Int32Array(MAX_ORDERS)

export function bestDiscountFor (subtotals, orderCount, vouchers) {
  for (let i = 0; i < orderCount; i++) {
    scratchOrder[i] = i
    scratchTaken[i] = 0
    scratchPicks[i] = -1
  }

  // Insertion sort the order indexes by subtotal, cheapest first (max 4 items).
  for (let i = 1; i < orderCount; i++) {
    const g = scratchOrder[i]
    let j = i - 1
    while (j >= 0 && subtotals[scratchOrder[j]] > subtotals[g]) {
      scratchOrder[j + 1] = scratchOrder[j]
      j--
    }
    scratchOrder[j + 1] = g
  }

  let total = 0
  let free = orderCount
  for (let v = 0; v < vouchers.length && free > 0; v++) {
    const min = vouchers[v].min
    for (let i = 0; i < orderCount; i++) {
      const g = scratchOrder[i]
      if (scratchTaken[g] === 0 && subtotals[g] >= min) {
        scratchTaken[g] = 1
        scratchPicks[g] = v
        total += vouchers[v].off
        free--
        break
      }
    }
  }
  return total
}

// Item vouchers and delivery vouchers are separate pools: an order can carry
// one of each, the way Shopee's discount slot and free-shipping slot stack. The
// pools never compete for the same slot, so maximising them independently and
// adding the results is the true optimum for a given split.
export function combinedDiscount (subtotals, orderCount, pools) {
  let total = bestDiscountFor(subtotals, orderCount, pools.item)
  if (pools.delivery.length > 0) {
    total += bestDiscountFor(subtotals, orderCount, pools.delivery)
  }
  return total
}

// Same thing, but allocates and hands back which voucher landed on which
// order. Used once per render rather than millions of times per solve.
export function assignVouchers (subtotals, orderCount, vouchers) {
  const discount = bestDiscountFor(subtotals, orderCount, vouchers)
  const picks = []
  for (let g = 0; g < orderCount; g++) picks.push(scratchPicks[g])
  return { discount, picks }
}

/* ------------------------------------------------------------------ */
/* Exhaustive search                                                    */
/* ------------------------------------------------------------------ */

// Sum of Stirling numbers of the second kind: how many ways n units split
// into 1..maxOrders non-empty groups.
export function countPartitions (n, maxOrders) {
  if (n === 0) return 0
  let row = [1, 0, 0, 0, 0]
  for (let i = 1; i <= n; i++) {
    const next = [0, 0, 0, 0, 0]
    for (let k = 1; k <= maxOrders; k++) {
      next[k] = k * row[k] + row[k - 1]
    }
    row = next
  }
  let total = 0
  for (let k = 1; k <= maxOrders; k++) total += row[k]
  return total
}

// Walks every partition exactly once using restricted growth strings: unit i
// may join any group already in use, or open the next one. That guarantees no
// duplicate partitions and that the group count is always exact.
export function exhaustiveSearch (prices, pools, maxOrders) {
  const n = prices.length
  const assign = new Int32Array(n)
  const subtotals = new Int32Array(MAX_ORDERS)
  const bestDiscount = new Int32Array(MAX_ORDERS + 1).fill(-1)
  const bestAssign = new Array(MAX_ORDERS + 1).fill(null)

  function walk (index, used) {
    if (index === n) {
      const discount = combinedDiscount(subtotals, used, pools)
      if (discount > bestDiscount[used]) {
        bestDiscount[used] = discount
        bestAssign[used] = Int32Array.from(assign)
      }
      return
    }
    const top = Math.min(used, maxOrders - 1)
    for (let g = 0; g <= top; g++) {
      assign[index] = g
      subtotals[g] += prices[index]
      walk(index + 1, g === used ? used + 1 : used)
      subtotals[g] -= prices[index]
    }
  }

  walk(0, 0)
  return { bestDiscount, bestAssign }
}

/* ------------------------------------------------------------------ */
/* Heuristic search, used when there are too many units to brute force  */
/*                                                                      */
/* Prices arrive sorted highest first. We slice that list into k         */
/* contiguous blocks in every way we can afford to look at, add seeds    */
/* aimed straight at the voucher minimums, then polish the best of them  */
/* by moving and swapping individual units until nothing improves.       */
/* ------------------------------------------------------------------ */

function subtotalsOf (assign, orderCount, prices, out) {
  for (let g = 0; g < orderCount; g++) out[g] = 0
  for (let i = 0; i < prices.length; i++) out[assign[i]] += prices[i]
}

function polish (seed, orderCount, prices, pools) {
  const n = prices.length
  const assign = Int32Array.from(seed)
  const subtotals = new Int32Array(MAX_ORDERS)
  const counts = new Int32Array(MAX_ORDERS)

  subtotalsOf(assign, orderCount, prices, subtotals)
  for (let i = 0; i < n; i++) counts[assign[i]]++

  let best = combinedDiscount(subtotals, orderCount, pools)
  let changed = true
  let passes = 0

  while (changed && passes < 60) {
    passes++
    changed = false

    // Try moving a single unit to another order.
    for (let i = 0; i < n; i++) {
      const from = assign[i]
      if (counts[from] === 1) continue // an order must not become empty
      for (let to = 0; to < orderCount; to++) {
        if (to === from) continue
        subtotals[from] -= prices[i]
        subtotals[to] += prices[i]
        const moved = combinedDiscount(subtotals, orderCount, pools)
        if (moved > best) {
          best = moved
          assign[i] = to
          counts[from]--
          counts[to]++
          changed = true
          break
        }
        subtotals[from] += prices[i]
        subtotals[to] -= prices[i]
      }
    }

    // Try swapping two units that sit in different orders.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = assign[i]
        const b = assign[j]
        if (a === b || prices[i] === prices[j]) continue
        const delta = prices[j] - prices[i]
        subtotals[a] += delta
        subtotals[b] -= delta
        const swapped = combinedDiscount(subtotals, orderCount, pools)
        if (swapped > best) {
          best = swapped
          assign[i] = b
          assign[j] = a
          changed = true
        } else {
          subtotals[a] -= delta
          subtotals[b] += delta
        }
      }
    }
  }

  return { discount: best, assign }
}

// Builds a starting point aimed at a specific set of vouchers: fill each order
// with the biggest items until it clears its target minimum spend, closing the
// last of the gap with the cheapest item that still does the job. This is what
// makes the heuristic chase the voucher thresholds rather than just chopping
// the list into blocks.
function fillSeed (targets, orderCount, prices, assign) {
  const n = prices.length
  const used = new Uint8Array(n)
  const subtotal = new Int32Array(MAX_ORDERS)
  const counts = new Int32Array(MAX_ORDERS)

  // Biggest target first, or a small minimum spend steals the items a big one needs.
  const visitOrder = []
  for (let g = 0; g < orderCount; g++) visitOrder.push(g)
  visitOrder.sort((a, b) => targets[b] - targets[a])

  assign.fill(-1)

  for (const g of visitOrder) {
    const target = targets[g]
    for (let i = 0; i < n && subtotal[g] < target; i++) {
      if (used[i]) continue
      let pick = i
      if (subtotal[g] + prices[i] >= target) {
        // Prices are sorted high to low, so scanning from the end finds the
        // cheapest item that still gets us over the line.
        for (let j = n - 1; j > i; j--) {
          if (!used[j] && subtotal[g] + prices[j] >= target) { pick = j; break }
        }
      }
      used[pick] = 1
      assign[pick] = g
      subtotal[g] += prices[pick]
    }
  }

  // Leftovers join whichever order is currently smallest.
  for (let i = 0; i < n; i++) {
    if (used[i]) continue
    let smallest = 0
    for (let g = 1; g < orderCount; g++) {
      if (subtotal[g] < subtotal[smallest]) smallest = g
    }
    assign[i] = smallest
    subtotal[smallest] += prices[i]
  }

  // An order with nothing in it is not an order - borrow the cheapest spare item.
  for (let i = 0; i < n; i++) counts[assign[i]]++
  for (let g = 0; g < orderCount; g++) {
    if (counts[g] > 0) continue
    let donor = -1
    for (let i = n - 1; i >= 0; i--) {
      if (counts[assign[i]] > 1) { donor = i; break }
    }
    if (donor < 0) return false
    counts[assign[donor]]--
    assign[donor] = g
    counts[g]++
  }
  return true
}

function heuristicForCount (prices, pools, orderCount) {
  const n = prices.length
  const assign = new Int32Array(n)
  const subtotals = new Int32Array(MAX_ORDERS)
  const cuts = new Array(Math.max(0, orderCount - 1))
  const seeds = [] // the best few starting points, worst first
  let seen = 0

  function consider (discount, candidate) {
    if (seeds.length < SEEDS_TO_POLISH) {
      seeds.push({ discount, assign: Int32Array.from(candidate) })
      seeds.sort((a, b) => a.discount - b.discount)
    } else if (discount > seeds[0].discount) {
      seeds[0] = { discount, assign: Int32Array.from(candidate) }
      seeds.sort((a, b) => a.discount - b.discount)
    }
  }

  function evaluate (candidate) {
    subtotalsOf(candidate, orderCount, prices, subtotals)
    consider(combinedDiscount(subtotals, orderCount, pools), candidate)
  }

  function applyCuts () {
    let group = 0
    for (let u = 0; u < n; u++) {
      if (group < cuts.length && u === cuts[group]) group++
      assign[u] = group
    }
  }

  function place (depth, start) {
    if (seen >= SEED_LIMIT) return
    if (depth === orderCount - 1) {
      seen++
      applyCuts()
      evaluate(assign)
      return
    }
    for (let c = start; c <= n - (orderCount - 1 - depth); c++) {
      cuts[depth] = c
      place(depth + 1, c + 1)
      if (seen >= SEED_LIMIT) return
    }
  }
  place(0, 1)

  // Round-robin: spreads the expensive items evenly.
  for (let i = 0; i < n; i++) assign[i] = i % orderCount
  evaluate(assign)

  // Greedy balance: each item joins whichever order is currently smallest.
  subtotals.fill(0)
  for (let i = 0; i < n; i++) {
    let smallest = 0
    for (let g = 1; g < orderCount; g++) {
      if (subtotals[g] < subtotals[smallest]) smallest = g
    }
    assign[i] = smallest
    subtotals[smallest] += prices[i]
  }
  evaluate(assign)

  // Voucher-targeted seeds: for every set of vouchers we could plausibly land,
  // build an order layout that aims straight at those minimum spends.
  // Aim at the item minimums and the delivery minimums alike - a free-shipping
  // voucher has its own threshold worth reaching for.
  const thresholds = [...new Set([...pools.item, ...pools.delivery].map(v => v.min))]
    .sort((a, b) => b - a)
  const voucherLimit = Math.min(thresholds.length, 10)
  const chosen = []
  const targets = new Array(MAX_ORDERS)
  function buildTargets (start) {
    if (chosen.length > 0) {
      for (let t = 0; t < orderCount; t++) targets[t] = t < chosen.length ? chosen[t] : 0
      if (fillSeed(targets, orderCount, prices, assign)) evaluate(assign)
    }
    if (chosen.length === orderCount) return
    for (let v = start; v < voucherLimit; v++) {
      chosen.push(thresholds[v])
      buildTargets(v + 1)
      chosen.pop()
    }
  }
  buildTargets(0)

  let best = null
  for (const seed of seeds) {
    const polished = polish(seed.assign, orderCount, prices, pools)
    if (best === null || polished.discount > best.discount) best = polished
  }

  // Random restarts, using our own generator rather than Math.random so the
  // same basket always produces the same answer - nobody wants the plan to
  // wobble every time they retype a price.
  let rng = 2463534242 + n * 7919 + orderCount
  function nextRandom () {
    rng ^= (rng << 13); rng >>>= 0
    rng ^= (rng >> 17)
    rng ^= (rng << 5); rng >>>= 0
    return rng
  }
  const restarts = n <= 30 ? 40 : 15
  for (let r = 0; r < restarts; r++) {
    for (let i = 0; i < n; i++) assign[i] = nextRandom() % orderCount
    // Park one unit in each order so none of them ends up empty.
    for (let g = 0; g < orderCount; g++) assign[g] = g
    const shaken = polish(assign, orderCount, prices, pools)
    if (best === null || shaken.discount > best.discount) best = shaken
  }

  return best
}

export function heuristicSearch (prices, pools, maxOrders) {
  const bestDiscount = new Int32Array(MAX_ORDERS + 1).fill(-1)
  const bestAssign = new Array(MAX_ORDERS + 1).fill(null)
  for (let k = 1; k <= maxOrders; k++) {
    const found = heuristicForCount(prices, pools, k)
    if (found) {
      bestDiscount[k] = found.discount
      bestAssign[k] = found.assign
    }
  }
  return { bestDiscount, bestAssign }
}

/* ------------------------------------------------------------------ */
/* Entry point                                                          */
/* ------------------------------------------------------------------ */

// Expands quantities into individual units: 3 x RM15.99 becomes three units,
// because each unit is one person and can be moved between orders on its own.
//
// Rows priced at zero are skipped. In practice that is an empty row the user
// has not filled in yet, and counting it as a person who owes nothing only
// distorts the flat rate and the head count.
export function expandUnits (items) {
  const units = []
  items.forEach((item, index) => {
    const price = toCents(item.price)
    if (price <= 0) return
    const name = String(item.name ?? '').trim() || `Item ${index + 1}`
    const who = String(item.who ?? '').trim()
    let qty = Math.floor(Number(item.qty))
    if (!Number.isFinite(qty) || qty < 0) qty = 0
    if (qty > 40) qty = 40
    for (let q = 0; q < qty; q++) {
      units.push({
        name,
        who,
        label: qty > 1 ? `${name} #${q + 1}` : name,
        price
      })
    }
  })
  return units
}

export function normaliseVouchers (rows) {
  return rows
    .map(v => ({ min: toCents(v.min), off: toCents(v.off) }))
    .filter(v => v.off > 0)
    // Biggest discount first - the greedy assignment depends on this order.
    .sort((a, b) => b.off - a.off)
}

// A delivery voucher can never be worth more than the delivery fee it is
// knocking off, so a "free shipping" voucher is just one whose discount meets
// or beats the fee. Anything left over would otherwise show up as a phantom
// saving on the grand total.
export function normaliseDeliveryVouchers (rows, deliveryCents) {
  return rows
    .map(v => ({
      min: toCents(v.min),
      off: Math.min(toCents(v.off), deliveryCents),
      entered: toCents(v.off)
    }))
    .filter(v => v.off > 0)
    .sort((a, b) => b.off - a.off)
}

export function solve ({ items, vouchers, deliveryVouchers = [], deliveryFee }) {
  const units = expandUnits(items)
  const deliveryCents = toCents(deliveryFee)
  const pools = {
    item: normaliseVouchers(vouchers),
    delivery: normaliseDeliveryVouchers(deliveryVouchers, deliveryCents)
  }

  // Bigger items first: harmless for the exhaustive search, and it is what the
  // heuristic's "cut the sorted list" seeds are built on.
  units.sort((a, b) => b.price - a.price)

  const n = units.length
  if (n === 0) {
    return { units, pools, deliveryCents, maxOrders: 0, itemsTotal: 0 }
  }

  const maxOrders = Math.min(MAX_ORDERS, n)
  const prices = new Int32Array(n)
  let itemsTotal = 0
  for (let i = 0; i < n; i++) {
    prices[i] = units[i].price
    itemsTotal += units[i].price
  }

  const partitions = countPartitions(n, maxOrders)
  const exact = partitions <= MAX_PARTITIONS
  const started = performance.now()
  const found = exact
    ? exhaustiveSearch(prices, pools, maxOrders)
    : heuristicSearch(prices, pools, maxOrders)

  return {
    units,
    pools,
    deliveryCents,
    maxOrders,
    itemsTotal,
    exact,
    partitions,
    elapsed: performance.now() - started,
    bestDiscount: found.bestDiscount,
    bestAssign: found.bestAssign
  }
}
