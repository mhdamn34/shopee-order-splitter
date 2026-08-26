import { MAX_ORDERS, assignVouchers } from './solver.js'
import { rm } from './money.js'

// How close an order has to get to an unused voucher before we mention it.
export const NEAR_MISS_CENTS = 100

export function planCost (run, orderCount) {
  if (!run.bestAssign?.[orderCount]) return null
  return run.itemsTotal - run.bestDiscount[orderCount] + run.deliveryCents * orderCount
}

export function cheapestOrderCount (run) {
  let best = 0
  let bestCost = Infinity
  for (let k = 1; k <= run.maxOrders; k++) {
    const cost = planCost(run, k)
    if (cost !== null && cost < bestCost) {
      bestCost = cost
      best = k
    }
  }
  return best
}

// Groups units by whoever ordered them. Rows with no name behave as before -
// one unit, one payer - so naming is entirely optional and can be partial.
function buildPayers (orders) {
  const byName = new Map()
  const payers = []

  orders.forEach((order, index) => {
    order.units.forEach(unit => {
      if (unit.who) {
        let payer = byName.get(unit.who)
        if (!payer) {
          payer = { label: unit.who, named: true, units: [], subtotal: 0, orders: new Set() }
          byName.set(unit.who, payer)
          payers.push(payer)
        }
        payer.units.push(unit)
        payer.subtotal += unit.price
        payer.orders.add(index + 1)
      } else {
        payers.push({
          label: unit.label,
          named: false,
          units: [unit],
          subtotal: unit.price,
          orders: new Set([index + 1])
        })
      }
    })
  })

  return payers.map(payer => ({ ...payer, orders: [...payer.orders].sort((a, b) => a - b) }))
}

// Turns a raw group assignment into everything the UI needs to render.
export function analysePlan (run, orderCount) {
  const assign = run.bestAssign?.[orderCount]
  if (!assign) return null

  const orders = []
  for (let g = 0; g < orderCount; g++) {
    orders.push({
      units: [],
      subtotal: 0,
      voucher: null,
      voucherIndex: -1,
      discount: 0,
      deliveryVoucher: null,
      deliveryVoucherIndex: -1,
      deliveryDiscount: 0
    })
  }

  run.units.forEach((unit, i) => {
    orders[assign[i]].units.push(unit)
    orders[assign[i]].subtotal += unit.price
  })

  const subtotals = new Int32Array(MAX_ORDERS)
  for (let g = 0; g < orderCount; g++) subtotals[g] = orders[g].subtotal

  // Two independent pools, one slot of each per order.
  const items = assignVouchers(subtotals, orderCount, run.pools.item)
  const delivery = assignVouchers(subtotals, orderCount, run.pools.delivery)

  orders.forEach((order, g) => {
    const vi = items.picks[g]
    order.voucherIndex = vi
    order.voucher = vi >= 0 ? run.pools.item[vi] : null
    order.discount = vi >= 0 ? run.pools.item[vi].off : 0

    const di = delivery.picks[g]
    order.deliveryVoucherIndex = di
    order.deliveryVoucher = di >= 0 ? run.pools.delivery[di] : null
    order.deliveryDiscount = di >= 0 ? run.pools.delivery[di].off : 0
  })

  // Show the biggest order first - it usually carries the best voucher.
  orders.sort((a, b) => b.subtotal - a.subtotal)
  orders.forEach(order => {
    order.deliveryPaid = run.deliveryCents - order.deliveryDiscount
    order.freeDelivery = order.deliveryDiscount > 0 && order.deliveryPaid === 0
    order.total = order.subtotal - order.discount + order.deliveryPaid
  })

  const itemDiscountTotal = orders.reduce((sum, o) => sum + o.discount, 0)
  const deliveryDiscountTotal = orders.reduce((sum, o) => sum + o.deliveryDiscount, 0)
  const discountTotal = itemDiscountTotal + deliveryDiscountTotal
  const deliveryTotal = run.deliveryCents * orderCount
  const grandTotal = run.itemsTotal - discountTotal + deliveryTotal

  // Near misses: an unused voucher, from either pool, whose minimum spend is
  // just out of reach.
  const nearMisses = []
  const pools = [
    { list: run.pools.item, kind: 'item', used: new Set(orders.map(o => o.voucherIndex)) },
    { list: run.pools.delivery, kind: 'delivery', used: new Set(orders.map(o => o.deliveryVoucherIndex)) }
  ]
  orders.forEach((order, index) => {
    pools.forEach(pool => {
      pool.list.forEach((voucher, v) => {
        if (pool.used.has(v)) return
        const gap = voucher.min - order.subtotal
        if (gap > 0 && gap <= NEAR_MISS_CENTS) {
          nearMisses.push({ order: index + 1, gap, voucher, kind: pool.kind })
        }
      })
    })
  })
  nearMisses.sort((a, b) => a.gap - b.gap)

  // Everyone pays their share of the grand total in proportion to what they
  // ordered.
  const persons = buildPayers(orders)
  let allocated = 0
  persons.forEach(person => {
    person.pays = run.itemsTotal > 0
      ? Math.round(person.subtotal * grandTotal / run.itemsTotal)
      : Math.round(grandTotal / persons.length)
    allocated += person.pays
  })

  // The last person absorbs the rounding remainder so the shares add up
  // exactly - unless that would take them below zero, in which case the
  // biggest payer takes it instead. A stray cent is invisible on a large
  // share and nonsense on a tiny one.
  const remainder = grandTotal - allocated
  if (persons.length > 0 && remainder !== 0) {
    let absorber = persons.length - 1
    if (persons[absorber].pays + remainder < 0) {
      let largest = 0
      persons.forEach((person, i) => {
        if (person.pays > persons[largest].pays) largest = i
      })
      absorber = largest
    }
    persons[absorber].pays += remainder
  }

  return {
    orderCount,
    orders,
    itemsTotal: run.itemsTotal,
    itemDiscountTotal,
    deliveryDiscountTotal,
    discountTotal,
    deliveryTotal,
    grandTotal,
    nearMisses,
    persons,
    flatRate: persons.length > 0 ? grandTotal / persons.length / 100 : 0
  }
}

