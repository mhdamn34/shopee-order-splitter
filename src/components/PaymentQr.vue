<template>
  <section class="card qr-card">
    <h2 class="card-title">
      Your payment QR
    </h2>

    <div
      v-if="!image"
      class="qr-drop flex cursor-pointer flex-col items-center gap-1.5 rounded-[10px]
             border border-dashed border-line p-5 text-center hover:border-accent"
      @click="picker?.click()"
      @dragover.prevent
      @drop.prevent="onDrop"
    >
      <span class="text-sm font-semibold text-accent">Add your DuitNow or TNG QR</span>
      <span class="text-xs text-muted">Drop a screenshot here, or tap to choose one</span>
    </div>

    <div
      v-else
      class="flex items-start gap-3"
    >
      <img
        class="qr-preview h-24 w-24 rounded-[10px] border border-line bg-white object-contain p-1"
        :src="image"
        alt="Your payment QR"
      >
      <div class="flex flex-col gap-1.5">
        <button
          class="qr-replace cursor-pointer text-xs text-muted underline underline-offset-2
                 hover:text-accent"
          type="button"
          @click="picker?.click()"
        >
          Replace
        </button>
        <button
          class="qr-remove cursor-pointer text-xs text-muted underline underline-offset-2
                 hover:text-accent"
          type="button"
          @click="emit('update', 'image', '')"
        >
          Remove
        </button>
      </div>
    </div>

    <input
      ref="picker"
      class="hidden"
      type="file"
      accept="image/*"
      @change="onPick"
    >

    <label class="field mt-3 block">
      <span class="mb-1.5 block text-xs text-muted">Who to pay (shown under the QR)</span>
      <input
        class="qr-payee"
        type="text"
        maxlength="40"
        placeholder="Your name"
        :value="payee"
        @input="emit('update', 'payee', $event.target.value)"
      >
    </label>

    <p
      v-if="error"
      class="qr-error mt-2.5 text-xs text-warn"
    >
      {{ error }}
    </p>
    <p class="hint">
      Saved in this browser only, and never uploaded. Attach it to the summary so
      whoever owes you can scan and pay.
    </p>
  </section>
</template>

<script setup>
import { ref, useTemplateRef } from 'vue'
import { downscaleToDataUrl } from '../lib/image.js'

defineProps({
  image: { type: String, default: '' },
  payee: { type: String, default: '' }
})

const emit = defineEmits(['update'])

const picker = useTemplateRef('picker')
const error = ref('')

async function accept (file) {
  error.value = ''
  try {
    emit('update', 'image', await downscaleToDataUrl(file))
  } catch (problem) {
    error.value = problem.message
  }
}

function onPick (event) {
  const file = event.target.files?.[0]
  // Reset the input so picking the same file twice still fires a change.
  event.target.value = ''
  if (file) accept(file)
}

function onDrop (event) {
  const file = event.dataTransfer?.files?.[0]
  if (file) accept(file)
}
</script>
