<template>
  <section class="card">
    <h2 class="card-title">
      {{ title }}
    </h2>

    <!-- Lets the delivery editor carry the per-order fee, which belongs with the
         vouchers that discount it. -->
    <slot name="lead" />

    <div class="grid grid-cols-[1fr_1fr_32px] items-center gap-1.5 px-0.5 text-[11px] text-muted">
      <div>Min spend (RM)</div>
      <div class="text-right">
        {{ offLabel }}
      </div>
      <div />
    </div>

    <div class="rows flex flex-col gap-2">
      <div
        v-for="(voucher, index) in vouchers"
        :key="index"
        class="voucher-row grid grid-cols-[1fr_1fr_32px] items-center gap-1.5"
      >
        <input
          type="number"
          inputmode="decimal"
          step="0.01"
          min="0"
          placeholder="Min spend"
          :value="voucher.min"
          @input="onInput(index, 'min', $event)"
        >
        <input
          type="number"
          inputmode="decimal"
          step="0.01"
          min="0"
          placeholder="Discount"
          class="text-right"
          :value="voucher.off"
          @input="onInput(index, 'off', $event)"
        >
        <button
          class="del"
          type="button"
          title="Remove"
          @click="emit('remove', index)"
        >
          ×
        </button>
      </div>

      <p
        v-if="vouchers.length === 0 && emptyMessage"
        class="py-3 text-center text-sm text-muted"
      >
        {{ emptyMessage }}
      </p>
    </div>

    <button
      class="add"
      type="button"
      @click="emit('add')"
    >
      {{ addLabel }}
    </button>
    <p
      v-if="hint"
      class="hint"
    >
      {{ hint }}
    </p>
  </section>
</template>

<script setup>
// Used for both voucher pools - item discounts and delivery discounts are the
// same shape, so they get the same editor with different labels.
defineProps({
  vouchers: { type: Array, required: true },
  title: { type: String, required: true },
  offLabel: { type: String, default: 'Discount (RM)' },
  hint: { type: String, default: '' },
  emptyMessage: { type: String, default: '' },
  addLabel: { type: String, default: '+ Add voucher' }
})

const emit = defineEmits(['update', 'add', 'remove'])

function onInput (index, field, event) {
  emit('update', index, field, event.target.value)
}
</script>
