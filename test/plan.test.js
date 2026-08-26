import { describe, it, expect } from 'vitest'
import { solve } from '../src/lib/solver.js'
import { analysePlan, planCost, cheapestOrderCount, buildSummary } from '../src/lib/plan.js'
import {
  DEFAULT_ITEMS,
  DEFAULT_VOUCHERS,
  DEFAULT_DELIVERY_VOUCHERS,
  DEFAULT_DELIVERY_FEE
} from '../src/lib/defaults.js'

function makeRandom (seed) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

// Item vouchers only - the baseline the comparison figures were worked out on.
const defaultRun = () => solve({
  items: DEFAULT_ITEMS,
  vouchers: DEFAULT_VOUCHERS,
  deliveryFee: DEFAULT_DELIVERY_FEE
})

// Everything the app actually ships with, delivery vouchers included.
const shippedRun = () => solve({
  items: DEFAULT_ITEMS,
  vouchers: DEFAULT_VOUCHERS,
  deliveryVouchers: DEFAULT_DELIVERY_VOUCHERS,
  deliveryFee: DEFAULT_DELIVERY_FEE
})

describe('the default basket', () => {
  it('is cheapest as three orders, only just', () => {
    const run = defaultRun()
    expect(cheapestOrderCount(run)).toBe(3)
    expect(planCost(run, 1)).toBe(11620)
    expect(planCost(run, 2)).toBe(11150)
    expect(planCost(run, 3)).toBe(11080)
    // The whole point of the comparison table: two orders costs 70 sen more.
    expect(planCost(run, 2) - planCost(run, 3)).toBe(70)
  })

  it('is still only 70 sen apart with the delivery vouchers in play', () => {
    const run = shippedRun()
    expect(cheapestOrderCount(run)).toBe(3)
    expect(planCost(run, 3)).toBe(10050)
    expect(planCost(run, 2) - planCost(run, 3)).toBe(70)
  })

  it('puts a different voucher on each order', () => {
    const plan = analysePlan(defaultRun(), 3)
    expect(plan.orders.map(o => o.voucher.off)).toEqual([1300, 1100, 700])
    expect(plan.grandTotal).toBe(11080)
  })
})

