import { describe, it, expect } from 'vitest'
import {
  bestDiscountFor,
  combinedDiscount,
  normaliseDeliveryVouchers,
  countPartitions,
  exhaustiveSearch,
  heuristicSearch,
  expandUnits,
  normaliseVouchers,
  solve
} from '../src/lib/solver.js'

// The searches take both voucher pools; most tests only care about item ones.
const pools = (item, delivery = []) => ({ item, delivery })

// Deterministic PRNG so a failure is always reproducible.
function makeRandom (seed) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

// Independent reference implementation: try every injective mapping of
// vouchers to orders. Deliberately naive - it exists to catch the greedy
// being clever in the wrong way.
function optimalAssignment (subtotals, k, vouchers) {
  let best = 0
  const taken = new Array(k).fill(false)
  function walk (v, acc) {
    if (v === vouchers.length) {
      best = Math.max(best, acc)
      return
    }
    walk(v + 1, acc)
    for (let g = 0; g < k; g++) {
      if (!taken[g] && subtotals[g] >= vouchers[v].min) {
        taken[g] = true
        walk(v + 1, acc + vouchers[v].off)
        taken[g] = false
      }
    }
  }
  walk(0, 0)
  return best
}

describe('bestDiscountFor', () => {
  it('spends a big order on the big minimum, not the small one', () => {
    // Greedy by discount alone would put the RM13 voucher on the RM80 order
    // and then fail to place the RM12 one, losing RM12.
    const vouchers = [{ min: 4800, off: 1300 }, { min: 7500, off: 1200 }]
    const subtotals = Int32Array.from([5000, 8000])
    expect(bestDiscountFor(subtotals, 2, vouchers)).toBe(2500)
  })

  it('never applies a voucher below its minimum spend', () => {
    const vouchers = [{ min: 4800, off: 1300 }]
    expect(bestDiscountFor(Int32Array.from([4799]), 1, vouchers)).toBe(0)
    expect(bestDiscountFor(Int32Array.from([4800]), 1, vouchers)).toBe(1300)
  })

  it('matches brute force across 20000 random cases', () => {
    const random = makeRandom(12345)
    for (let t = 0; t < 20000; t++) {
      const k = 1 + Math.floor(random() * 4)
      const subtotals = new Int32Array(4)
      for (let g = 0; g < k; g++) subtotals[g] = Math.floor(random() * 12000)

      const vouchers = []
      const count = 1 + Math.floor(random() * 6)
      for (let v = 0; v < count; v++) {
        vouchers.push({ min: Math.floor(random() * 10000), off: 100 + Math.floor(random() * 2000) })
      }
      vouchers.sort((a, b) => b.off - a.off)

      expect(bestDiscountFor(subtotals, k, vouchers)).toBe(optimalAssignment(subtotals, k, vouchers))
    }
  })
})

describe('countPartitions', () => {
  it('matches the Bell numbers for small baskets', () => {
    expect(countPartitions(1, 4)).toBe(1)
    expect(countPartitions(2, 4)).toBe(2)
    expect(countPartitions(3, 4)).toBe(5)
    expect(countPartitions(4, 4)).toBe(15)
    expect(countPartitions(5, 4)).toBe(51)
  })

  it('counts exactly what the exhaustive search walks', () => {
    for (const n of [1, 2, 3, 5, 7, 9]) {
      let visited = 0
      // bestDiscountFor reads vouchers.length once per partition.
      const counter = { get length () { visited++; return 0 } }
      exhaustiveSearch(new Int32Array(n).fill(100), pools(counter), Math.min(4, n))
      expect(visited).toBe(countPartitions(n, Math.min(4, n)))
    }
  })
})

