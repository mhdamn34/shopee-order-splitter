import { describe, it, expect, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import App from '../src/App.vue'
import ItemsEditor from '../src/components/ItemsEditor.vue'
import SplitComparison from '../src/components/SplitComparison.vue'
import NearMissWarning from '../src/components/NearMissWarning.vue'

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
