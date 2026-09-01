<template>
  <div class="share flex flex-col gap-2.5">
    <button
      class="share-image w-full cursor-pointer rounded-xl bg-accent p-3.5 font-bold text-white
             active:opacity-85"
      type="button"
      @click="onImage"
    >
      {{ imageLabel }}
    </button>

    <CopySummaryButton :text="text" />

    <p
      v-if="note"
      class="share-note text-center text-xs text-muted"
    >
      {{ note }}
    </p>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { renderCardPngDataUrl, dataUrlToBlob } from '../lib/shareCard.js'
import CopySummaryButton from './CopySummaryButton.vue'

const props = defineProps({
  plan: { type: Object, required: true },
  text: { type: String, required: true },
  qrImage: { type: String, default: '' },
  qrPayee: { type: String, default: '' }
})

// What the label promises. The actual click re-probes and falls through, since
// canShare for files depends on the file's type.
const tier = ref('download')
const note = ref('')

onMounted(() => {
  if (typeof navigator === 'undefined') return
  if (navigator.share && navigator.canShare) tier.value = 'share'
  else if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') tier.value = 'copy'
})

const imageLabel = computed(() => {
  const what = props.qrImage ? 'summary + QR' : 'summary image'
  if (tier.value === 'share') return `Share ${what}`
  if (tier.value === 'copy') return `Copy ${what}`
  return `Save ${what}`
})

// Both images are decoded ahead of time so the click handler stays synchronous.
const qrElement = ref(null)
const logoElement = ref(null)

onMounted(() => {
  const image = new Image()
  image.onload = () => { logoElement.value = image }
  image.src = `${import.meta.env.BASE_URL}favicon.svg`
})

watch(() => props.qrImage, source => {
  if (!source) {
    qrElement.value = null
    return
  }
  const image = new Image()
  image.onload = () => { qrElement.value = image }
  image.src = source
}, { immediate: true })

function filename () {
  return `shopee-split-${new Date().toISOString().slice(0, 10)}.png`
}

function download (file) {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.click()
  URL.revokeObjectURL(url)
  note.value = 'Saved to your downloads.'
}

function onImage () {
  note.value = ''

  let file
  try {
    const dataUrl = renderCardPngDataUrl(props.plan, {
      qrImage: props.qrImage,
      qrPayee: props.qrPayee,
      qrElement: qrElement.value,
      logoElement: logoElement.value
    })
    file = new File([dataUrlToBlob(dataUrl)], filename(), { type: 'image/png' })
  } catch {
    note.value = 'Could not build the image. Copy the text instead.'
    return
  }

  // Each tier is entered from inside the click gesture - Safari drops share and
  // clipboard permissions across an await - and falls through on failure.
  if (navigator.canShare?.({ files: [file] })) {
    navigator.share({ files: [file] }).catch(() => {})
    return
  }

  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    navigator.clipboard
      .write([new ClipboardItem({ 'image/png': file })])
      .then(() => { note.value = 'Image copied — paste it into your chat.' })
      .catch(() => download(file))
    return
  }

  download(file)
}
</script>
