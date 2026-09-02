<template>
  <footer class="site-footer mt-8 text-center text-xs text-muted">
    <p class="copyright">
      © {{ year }} {{ holder }} · <a
        class="underline underline-offset-2 hover:text-accent"
        href="https://opensource.org/licenses/MIT"
      >MIT licence</a>
    </p>

    <!-- Renders only when a real address has been set. -->
    <details
      v-if="wallets.length > 0"
      class="support mt-2"
    >
      <summary class="cursor-pointer list-none hover:text-accent">
        Found it useful? Buy me a teh ais ☕
      </summary>

      <ul class="wallets mx-auto mt-2.5 flex max-w-[420px] flex-col gap-1.5">
        <li
          v-for="wallet in wallets"
          :key="wallet.address"
          class="wallet flex items-center gap-2 rounded-[10px] border border-line p-2 text-left"
        >
          <span class="w-14 shrink-0 font-semibold">{{ wallet.label }}</span>
          <code class="min-w-0 flex-1 truncate text-[11px]">{{ wallet.address }}</code>
          <button
            class="wallet-copy shrink-0 cursor-pointer rounded-md border border-line px-2 py-1
                   hover:border-accent hover:text-accent"
            type="button"
            @click="copy(wallet.address)"
          >
            {{ copied === wallet.address ? 'Copied' : 'Copy' }}
          </button>
        </li>
      </ul>

      <p class="mt-2 text-[11px]">
        Always check the address against what is shown here before sending.
      </p>
    </details>
  </footer>
</template>

<script setup>
import { ref, onUnmounted } from 'vue'

defineProps({
  holder: { type: String, required: true },
  year: { type: Number, required: true },
  wallets: { type: Array, default: () => [] }
})

const copied = ref('')
let timer = null

async function copy (address) {
  try {
    await navigator.clipboard?.writeText(address)
  } catch {
    // Nothing to fall back to - the address is on screen and selectable.
  }
  copied.value = address
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { copied.value = '' }, 1600)
}

onUnmounted(() => {
  if (timer) clearTimeout(timer)
})
</script>
