<template>
  <!-- @container: the rows below react to this card's own width, so they lay out
       correctly whether the card sits in a narrow or a wide column. -->
  <section class="card @container/items">
    <h2 class="card-title">
      Items
    </h2>

    <div
      ref="rowList"
      class="rows flex flex-col gap-2"
    >
      <!-- Narrow: two lines, so the item name and the person both get room.
           Wide: one line, with `contents` dissolving the two line wrappers so all
           four fields become siblings that `order-*` can sequence. -->
      <div
        v-for="(item, index) in items"
        :key="index"
        class="item-row flex flex-col gap-1.5 rounded-[10px] border border-line p-2
               @min-[440px]/items:flex-row @min-[440px]/items:items-center
               @min-[440px]/items:border-0 @min-[440px]/items:p-0"
      >
        <div
          class="grid grid-cols-[1fr_32px] items-center gap-1.5
                 @min-[440px]/items:contents"
        >
          <input
            type="text"
            class="@min-[440px]/items:order-1 @min-[440px]/items:min-w-0 @min-[440px]/items:flex-[1_1_40%]"
            placeholder="Item name"
            :value="item.name"
            @input="onInput(index, 'name', $event)"
          >
          <button
            class="del @min-[440px]/items:order-5 @min-[440px]/items:basis-8"
            type="button"
            title="Remove"
            @click="emit('remove', index)"
          >
            ×
          </button>
        </div>

        <div
          class="grid grid-cols-[1fr_78px_52px] items-center gap-1.5
                 @min-[440px]/items:contents"
        >
          <input
            type="text"
            class="text-sm @min-[440px]/items:order-2 @min-[440px]/items:min-w-0
                   @min-[440px]/items:flex-[1_1_28%]"
            placeholder="Who ordered it?"
            :value="item.who"
            @input="onInput(index, 'who', $event)"
          >
          <input
            type="number"
            inputmode="decimal"
            step="0.01"
            min="0"
            placeholder="0.00"
            class="text-right @min-[440px]/items:order-3 @min-[440px]/items:grow-0
                   @min-[440px]/items:basis-[84px]"
            :value="item.price"
            @input="onInput(index, 'price', $event)"
          >
          <input
            type="number"
            inputmode="numeric"
            step="1"
            min="0"
            class="text-right @min-[440px]/items:order-4 @min-[440px]/items:grow-0
                   @min-[440px]/items:basis-14"
            :value="item.qty"
            @input="onInput(index, 'qty', $event)"
          >
        </div>
      </div>
    </div>

    <button
      class="add"
      type="button"
      @click="onAdd"
    >
      + Add item
    </button>
    <p class="hint">
      {{ summary }}
    </p>
    <p class="hint">
      The name is optional. Give two rows the same name and they become one
      payment; leave it blank and each one is billed on its own.
    </p>
  </section>
</template>

<script setup>
import { computed, nextTick, useTemplateRef } from 'vue'
import { rm, plural, people } from '../lib/money.js'

const props = defineProps({
  items: { type: Array, required: true },
  unitCount: { type: Number, required: true },
  foodTotal: { type: Number, required: true },
  payerCount: { type: Number, default: 0 }
})

const emit = defineEmits(['update', 'add', 'remove'])

const summary = computed(() => {
  if (props.unitCount === 0) return 'Add an item to get started.'
  const head = `${plural(props.unitCount, 'unit')} · ${rm(props.foodTotal)} of food`
  return `${head} · ${people(props.payerCount)} paying`
})

// The parent owns the data; rows only report what changed.
function onInput (index, field, event) {
  emit('update', index, field, event.target.value)
}

const rowList = useTemplateRef('rowList')

async function onAdd () {
  emit('add')
  // Wait for the parent's new row to actually render before reaching for it.
  await nextTick()
  const rows = rowList.value?.querySelectorAll('.item-row')
  rows?.[rows.length - 1]?.querySelector('input')?.focus()
}
</script>