describe('exhaustiveSearch', () => {
  it('matches an independent brute force over random baskets', () => {
    const random = makeRandom(999)

    // Reference: every unit picks a group freely, then compact to the groups
    // actually used. Completely different code path from restricted growth.
    function naiveBest (prices, vouchers, maxOrders) {
      const n = prices.length
      const best = new Array(maxOrders + 1).fill(-1)
      const assign = new Array(n).fill(0)
      function walk (i) {
        if (i === n) {
          const sums = new Int32Array(maxOrders)
          const seen = new Set()
          for (let u = 0; u < n; u++) {
            sums[assign[u]] += prices[u]
            seen.add(assign[u])
          }
          const ids = [...seen].sort((a, b) => a - b)
          const packed = new Int32Array(4)
          ids.forEach((id, idx) => { packed[idx] = sums[id] })
          const k = ids.length
          const discount = optimalAssignment(packed, k, vouchers)
          if (discount > best[k]) best[k] = discount
          return
        }
        for (let g = 0; g < maxOrders; g++) {
          assign[i] = g
          walk(i + 1)
        }
      }
      walk(0)
      return best
    }

    for (let t = 0; t < 120; t++) {
      const n = 1 + Math.floor(random() * 8)
      const prices = new Int32Array(n)
      for (let i = 0; i < n; i++) prices[i] = 100 + Math.floor(random() * 4000)

      const vouchers = []
      const count = 1 + Math.floor(random() * 5)
      for (let v = 0; v < count; v++) {
        vouchers.push({ min: Math.floor(random() * 8000), off: 100 + Math.floor(random() * 1500) })
      }
      vouchers.sort((a, b) => b.off - a.off)

      const maxOrders = Math.min(4, n)
      const mine = exhaustiveSearch(prices, pools(vouchers), maxOrders)
      const reference = naiveBest(prices, vouchers, maxOrders)

      for (let k = 1; k <= maxOrders; k++) {
        expect(mine.bestDiscount[k]).toBe(reference[k])

        // The stored split must actually use k orders and really earn that discount.
        const assign = mine.bestAssign[k]
        const sums = new Int32Array(4)
        const groups = new Set()
        for (let i = 0; i < n; i++) {
          sums[assign[i]] += prices[i]
          groups.add(assign[i])
        }
        expect(groups.size).toBe(k)
        expect(bestDiscountFor(sums, k, vouchers)).toBe(reference[k])
      }
    }
  })
})

describe('heuristicSearch', () => {
  const vouchers = [
    { min: 4800, off: 1300 },
    { min: 7500, off: 1200 },
    { min: 3600, off: 1100 },
    { min: 2400, off: 700 }
  ].sort((a, b) => b.off - a.off)

  it('never claims a discount the exhaustive search cannot find', () => {
    const random = makeRandom(4242)
    for (let t = 0; t < 60; t++) {
      const n = 8 + Math.floor(random() * 5)
      const prices = []
      for (let i = 0; i < n; i++) prices.push(100 + Math.floor(random() * 3000))
      prices.sort((a, b) => b - a)
      const arr = Int32Array.from(prices)

      const exact = exhaustiveSearch(arr, pools(vouchers), 4)
      const fast = heuristicSearch(arr, pools(vouchers), 4)
      for (let k = 1; k <= 4; k++) {
        expect(fast.bestDiscount[k]).toBeLessThanOrEqual(exact.bestDiscount[k])
      }
    }
  })

  // 15 units is the first size the app actually hands to the heuristic, and the
  // last size we can still brute-force for a ground truth in reasonable time -
  // each of these baskets is 44.7 million partitions, hence the timeout.
  it('finds the true optimum on realistic baskets just past the exhaustive cap', () => {
    const random = makeRandom(31337)
    let matched = 0
    let total = 0

    for (let t = 0; t < 3; t++) {
      const prices = []
      for (let i = 0; i < 15; i++) prices.push(350 + Math.floor(random() * 1900))
      prices.sort((a, b) => b - a)
      const arr = Int32Array.from(prices)

      const exact = exhaustiveSearch(arr, pools(vouchers), 4)
      const fast = heuristicSearch(arr, pools(vouchers), 4)
      for (let k = 1; k <= 4; k++) {
        total++
        if (fast.bestDiscount[k] === exact.bestDiscount[k]) matched++
      }
    }
    expect(matched).toBe(total)
  }, 60_000)

  it('is deterministic - the same basket always gives the same plan', () => {
    const prices = Int32Array.from([2250, 1590, 1590, 1590, 1290, 1290, 890, 450, 450, 450, 450,
      1200, 1100, 900, 800, 700, 600, 500])
    const a = heuristicSearch(prices, pools(vouchers), 4)
    const b = heuristicSearch(prices, pools(vouchers), 4)
    for (let k = 1; k <= 4; k++) {
      expect([...a.bestAssign[k]]).toEqual([...b.bestAssign[k]])
    }
  })
})

