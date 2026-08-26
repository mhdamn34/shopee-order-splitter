<script setup>
import { ref, onUnmounted } from 'vue'

const props = defineProps({
  text: { type: String, required: true }
})

const copied = ref(false)
let resetTimer = null

async function copy () {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(props.text)
    } else {
      fallbackCopy(props.text)
    }
    flash()
  } catch {
    // Permission denied, or an insecure origin - try the old way before giving up.
    fallbackCopy(props.text)
    flash()
  }
}

// Older mobile browsers, and any page not served over https, need this.
function fallbackCopy (text) {
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  try {
    document.execCommand('copy')
  } catch {
    window.prompt('Copy this:', text)
  }
  document.body.removeChild(area)
}

function flash () {
  copied.value = true
  if (resetTimer) clearTimeout(resetTimer)
  resetTimer = setTimeout(() => { copied.value = false }, 1600)
}

onUnmounted(() => {
  if (resetTimer) clearTimeout(resetTimer)
})
</script>

<template>
  <button
    class="copy w-full cursor-pointer rounded-xl bg-accent p-3.5 font-bold text-white
           active:opacity-85"
    type="button"
    @click="copy"
  >
    {{ copied ? 'Copied!' : 'Copy summary for WhatsApp' }}
  </button>
</template>
