import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick, effectScope } from 'vue'
import { mount } from '@vue/test-utils'
import App from '../src/App.vue'
import ItemsEditor from '../src/components/ItemsEditor.vue'
import SplitComparison from '../src/components/SplitComparison.vue'
import NearMissWarning from '../src/components/NearMissWarning.vue'
import PaymentQr from '../src/components/PaymentQr.vue'
import ShareActions from '../src/components/ShareActions.vue'
import { useSplitter } from '../src/composables/useSplitter.js'
import { STATE_KEY, SCHEMA_VERSION } from '../src/lib/storage.js'

describe('ItemsEditor', () => {
  const items = [{ name: 'Teh Ais', who: '', price: '4.50', qty: '2' }]
  const props = { items, unitCount: 2, foodTotal: 900, payerCount: 2 }

  it('reports edits upward instead of mutating the prop', () => {
    const wrapper = mount(ItemsEditor, { props })
    const inputs = wrapper.findAll('.item-row input')

    inputs[0].setValue('Kopi O')
    inputs[1].setValue('Ali')
    inputs[2].setValue('3.90')
    inputs[3].setValue('4')

    expect(wrapper.emitted('update')).toEqual([
      [0, 'name', 'Kopi O'],
      [0, 'who', 'Ali'],
      [0, 'price', '3.90'],
      [0, 'qty', '4']
    ])
    // The source array is untouched - the parent owns it.
    expect(items[0]).toEqual({ name: 'Teh Ais', who: '', price: '4.50', qty: '2' })
  })

  it('shows the example note only when the basket is the example', () => {
    expect(mount(ItemsEditor, { props }).find('.example-note').exists()).toBe(false)
    const seeded = mount(ItemsEditor, { props: { ...props, isExample: true } })
    expect(seeded.find('.example-note').exists()).toBe(true)
  })

  it('offers Clear items only when there is something to clear', () => {
    const empty = [{ name: '', who: '', price: '', qty: '1' }]
    const blank = mount(ItemsEditor, { props: { ...props, items: empty, unitCount: 0, foodTotal: 0 } })
    expect(blank.find('.clear').exists()).toBe(false)
    expect(mount(ItemsEditor, { props }).find('.clear').exists()).toBe(true)
  })

  it('emits clear and load-example', async () => {
    const wrapper = mount(ItemsEditor, { props })
    await wrapper.find('.clear').trigger('click')
    await wrapper.find('.example').trigger('click')
    expect(wrapper.emitted('clear')).toHaveLength(1)
    expect(wrapper.emitted('load-example')).toHaveLength(1)
  })

  it('emits add and remove', async () => {
    const wrapper = mount(ItemsEditor, { props })
    await wrapper.find('.add').trigger('click')
    await wrapper.find('.del').trigger('click')
    expect(wrapper.emitted('add')).toHaveLength(1)
    expect(wrapper.emitted('remove')).toEqual([[0]])
  })

  it('counts payers, not units, in the summary', () => {
    const wrapper = mount(ItemsEditor, {
      props: { items, unitCount: 2, foodTotal: 900, payerCount: 1 }
    })
    expect(wrapper.find('.hint').text()).toBe('2 units · RM9.00 of food · 1 person paying')
  })

  it('says so when there is nothing to split', () => {
    const wrapper = mount(ItemsEditor, {
      props: { items: [], unitCount: 0, foodTotal: 0, payerCount: 0 }
    })
    expect(wrapper.find('.hint').text()).toBe('Add an item to get started.')
  })
})