describe('expandUnits', () => {
  it('turns quantities into one unit per person', () => {
    const units = expandUnits([{ name: 'Milo Ais', price: '4.50', qty: '3' }])
    expect(units).toHaveLength(3)
    expect(units.map(u => u.label)).toEqual(['Milo Ais #1', 'Milo Ais #2', 'Milo Ais #3'])
    expect(units.every(u => u.price === 450)).toBe(true)
  })

  it('leaves a single unit unnumbered and names blank items', () => {
    const units = expandUnits([{ name: '  ', price: '10', qty: '1' }])
    expect(units[0].label).toBe('Item 1')
  })

  it('ignores rows with no price, so a blank row is not a person', () => {
    // Regression: an unpriced row used to become a unit worth RM0, land last in
    // the payment list, and absorb the rounding into a negative amount.
    expect(expandUnits([
      { name: 'Teh Ais', price: '4.50', qty: '2' },
      { name: '', price: '', qty: '1' },
      { name: 'Free Gift', price: '0', qty: '1' }
    ])).toHaveLength(2)
  })

  it('carries an optional name through to every unit', () => {
    const units = expandUnits([
      { name: 'Mee Goreng', who: ' Siti ', price: '12.90', qty: '2' },
      { name: 'Teh Ais', price: '4.50', qty: '1' }
    ])
    expect(units.filter(u => u.who === 'Siti')).toHaveLength(2)
    expect(units.find(u => u.name === 'Teh Ais').who).toBe('')
  })

  it('skips zero and junk quantities', () => {
    expect(expandUnits([
      { name: 'A', price: '10', qty: '0' },
      { name: 'B', price: '10', qty: '' },
      { name: 'C', price: '10', qty: '-2' }
    ])).toHaveLength(0)
  })
})

describe('normaliseVouchers', () => {
  it('converts to cents, drops empty rows, and sorts by discount', () => {
    expect(normaliseVouchers([
      { min: '24', off: '7' },
      { min: '48', off: '13' },
      { min: '10', off: '' }
    ])).toEqual([
      { min: 4800, off: 1300 },
      { min: 2400, off: 700 }
    ])
  })
})

describe('normaliseDeliveryVouchers', () => {
  it('caps a voucher at the delivery fee it is knocking off', () => {
    // A RM10 shipping voucher against a RM6.30 fee is worth RM6.30, not RM10.
    expect(normaliseDeliveryVouchers([{ min: '25', off: '10' }], 630))
      .toEqual([{ min: 2500, off: 630, entered: 1000 }])
  })

  it('drops every delivery voucher when delivery is free anyway', () => {
    expect(normaliseDeliveryVouchers([{ min: '25', off: '6.30' }], 0)).toEqual([])
  })
})

describe('combinedDiscount', () => {
  const item = [{ min: 4800, off: 1300 }]
  const delivery = [{ min: 2400, off: 630 }]

  it('lets one order use an item voucher and a delivery voucher together', () => {
    // A single RM50 order clears both minimums, so both slots fill.
    expect(combinedDiscount(Int32Array.from([5000]), 1, { item, delivery })).toBe(1930)
  })

  it('still respects each pool\'s own minimum', () => {
    // RM30 clears the delivery minimum but not the item one.
    expect(combinedDiscount(Int32Array.from([3000]), 1, { item, delivery })).toBe(630)
  })

  it('spreads a pool across orders, one voucher each', () => {
    const twoDelivery = [{ min: 2400, off: 630 }, { min: 1500, off: 400 }]
    // Two orders, two delivery vouchers: both land.
    expect(combinedDiscount(Int32Array.from([2500, 2500]), 2, { item: [], delivery: twoDelivery }))
      .toBe(1030)
    // One order can only hold one of them.
    expect(combinedDiscount(Int32Array.from([5000]), 1, { item: [], delivery: twoDelivery }))
      .toBe(630)
  })
})

describe('solve', () => {
  it('switches to the heuristic past the exhaustive cap and says so', () => {
    const items = [{ name: 'Thing', price: '9.90', qty: '20' }]
    const run = solve({ items, vouchers: [{ min: '48', off: '13' }], deliveryFee: '6.30' })
    expect(run.units).toHaveLength(20)
    expect(run.exact).toBe(false)
  })

  it('solves exactly at 14 units', () => {
    const items = [{ name: 'Thing', price: '9.90', qty: '14' }]
    const run = solve({ items, vouchers: [{ min: '48', off: '13' }], deliveryFee: '6.30' })
    expect(run.exact).toBe(true)
  })

  it('returns an empty result for an empty basket', () => {
    const run = solve({ items: [], vouchers: [], deliveryFee: '6.30' })
    expect(run.maxOrders).toBe(0)
    expect(run.itemsTotal).toBe(0)
  })

  it('counts delivery vouchers in the discount it optimises for', () => {
    const items = [{ name: 'Set', price: '30.00', qty: '2' }]
    const without = solve({ items, vouchers: [], deliveryFee: '6.30' })
    const withVoucher = solve({
      items,
      vouchers: [],
      deliveryVouchers: [{ min: '25', off: '6.30' }, { min: '25', off: '6.30' }],
      deliveryFee: '6.30'
    })
    expect(without.bestDiscount[2]).toBe(0)
    // Two RM30 orders, two free-shipping vouchers: delivery is fully covered.
    expect(withVoucher.bestDiscount[2]).toBe(1260)
  })
})
