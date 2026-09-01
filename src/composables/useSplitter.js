import { ref, computed, watch, onScopeDispose } from 'vue'
import { solve, MAX_ORDERS } from '../lib/solver.js'
import { analysePlan, cheapestOrderCount, planCost } from '../lib/plan.js'
import { loadState, saveState } from '../lib/storage.js'
import {
  DEFAULT_ITEMS,
  DEFAULT_VOUCHERS,
  DEFAULT_DELIVERY_VOUCHERS,
  DEFAULT_DELIVERY_FEE
} from '../lib/defaults.js'

const SOLVE_DEBOUNCE_MS = 220
const PERSIST_DEBOUNCE_MS = 400

const blankItem = () => ({ name: '', who: '', price: '', qty: '1' })
const blankVoucher = () => ({ min: '', off: '' })

/**
 * All the app's state and derived results.
 *
 * Not a Pinia store on purpose: there is one screen, no routing, and nothing
 * outside this tree needs the state. A composable keeps it testable without
 * adding a dependency - reach for Pinia if this ever grows a second route.
 */
export function useSplitter () {
  const stored = loadState()
  const isExample = ref(stored === null)
  const persistFailed = ref(false)

  const deliveryFee = ref(stored?.deliveryFee ?? DEFAULT_DELIVERY_FEE)
  const items = ref(stored?.items ?? DEFAULT_ITEMS.map(item => ({ ...item })))
  const vouchers = ref(stored?.vouchers ?? DEFAULT_VOUCHERS.map(voucher => ({ ...voucher })))
  const deliveryVouchers = ref(
    stored?.deliveryVouchers ?? DEFAULT_DELIVERY_VOUCHERS.map(voucher => ({ ...voucher }))
  )

  // 0 means "whatever is cheapest"; anything else is a plan the user picked.
  const chosenOrderCount = ref(stored?.chosenOrderCount ?? 0)
  const solving = ref(false)

  function snapshot () {
    return {
      items: items.value.map(item => ({ ...item })),
      vouchers: vouchers.value.map(voucher => ({ ...voucher })),
      deliveryVouchers: deliveryVouchers.value.map(voucher => ({ ...voucher })),
      deliveryFee: deliveryFee.value
    }
  }

  // The solve is synchronous and can take around half a second on a large
  // basket, so it runs from a debounced snapshot rather than straight off the
  // inputs. Typing stays smooth and `solving` drives the "working it out" note.
  const solverInput = ref(snapshot())
  let timer = null

  watch([items, vouchers, deliveryVouchers, deliveryFee], () => {
    solving.value = true
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      solverInput.value = snapshot()
      solving.value = false
    }, SOLVE_DEBOUNCE_MS)
  }, { deep: true })

  // Persistence gets its own timer rather than sharing the solve debounce -
  // solving and saving have different cadences.
  //
  // A watch does not fire on setup, so nothing is written until the user
  // actually edits something. That is what stops a first-time visitor who
  // reloads without touching anything from having the example basket saved as
  // if it were their own.
  let persistTimer = null

  watch([items, vouchers, deliveryVouchers, deliveryFee, chosenOrderCount], () => {
    isExample.value = false
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      persistTimer = null
      persistFailed.value = !saveState({
        items: items.value,
        vouchers: vouchers.value,
        deliveryVouchers: deliveryVouchers.value,
        deliveryFee: deliveryFee.value,
        chosenOrderCount: chosenOrderCount.value
      })
    }, PERSIST_DEBOUNCE_MS)
  }, { deep: true })

  onScopeDispose(() => {
    if (timer) clearTimeout(timer)
    if (persistTimer) clearTimeout(persistTimer)
  })

  const run = computed(() => solve(solverInput.value))
  const hasItems = computed(() => run.value.maxOrders > 0)
  const cheapestCount = computed(() => cheapestOrderCount(run.value))

  // Keep the user's choice only while it still makes sense - deleting items can
  // make a four-order plan impossible.
  const activeOrderCount = computed(() => {
    const chosen = chosenOrderCount.value
    const usable = chosen >= 1 && chosen <= run.value.maxOrders && Boolean(run.value.bestAssign?.[chosen])
    return usable ? chosen : cheapestCount.value
  })

  const plan = computed(() => (hasItems.value ? analysePlan(run.value, activeOrderCount.value) : null))

  const comparison = computed(() => {
    const cheapest = cheapestCount.value
    const cheapestCost = planCost(run.value, cheapest)
    const rows = []
    for (let k = 1; k <= MAX_ORDERS; k++) {
      const cost = k <= run.value.maxOrders ? planCost(run.value, k) : null
      rows.push({
        orderCount: k,
        available: cost !== null,
        discount: cost !== null ? run.value.bestDiscount[k] : 0,
        delivery: run.value.deliveryCents * k,
        cost,
        extra: cost !== null && cheapestCost !== null ? cost - cheapestCost : 0,
        isCheapest: k === cheapest,
        isActive: k === activeOrderCount.value
      })
    }
    return rows
  })

  const foodTotal = computed(() => run.value.itemsTotal)
  const unitCount = computed(() => run.value.units.length)

  function updateItem (index, field, value) {
    items.value[index][field] = value
  }

  function addItem () {
    items.value.push(blankItem())
  }

  function removeItem (index) {
    items.value.splice(index, 1)
    if (items.value.length === 0) items.value.push(blankItem())
  }

  // Items change every order; the voucher list rarely does. Clearing keeps the
  // vouchers, the delivery fee and the QR.
  function clearItems () {
    items.value = [blankItem()]
  }

  function loadExample () {
    items.value = DEFAULT_ITEMS.map(item => ({ ...item }))
    vouchers.value = DEFAULT_VOUCHERS.map(voucher => ({ ...voucher }))
    deliveryVouchers.value = DEFAULT_DELIVERY_VOUCHERS.map(voucher => ({ ...voucher }))
    deliveryFee.value = DEFAULT_DELIVERY_FEE
  }

  function updateVoucher (index, field, value) {
    vouchers.value[index][field] = value
  }

  function addVoucher () {
    vouchers.value.push(blankVoucher())
  }

  function removeVoucher (index) {
    vouchers.value.splice(index, 1)
  }

  function updateDeliveryVoucher (index, field, value) {
    deliveryVouchers.value[index][field] = value
  }

  function addDeliveryVoucher () {
    deliveryVouchers.value.push(blankVoucher())
  }

  function removeDeliveryVoucher (index) {
    deliveryVouchers.value.splice(index, 1)
  }

  function selectOrderCount (count) {
    chosenOrderCount.value = count
  }

  return {
    // state
    deliveryFee,
    items,
    vouchers,
    deliveryVouchers,
    solving,
    isExample,
    persistFailed,
    // derived
    run,
    plan,
    comparison,
    hasItems,
    activeOrderCount,
    cheapestCount,
    foodTotal,
    unitCount,
    // actions
    updateItem,
    addItem,
    removeItem,
    clearItems,
    loadExample,
    updateVoucher,
    addVoucher,
    removeVoucher,
    updateDeliveryVoucher,
    addDeliveryVoucher,
    removeDeliveryVoucher,
    selectOrderCount
  }
}