describe('SplitComparison', () => {
  const rows = [
    { orderCount: 1, available: true, discount: 1300, delivery: 630, cost: 11620, extra: 540, isCheapest: false, isActive: false },
    { orderCount: 2, available: true, discount: 2400, delivery: 1260, cost: 11150, extra: 70, isCheapest: false, isActive: false },
    { orderCount: 3, available: true, discount: 3100, delivery: 1890, cost: 11080, extra: 0, isCheapest: true, isActive: true },
    { orderCount: 4, available: false, discount: 0, delivery: 2520, cost: null, extra: 0, isCheapest: false, isActive: false }
  ]

  it('marks the cheapest and the active plan', () => {
    const wrapper = mount(SplitComparison, { props: { rows } })
    const trs = wrapper.findAll('tbody tr')
    expect(trs[2].classes()).toContain('active')
    expect(trs[2].find('.tag').text()).toBe('cheapest')
    expect(trs[0].text()).toContain('RM116.20')
    expect(trs[1].text()).toContain('+0.70')
  })

  it('emits the chosen order count, but not for an impossible split', async () => {
    const wrapper = mount(SplitComparison, { props: { rows } })
    const trs = wrapper.findAll('tbody tr')
    await trs[1].trigger('click')
    await trs[3].trigger('click')
    expect(wrapper.emitted('select')).toEqual([[2]])
    expect(trs[3].classes()).toContain('disabled')
    expect(trs[3].text()).toContain('needs 4 items')
  })
})

describe('NearMissWarning', () => {
  it('renders nothing when every voucher is either used or out of reach', () => {
    const wrapper = mount(NearMissWarning, { props: { nearMisses: [] } })
    expect(wrapper.find('.warn').exists()).toBe(false)
  })

  it('spells out how short the order is', () => {
    const wrapper = mount(NearMissWarning, {
      props: { nearMisses: [{ order: 2, gap: 3, kind: 'item', voucher: { min: 4800, off: 1300 } }] }
    })
    expect(wrapper.find('li').text().replace(/\s+/g, ' '))
      .toBe('Order 2 is RM0.03 short of the RM48.00 voucher (RM13.00 off).')
  })

  it('says when the near miss is a delivery voucher', () => {
    const wrapper = mount(NearMissWarning, {
      props: { nearMisses: [{ order: 1, gap: 10, kind: 'delivery', voucher: { min: 2500, off: 630 } }] }
    })
    expect(wrapper.find('li').text().replace(/\s+/g, ' '))
      .toBe('Order 1 is RM0.10 short of the RM25.00 delivery voucher (RM6.30 off).')
  })
})

