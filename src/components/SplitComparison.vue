<script setup>
import { rm, plural } from '../lib/money.js'

defineProps({
  rows: { type: Array, required: true }
})

const emit = defineEmits(['select'])
</script>

<template>
  <section class="card">
    <h2 class="card-title">Compare splits</h2>

    <table class="w-full border-collapse text-sm">
      <thead>
        <tr class="[&>th]:px-1 [&>th]:py-2.5 [&>th]:text-right [&>th:first-child]:text-left">
          <th class="text-[11px] font-semibold tracking-[0.04em] text-muted uppercase">Orders</th>
          <th class="text-[11px] font-semibold tracking-[0.04em] text-muted uppercase">Discount</th>
          <th class="text-[11px] font-semibold tracking-[0.04em] text-muted uppercase">Delivery</th>
          <th class="text-[11px] font-semibold tracking-[0.04em] text-muted uppercase">Total</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.orderCount"
          class="border-t border-line
                 [&>td]:px-1 [&>td]:py-2.5 [&>td]:text-right [&>td:first-child]:text-left"
          :class="row.available
            ? ['cursor-pointer', row.isActive ? 'active bg-accent-soft [&>td]:font-semibold' : '']
            : 'disabled cursor-default opacity-40'"
          @click="row.available && emit('select', row.orderCount)"
        >
          <template v-if="row.available">
            <td>
              {{ plural(row.orderCount, 'order') }}
              <span
                v-if="row.isCheapest"
                class="tag ml-1.5 inline-block rounded-full bg-good-soft px-1.5 py-0.5 align-[1px]
                       text-[10px] font-bold tracking-[0.04em] text-good uppercase"
              >cheapest</span>
            </td>
            <td>&minus;{{ rm(row.discount) }}</td>
            <td>{{ rm(row.delivery) }}</td>
            <td>
              {{ rm(row.cost) }}
              <span v-if="row.extra > 0" class="text-xs text-muted">
                +{{ (row.extra / 100).toFixed(2) }}
              </span>
            </td>
          </template>
          <template v-else>
            <td>{{ plural(row.orderCount, 'order') }}</td>
            <td colspan="3">needs {{ row.orderCount }} items</td>
          </template>
        </tr>
      </tbody>
    </table>

    <p class="hint">
      Tap a row to use that plan — sometimes one fewer order is only a few ringgit
      more and a lot less hassle.
    </p>
  </section>
</template>
