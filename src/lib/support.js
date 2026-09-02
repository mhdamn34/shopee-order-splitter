// Everything the footer and the README need in one place, so there is a single
// spot to edit rather than a name and an address scattered across files.

export const COPYRIGHT_HOLDER = 'mhdamin'
export const COPYRIGHT_YEAR = 2026

/**
 * Crypto addresses to accept donations at, as { label, network, address }.
 *
 * Deliberately empty by default. The support block renders nothing at all while
 * this list is empty, because a placeholder that looked like an address would be
 * worse than no address: crypto sent to the wrong place cannot be recovered.
 *
 * Paste real addresses here, and check them character by character against the
 * wallet they came from before committing.
 */
export const WALLETS = []