describe('App', () => {
  it('solves the default basket on mount and shows the three-order plan', () => {
    const wrapper = mount(App)
    expect(wrapper.findAll('.order')).toHaveLength(3)
    expect(wrapper.find('.grand').text()).toContain('RM100.50')
    expect(wrapper.find('.status').text()).toContain('Checked all')
  })

  it('switches the whole plan when a comparison row is picked', async () => {
    const wrapper = mount(App)
    await wrapper.findAll('tbody tr')[1].trigger('click')
    expect(wrapper.findAll('.order')).toHaveLength(2)
    expect(wrapper.find('.grand').text()).toContain('RM101.20')
  })

  it('re-solves after edits settle, and shows a note while it works', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = mount(App)
      // Drop everything except one item, priced just under the RM48 voucher.
      const rows = wrapper.findAll('.rows .item-row')
      await rows[0].findAll('input')[2].setValue('15.99')
      await rows[0].findAll('input')[3].setValue('3')
      for (let r = 1; r < rows.length; r++) {
        await rows[r].findAll('input')[3].setValue('0')
      }

      expect(wrapper.find('.status').text()).toContain('Working out')

      await vi.advanceTimersByTimeAsync(300)
      await wrapper.vm.$nextTick()

      expect(wrapper.find('.status').text()).toContain('Checked all')
      expect(wrapper.find('.warn li').text().replace(/\s+/g, ' '))
        .toBe('Order 1 is RM0.03 short of the RM48.00 voucher (RM13.00 off).')
    } finally {
      vi.useRealTimers()
    }
  })

  it('focuses the new row after adding an item', async () => {
    // Regression: this used to fire on requestAnimationFrame, which is not tied
    // to Vue's render flush, so focus landed on the wrong field or nowhere.
    const wrapper = mount(App, { attachTo: document.body })
    const before = wrapper.findAll('.rows .item-row').length

    await wrapper.findAll('.add')[0].trigger('click')
    await nextTick()

    const rows = wrapper.findAll('.rows .item-row')
    expect(rows).toHaveLength(before + 1)
    expect(document.activeElement).toBe(rows[rows.length - 1].findAll('input')[0].element)
    wrapper.unmount()
  })

  it('shares out the grand total to the cent', () => {
    const wrapper = mount(App)
    const shares = wrapper.findAll('.persons .amt')
      .map(node => Math.round(parseFloat(node.text().replace('RM', '')) * 100))
    const grand = Math.round(parseFloat(wrapper.find('.grand span:last-child').text().replace('RM', '')) * 100)
    expect(shares.reduce((a, b) => a + b, 0)).toBe(grand)
  })

  it('groups named rows into one payer and shows their items', () => {
    const wrapper = mount(App)
    const names = wrapper.findAll('.persons .name').map(node => node.text())
    // Ali ordered two things in the default basket; he appears once.
    expect(names.filter(name => name.startsWith('Ali'))).toHaveLength(1)
    expect(names.find(name => name.startsWith('Ali'))).toContain('2 items')

    const ali = wrapper.findAll('.persons li').find(li => li.text().startsWith('Ali'))
    expect(ali.find('small').text()).toContain('Chicken Chop')
    expect(ali.find('small').text()).toContain('Roti Bakar Set')
  })

  it('renders a delivery voucher editor alongside the item one', () => {
    const wrapper = mount(App)
    const titles = wrapper.findAll('.card-title').map(node => node.text())
    expect(titles).toContain('Item vouchers')
    expect(titles).toContain('Delivery vouchers')
  })

  it('shows free delivery on the order that earns it', () => {
    const wrapper = mount(App)
    expect(wrapper.text()).toContain('Delivery free (min RM25.00)')
  })
})

describe('useSplitter persistence', () => {
  // The composable registers watchers, so it needs an owning scope. Scopes are
  // collected rather than stopped inline, so an async test can await between
  // creating the splitter and asserting on it.
  const scopes = []

  function makeSplitter () {
    const scope = effectScope()
    scopes.push(scope)
    return scope.run(() => useSplitter())
  }

  beforeEach(() => localStorage.clear())
  afterEach(() => {
    scopes.splice(0).forEach(scope => scope.stop())
    vi.useRealTimers()
  })

  it('seeds the example and flags it on a first visit', () => {
    const splitter = makeSplitter()
    expect(splitter.isExample.value).toBe(true)
    expect(splitter.items.value[0].name).toBe('Nasi Lemak Ayam')
  })

  it('hydrates from storage instead, and does not flag an example', () => {
    localStorage.setItem(STATE_KEY, JSON.stringify({
      v: SCHEMA_VERSION,
      items: [{ name: 'Kopi O', who: '', price: '3.90', qty: '1' }],
      vouchers: [], deliveryVouchers: [], deliveryFee: '5.00', chosenOrderCount: 0
    }))
    const splitter = makeSplitter()
    expect(splitter.isExample.value).toBe(false)
    expect(splitter.items.value).toEqual([{ name: 'Kopi O', who: '', price: '3.90', qty: '1' }])
  })

  // Otherwise a first-time visitor who reloads without touching anything would
  // have the example saved as if it were their own.
  it('writes nothing until the first edit', async () => {
    makeSplitter()
    await nextTick()
    expect(localStorage.getItem(STATE_KEY)).toBeNull()
  })

  it('writes the basket once an edit settles', async () => {
    vi.useFakeTimers()
    const splitter = makeSplitter()
    splitter.updateItem(0, 'price', '9.99')
    await nextTick()
    vi.advanceTimersByTime(500)
    expect(JSON.parse(localStorage.getItem(STATE_KEY)).items[0].price).toBe('9.99')
  })

  it('clears the example flag on any edit', async () => {
    const splitter = makeSplitter()
    splitter.updateItem(0, 'price', '9.99')
    await nextTick()
    expect(splitter.isExample.value).toBe(false)
  })

  it('clearItems leaves one blank row and keeps the vouchers', () => {
    const splitter = makeSplitter()
    const voucherCount = splitter.vouchers.value.length
    splitter.clearItems()
    expect(splitter.items.value).toEqual([{ name: '', who: '', price: '', qty: '1' }])
    expect(splitter.vouchers.value).toHaveLength(voucherCount)
  })

  it('loadExample restores the demo basket', () => {
    const splitter = makeSplitter()
    splitter.clearItems()
    splitter.loadExample()
    expect(splitter.items.value).toHaveLength(5)
    expect(splitter.items.value[0].name).toBe('Nasi Lemak Ayam')
  })
})

