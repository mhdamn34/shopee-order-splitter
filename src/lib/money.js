// Everything inside the solver is integer cents. Doing the arithmetic in
// ringgit would mean comparisons like "subtotal >= 48.00" can be wrong by a
// hundredth of a cent, which is exactly the kind of error that silently loses
// you a voucher.

export function toCents (value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n * 100)
}

export function rm (cents) {
  return 'RM' + (cents / 100).toFixed(2)
}

export function plural (count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

export function people (count) {
  return `${count} ${count === 1 ? 'person' : 'people'}`
}