describe('analysePlan', () => {
  it('flags an order that is a few cents short of a bigger voucher', () => {
    // 3 x RM15.99 = RM47.97, three cents under the RM48 minimum.
    const run = solve({
      items: [{ name: 'Nasi Lemak', price: '15.99', qty: '3' }],
      vouchers: DEFAULT_VOUCHERS,
      deliveryFee: DEFAULT_DELIVERY_FEE
    })
    const plan = analysePlan(run, 1)
    expect(plan.nearMisses).toHaveLength(1)
    expect(plan.nearMisses[0]).toMatchObject({ order: 1, gap: 3 })
    expect(plan.nearMisses[0].voucher.min).toBe(4800)
  })

  it('does not flag a voucher that is already in use', () => {
    const run = defaultRun()
    const plan = analysePlan(run, 3)
    const usedMins = plan.orders.filter(o => o.voucher).map(o => o.voucher.min)
    plan.nearMisses.forEach(miss => {
      expect(usedMins).not.toContain(miss.voucher.min)
    })
  })

  it('holds every invariant across 200 random baskets', () => {
    const random = makeRandom(2024)

    for (let t = 0; t < 200; t++) {
      const items = []
      const itemCount = 1 + Math.floor(random() * 5)
      for (let i = 0; i < itemCount; i++) {
        items.push({
          name: `Item ${i}`,
          price: (1 + random() * 30).toFixed(2),
          qty: String(1 + Math.floor(random() * 4))
        })
      }

      const vouchers = []
      const voucherCount = Math.floor(random() * 5)
      for (let v = 0; v < voucherCount; v++) {
        vouchers.push({ min: (random() * 90).toFixed(2), off: (random() * 20).toFixed(2) })
      }

      const deliveryVouchers = []
      const deliveryCount = Math.floor(random() * 3)
      for (let v = 0; v < deliveryCount; v++) {
        deliveryVouchers.push({ min: (random() * 60).toFixed(2), off: (random() * 9).toFixed(2) })
      }

      const run = solve({
        items,
        vouchers,
        deliveryVouchers,
        deliveryFee: (random() * 10).toFixed(2)
      })
      if (run.maxOrders === 0) continue

      for (let k = 1; k <= run.maxOrders; k++) {
        const plan = analysePlan(run, k)

        // Every unit lands in exactly one order, and no order is empty.
        const placed = plan.orders.reduce((sum, o) => sum + o.units.length, 0)
        expect(placed).toBe(run.units.length)
        expect(plan.orders.every(o => o.units.length > 0)).toBe(true)

        // The money reconciles from every direction.
        expect(plan.orders.reduce((s, o) => s + o.subtotal, 0)).toBe(plan.itemsTotal)
        expect(plan.orders.reduce((s, o) => s + o.discount, 0)).toBe(plan.itemDiscountTotal)
        expect(plan.grandTotal).toBe(plan.itemsTotal - plan.discountTotal + plan.deliveryTotal)
        expect(plan.orders.reduce((s, o) => s + o.total, 0)).toBe(plan.grandTotal)

        // Voucher rules hold, in both pools independently.
        const used = plan.orders.filter(o => o.voucherIndex >= 0).map(o => o.voucherIndex)
        expect(new Set(used).size).toBe(used.length)
        expect(plan.orders.every(o => !o.voucher || o.subtotal >= o.voucher.min)).toBe(true)

        const usedDelivery = plan.orders
          .filter(o => o.deliveryVoucherIndex >= 0)
          .map(o => o.deliveryVoucherIndex)
        expect(new Set(usedDelivery).size).toBe(usedDelivery.length)
        expect(plan.orders.every(o =>
          !o.deliveryVoucher || o.subtotal >= o.deliveryVoucher.min)).toBe(true)

        // Delivery can be discounted to zero but never below it.
        expect(plan.orders.every(o => o.deliveryPaid >= 0)).toBe(true)
        expect(plan.deliveryDiscountTotal).toBeLessThanOrEqual(plan.deliveryTotal)
        expect(plan.discountTotal).toBe(plan.itemDiscountTotal + plan.deliveryDiscountTotal)

        // Every unit belongs to exactly one payer, and the shares add up to the cent.
        expect(plan.persons.reduce((s, p) => s + p.units.length, 0)).toBe(run.units.length)
        expect(plan.persons.reduce((s, p) => s + p.subtotal, 0)).toBe(plan.itemsTotal)
        expect(plan.persons.reduce((s, p) => s + p.pays, 0)).toBe(plan.grandTotal)

        // Near misses really are near, and really unused.
        plan.nearMisses.forEach(miss => {
          expect(miss.gap).toBeGreaterThan(0)
          expect(miss.gap).toBeLessThanOrEqual(100)
          expect(used.some(i => run.pools.item[i] === miss.voucher)).toBe(false)
        })
      }

      // The plan reported as cheapest really is the cheapest available.
      const costs = []
      for (let k = 1; k <= run.maxOrders; k++) costs.push(planCost(run, k))
      expect(planCost(run, cheapestOrderCount(run))).toBe(Math.min(...costs))
    }
  })

  it('never hands anybody a negative amount', () => {
    const random = makeRandom(8080)
    for (let t = 0; t < 150; t++) {
      const items = []
      const count = 1 + Math.floor(random() * 4)
      for (let i = 0; i < count; i++) {
        // Deliberately includes near-zero prices and blank rows.
        items.push({
          name: i % 3 === 0 ? '' : `Item ${i}`,
          price: i % 4 === 0 ? '' : (random() * 0.2).toFixed(2),
          qty: String(1 + Math.floor(random() * 6))
        })
      }
      items.push({ name: 'Big', price: (20 + random() * 60).toFixed(2), qty: '1' })

      const run = solve({ items, vouchers: DEFAULT_VOUCHERS, deliveryFee: '6.30' })
      if (run.maxOrders === 0) continue

      for (let k = 1; k <= run.maxOrders; k++) {
        const plan = analysePlan(run, k)
        plan.persons.forEach(person => {
          expect(person.pays).toBeGreaterThanOrEqual(0)
        })
        expect(plan.persons.reduce((s, p) => s + p.pays, 0)).toBe(plan.grandTotal)
      }
    }
  })

  it('gives the rounding remainder to the last person', () => {
    // Three people splitting something that does not divide evenly.
    const run = solve({
      items: [{ name: 'Same', price: '10.00', qty: '3' }],
      vouchers: [],
      deliveryFee: '1.00'
    })
    const plan = analysePlan(run, 1)
    expect(plan.grandTotal).toBe(3100)
    expect(plan.persons.map(p => p.pays)).toEqual([1033, 1033, 1034])
    expect(plan.persons.reduce((s, p) => s + p.pays, 0)).toBe(plan.grandTotal)
  })
})