describe('PaymentQr', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgo='

  it('invites an upload when there is no QR yet', () => {
    const wrapper = mount(PaymentQr, { props: { image: '', payee: '' } })
    expect(wrapper.find('.qr-preview').exists()).toBe(false)
    expect(wrapper.find('.qr-drop').exists()).toBe(true)
  })

  it('previews a stored QR and offers to remove it', async () => {
    const wrapper = mount(PaymentQr, { props: { image: PNG, payee: 'Amin' } })
    expect(wrapper.find('.qr-preview').attributes('src')).toBe(PNG)
    await wrapper.find('.qr-remove').trigger('click')
    expect(wrapper.emitted('update')).toEqual([['image', '']])
  })

  it('reports a payee edit upward instead of mutating the prop', async () => {
    const wrapper = mount(PaymentQr, { props: { image: PNG, payee: '' } })
    await wrapper.find('.qr-payee').setValue('Amin')
    expect(wrapper.emitted('update')).toEqual([['payee', 'Amin']])
  })

  it('says plainly that the QR never leaves the browser', () => {
    const wrapper = mount(PaymentQr, { props: { image: '', payee: '' } })
    expect(wrapper.text()).toContain('never uploaded')
  })
})

describe('ShareActions', () => {
  const plan = {
    orderCount: 2,
    grandTotal: 5000,
    flatRate: 25,
    persons: [{ label: 'Ali', pays: 2500 }, { label: 'Siti', pays: 2500 }]
  }
  const props = { plan, text: 'summary', qrImage: '', qrPayee: '' }

  afterEach(() => vi.unstubAllGlobals())

  it('offers to share when the browser can share files', async () => {
    vi.stubGlobal('navigator', { share: () => {}, canShare: () => true })
    const wrapper = mount(ShareActions, { props })
    await nextTick()
    expect(wrapper.find('.share-image').text()).toBe('Share summary image')
  })

  it('names the QR in the label once one is attached', async () => {
    vi.stubGlobal('navigator', { share: () => {}, canShare: () => true })
    const wrapper = mount(ShareActions, {
      props: { ...props, qrImage: 'data:image/png;base64,x' }
    })
    await nextTick()
    expect(wrapper.find('.share-image').text()).toBe('Share summary + QR')
  })

  it('falls back to copying when sharing is unavailable', async () => {
    vi.stubGlobal('navigator', { clipboard: { write: () => {} } })
    vi.stubGlobal('ClipboardItem', class {})
    const wrapper = mount(ShareActions, { props })
    await nextTick()
    expect(wrapper.find('.share-image').text()).toBe('Copy summary image')
  })

  it('falls back to saving when neither is available', async () => {
    vi.stubGlobal('navigator', {})
    const wrapper = mount(ShareActions, { props })
    await nextTick()
    expect(wrapper.find('.share-image').text()).toBe('Save summary image')
  })

  it('keeps the plain-text copy alongside the image', () => {
    const wrapper = mount(ShareActions, { props })
    expect(wrapper.find('.copy').exists()).toBe(true)
  })
})
