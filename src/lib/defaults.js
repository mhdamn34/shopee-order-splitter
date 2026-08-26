// Seeded with a basket where three orders beat two by only 70 sen - the exact
// case where the comparison table earns its keep. The names show both halves of
// how "who ordered it" works: Ali's two rows combine into one payment, Siti's
// pair of Mee Goreng counts as hers, and the unnamed rows stay one payer each.
export const DEFAULT_DELIVERY_FEE = '6.30'

export const DEFAULT_ITEMS = [
  { name: 'Nasi Lemak Ayam', who: '', price: '15.90', qty: '3' },
  { name: 'Chicken Chop', who: 'Ali', price: '22.50', qty: '1' },
  { name: 'Mee Goreng Mamak', who: 'Siti', price: '12.90', qty: '2' },
  { name: 'Teh Ais', who: '', price: '4.50', qty: '4' },
  { name: 'Roti Bakar Set', who: 'Ali', price: '8.90', qty: '1' }
]

export const DEFAULT_VOUCHERS = [
  { min: '48', off: '13' },
  { min: '75', off: '12' },
  { min: '36', off: '11' },
  { min: '24', off: '7' }
]

// Placeholders - replace these with the free-shipping vouchers you actually
// hold. A discount at or above the delivery fee means free delivery.
export const DEFAULT_DELIVERY_VOUCHERS = [
  { min: '25', off: '6.30' },
  { min: '15', off: '4.00' }
]