describe('who ordered it', () => {
  it('combines two rows with the same name into one payment', () => {
    const run = shippedRun()
    const plan = analysePlan(run, 3)

    const ali = plan.persons.find(p => p.label === 'Ali')
    // Chicken Chop RM22.50 + Roti Bakar Set RM8.90, landing in different orders.
    expect(ali.units.map(u => u.name).sort()).toEqual(['Chicken Chop', 'Roti Bakar Set'])
    expect(ali.subtotal).toBe(3140)
    expect(ali.orders.length).toBeGreaterThan(1)
  })

  it('treats a multi-quantity row as one person, not several', () => {
    const plan = analysePlan(shippedRun(), 3)
    const siti = plan.persons.find(p => p.label === 'Siti')
    expect(siti.units).toHaveLength(2)
    expect(siti.subtotal).toBe(2580)
  })

  it('bills unnamed rows individually, as before', () => {
    const plan = analysePlan(shippedRun(), 3)
    const tehAis = plan.persons.filter(p => !p.named && p.label.startsWith('Teh Ais'))
    expect(tehAis).toHaveLength(4)
    expect(tehAis.every(p => p.units.length === 1)).toBe(true)
  })

  it('charges a name the same as the sum of its parts', () => {
    // Splitting one person's order across two rows must not change what they owe.
    const together = analysePlan(solve({
      items: [{ name: 'Combo', who: 'Ali', price: '30.00', qty: '1' },
        { name: 'Extra', price: '20.00', qty: '1' }],
      vouchers: DEFAULT_VOUCHERS,
      deliveryFee: '6.30'
    }), 1)
    const split = analysePlan(solve({
      items: [{ name: 'Combo A', who: 'Ali', price: '18.00', qty: '1' },
        { name: 'Combo B', who: 'Ali', price: '12.00', qty: '1' },
        { name: 'Extra', price: '20.00', qty: '1' }],
      vouchers: DEFAULT_VOUCHERS,
      deliveryFee: '6.30'
    }), 1)

    expect(together.grandTotal).toBe(split.grandTotal)
    expect(split.persons.find(p => p.label === 'Ali').pays)
      .toBe(together.persons.find(p => p.label === 'Ali').pays)
  })
})

