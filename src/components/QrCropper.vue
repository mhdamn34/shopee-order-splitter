<template>
  <div class="cropper">
    <p class="crop-hint mb-2 text-xs text-muted">
      Drag the box over just the QR square.
    </p>

    <div class="stage relative overflow-hidden rounded-[10px] bg-bg select-none">
      <img
        ref="imageEl"
        class="crop-image block w-full"
        :src="src"
        alt=""
        @load="onLoad"
      >

      <div
        v-if="ready"
        class="crop-box absolute cursor-move touch-none border-2 border-accent"
        :style="boxStyle"
        @pointerdown="onPointerDown($event, null)"
      >
        <span
          v-for="corner in CORNERS"
          :key="corner"
          class="handle absolute h-4 w-4 touch-none rounded-full bg-accent"
          :class="CORNER_CLASS[corner]"
          @pointerdown.stop="onPointerDown($event, corner)"
        />
      </div>
    </div>

    <div class="crop-actions mt-2.5 flex gap-2">
      <button
        class="crop-use flex-1 cursor-pointer rounded-[10px] bg-accent p-2.5 font-semibold
               text-white active:opacity-85"
        type="button"
        @click="use"
      >
        Use this
      </button>
      <button
        class="crop-cancel cursor-pointer rounded-[10px] border border-line px-3 text-muted
               hover:border-accent hover:text-accent"
        type="button"
        @click="emit('cancel')"
      >
        Cancel
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, useTemplateRef } from 'vue'
import { initialCropRect, clampCropRect, cropToDataUrl, MIN_CROP_PX } from '../lib/image.js'

defineProps({
  src: { type: String, required: true }
})

const emit = defineEmits(['crop', 'cancel'])

const CORNERS = ['nw', 'ne', 'sw', 'se']
const CORNER_CLASS = {
  nw: '-top-2 -left-2 cursor-nwse-resize',
  ne: '-top-2 -right-2 cursor-nesw-resize',
  sw: '-bottom-2 -left-2 cursor-nesw-resize',
  se: '-bottom-2 -right-2 cursor-nwse-resize'
}

const imageEl = useTemplateRef('imageEl')
const natural = ref({ width: 0, height: 0 })
const displayWidth = ref(0)
const rect = ref({ x: 0, y: 0, size: 0 })
const ready = ref(false)

const scale = computed(() =>
  natural.value.width > 0 && displayWidth.value > 0
    ? displayWidth.value / natural.value.width
    : 0
)

const boxStyle = computed(() => ({
  left: `${rect.value.x * scale.value}px`,
  top: `${rect.value.y * scale.value}px`,
  width: `${rect.value.size * scale.value}px`,
  height: `${rect.value.size * scale.value}px`
}))

function onLoad (event) {
  const el = event.target
  natural.value = { width: el.naturalWidth, height: el.naturalHeight }
  displayWidth.value = el.clientWidth
  rect.value = initialCropRect(el.naturalWidth, el.naturalHeight)
  ready.value = true
}

// The box is positioned from the displayed width, so a reflow has to re-measure
// or the box would drift away from the image under it.
function measure () {
  if (imageEl.value) displayWidth.value = imageEl.value.clientWidth
}

onMounted(() => window.addEventListener('resize', measure))

let drag = null

function onPointerDown (event, corner) {
  if (scale.value === 0) return
  event.preventDefault()
  drag = {
    corner,
    startX: event.clientX,
    startY: event.clientY,
    start: { ...rect.value }
  }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}

function onPointerMove (event) {
  if (!drag) return

  // Everything is worked out in natural image pixels. Tracking the box in
  // display pixels instead would accumulate rounding drift across drags.
  const dx = (event.clientX - drag.startX) / scale.value
  const dy = (event.clientY - drag.startY) / scale.value
  const start = drag.start
  const bounds = natural.value

  if (!drag.corner) {
    rect.value = clampCropRect({ x: start.x + dx, y: start.y + dy, size: start.size }, bounds)
    return
  }

  // The box stays square, so one delta drives the edge and the corner being
  // dragged decides which way it grows.
  const grow = drag.corner === 'se'
    ? Math.max(dx, dy)
    : drag.corner === 'nw'
      ? Math.max(-dx, -dy)
      : drag.corner === 'ne'
        ? Math.max(dx, -dy)
        : Math.max(-dx, dy)

  // Size is settled before the corner is placed - deriving x and y from an
  // unclamped size would let the anchored corner drift once the box bottoms out.
  const largest = Math.min(bounds.width, bounds.height)
  const size = Math.min(Math.max(start.size + grow, MIN_CROP_PX), largest)
  const west = drag.corner === 'nw' || drag.corner === 'sw'
  const north = drag.corner === 'nw' || drag.corner === 'ne'

  rect.value = clampCropRect({
    x: west ? start.x + start.size - size : start.x,
    y: north ? start.y + start.size - size : start.y,
    size
  }, bounds)
}

function onPointerUp () {
  drag = null
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
}

onBeforeUnmount(() => {
  onPointerUp()
  window.removeEventListener('resize', measure)
})

function use () {
  try {
    emit('crop', cropToDataUrl(imageEl.value, rect.value))
  } catch {
    emit('cancel')
  }
}
</script>
