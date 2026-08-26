<script setup>
import { rm } from '../lib/money.js'

defineProps({
  nearMisses: { type: Array, required: true }
})
</script>

<template>
  <div
    v-if="nearMisses.length > 0"
    class="warn mb-3.5 rounded-[10px] bg-warn-soft px-3 py-2.5 text-[13px] text-warn"
  >
    <strong class="mb-1 block">So close</strong>
    <ul class="list-disc pl-[18px]">
      <li v-for="(miss, index) in nearMisses" :key="index">
        Order {{ miss.order }} is {{ rm(miss.gap) }} short of the
        {{ rm(miss.voucher.min) }} {{ miss.kind === 'delivery' ? 'delivery voucher' : 'voucher' }}
        ({{ rm(miss.voucher.off) }} off).
      </li>
    </ul>
  </div>
</template>