describe('delivery vouchers', () => {
  it('stacks a delivery voucher and an item voucher on the same order', () => {
    const run = solve({
      items: [{ name: 'Set', price: '50.00', qty: '1' }],
      vouchers: [{ min: '48', off: '13' }],
      deliveryVouchers: [{ min: '25', off: '6.30' }],
      deliveryFee: '6.30'
    })
    const plan = analysePlan(run, 1)
    expect(plan.orders[0].discount).toBe(1300)
    expect(plan.orders[0].deliveryDiscount).toBe(630)
    expect(plan.orders[0].freeDelivery).toBe(true)
    expect(plan.orders[0].deliveryPaid).toBe(0)
    // RM50 food, RM13 off, delivery fully covered.
    expect(plan.grandTotal).toBe(3700)
  })

  it('never discounts delivery below zero', () => {
    const run = solve({
      items: [{ name: 'Set', price: '50.00', qty: '1' }],
      vouchers: [],
      deliveryVouchers: [{ min: '25', off: '20.00' }],
      deliveryFee: '6.30'
    })
    const plan = analysePlan(run, 1)
    expect(plan.orders[0].deliveryDiscount).toBe(630)
    expect(plan.grandTotal).toBe(5000)
  })

  it('flags a near miss on a delivery voucher too', () => {
    const run = solve({
      items: [{ name: 'Set', price: '24.90', qty: '1' }],
      vouchers: [],
      deliveryVouchers: [{ min: '25', off: '6.30' }],
      deliveryFee: '6.30'
    })
    const plan = analysePlan(run, 1)
    expect(plan.nearMisses).toHaveLength(1)
    expect(plan.nearMisses[0]).toMatchObject({ order: 1, gap: 10, kind: 'delivery' })
  })

  it('can flip which split is cheapest', () => {
    // On their own, free-shipping vouchers can only cancel the extra delivery
    // fee, never beat it. What they do is stop delivery from eating the gain
    // from an extra item voucher.
    const items = [{ name: 'Set', price: '26.00', qty: '2' }]
    const vouchers = [
      { min: '48', off: '10' },   // the only one a single RM52 order can use
      { min: '24', off: '8' },    // these two both fit an RM26 order
      { min: '25', off: '7' }
    ]
    const shipping = [{ min: '25', off: '6.30' }, { min: '25', off: '6.30' }]

    // Splitting wins RM5 more in item vouchers but pays RM6.30 more delivery.
    const without = solve({ items, vouchers, deliveryFee: '6.30' })
    expect(cheapestOrderCount(without)).toBe(1)
    expect(planCost(without, 1)).toBe(4830)
    expect(planCost(without, 2)).toBe(4960)

    // Free shipping on both orders removes the delivery penalty, so the extra
    // item voucher now decides it.
    const withShipping = solve({ items, vouchers, deliveryVouchers: shipping, deliveryFee: '6.30' })
    expect(cheapestOrderCount(withShipping)).toBe(2)
    expect(planCost(withShipping, 1)).toBe(4200)
    expect(planCost(withShipping, 2)).toBe(3700)
  })
})

describe('buildSummary', () => {
  it('produces a plain-text block with the totals and everyone owing', () => {
    const run = shippedRun()
    const plan = analysePlan(run, 3)
    const text = buildSummary(plan, run.deliveryCents)

    expect(text).toContain('Shopee order split - 3 orders')
    expect(text).toContain('GRAND TOTAL: RM100.50')
    expect(text).toContain('Delivery: RM18.90 (3 x RM6.30)')
    expect(text).toContain('Delivery vouchers: -RM10.30')
    expect(text).toContain('WHO PAYS WHAT')
    expect(text).not.toContain('*')
    expect(text).not.toContain('<')

    // Names show against the items they ordered, and the payer list is grouped.
    expect(text).toContain('- Chicken Chop (Ali)')
    expect(text).toContain('Ali (2 items): RM25.68')

    // Every payer appears exactly once.
    plan.persons.forEach(person => {
      expect(text.split(`  ${person.label}`).length).toBeGreaterThanOrEqual(2)
    })
  })

  it('spells out free delivery rather than a zero', () => {
    const run = solve({
      items: [{ name: 'Set', price: '30.00', qty: '1' }],
      vouchers: [],
      deliveryVouchers: [{ min: '25', off: '6.30' }],
      deliveryFee: '6.30'
    })
    const text = buildSummary(analysePlan(run, 1), run.deliveryCents)
    expect(text).toContain('Delivery: FREE (min RM25.00)')
  })
})