// Plain text, no markdown, sized for a WhatsApp message.
export function buildSummary (plan, deliveryCents) {
  const lines = []
  lines.push(`Shopee order split - ${plan.orderCount} order${plan.orderCount === 1 ? '' : 's'}`)
  lines.push('')

  plan.orders.forEach((order, index) => {
    lines.push(`ORDER ${index + 1} (subtotal ${rm(order.subtotal)})`)
    order.units.forEach(unit => {
      const who = unit.who ? ` (${unit.who})` : ''
      lines.push(`  - ${unit.label}${who}  ${rm(unit.price)}`)
    })
    lines.push(order.voucher
      ? `  Voucher: ${rm(order.voucher.off)} off (min ${rm(order.voucher.min)})`
      : '  Voucher: none')
    if (order.freeDelivery) {
      lines.push(`  Delivery: FREE (min ${rm(order.deliveryVoucher.min)})`)
    } else if (order.deliveryVoucher) {
      lines.push(`  Delivery: ${rm(order.deliveryPaid)} ` +
        `(${rm(order.deliveryDiscount)} off, min ${rm(order.deliveryVoucher.min)})`)
    } else {
      lines.push(`  Delivery: ${rm(deliveryCents)}`)
    }
    lines.push(`  Order total: ${rm(order.total)}`)
    lines.push('')
  })

  lines.push(`Food: ${rm(plan.itemsTotal)}`)
  lines.push(`Vouchers: -${rm(plan.itemDiscountTotal)}`)
  lines.push(`Delivery: ${rm(plan.deliveryTotal)} (${plan.orderCount} x ${rm(deliveryCents)})`)
  if (plan.deliveryDiscountTotal > 0) {
    lines.push(`Delivery vouchers: -${rm(plan.deliveryDiscountTotal)}`)
  }
  lines.push(`GRAND TOTAL: ${rm(plan.grandTotal)}`)
  lines.push('')
  lines.push('WHO PAYS WHAT')
  plan.persons.forEach(person => {
    const detail = person.named && person.units.length > 1
      ? ` (${person.units.length} items)`
      : ''
    lines.push(`  ${person.label}${detail}: ${rm(person.pays)}`)
  })
  lines.push('')
  lines.push(`Or flat rate: RM${plan.flatRate.toFixed(2)} each (${plan.persons.length} paying)`)

  if (plan.nearMisses.length > 0) {
    lines.push('')
    plan.nearMisses.forEach(miss => {
      const what = miss.kind === 'delivery' ? 'delivery voucher' : 'voucher'
      lines.push(`Heads up: order ${miss.order} is ${rm(miss.gap)} short of the ` +
        `${rm(miss.voucher.min)} ${what} (${rm(miss.voucher.off)} off).`)
    })
  }

  return lines.join('\n')
}
