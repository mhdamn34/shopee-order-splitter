<template>
  <section class="card @container/people">
    <h2 class="card-title">
      Who pays what
    </h2>

    <!-- A long payer list in a wide card wastes a lot of vertical space, so it
         splits into columns once the card is wide enough. -->
    <ul
      class="persons text-sm
             @min-[520px]/people:grid @min-[520px]/people:gap-x-6
             @min-[520px]/people:grid-cols-[repeat(auto-fill,minmax(240px,1fr))]"
    >
      <li
        v-for="(person, index) in plan.persons"
        :key="index"
        class="flex justify-between gap-2.5 border-t border-line py-[7px]
               first:border-t-0 @min-[520px]/people:first:border-t"
      >
        <div class="min-w-0">
          <div class="name flex flex-wrap items-baseline gap-1.5">
            {{ person.label }}
            <span
              v-if="person.named && person.units.length > 1"
              class="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold
                     tracking-[0.04em] text-accent uppercase"
            >{{ person.units.length }} items</span>
          </div>
          <small class="block text-[11px] text-muted">
            <template v-if="person.named">{{ itemList(person) }} · </template>
            {{ rm(person.subtotal) }} · {{ orderList(person) }}
          </small>
        </div>
        <div class="amt font-semibold whitespace-nowrap">
          {{ rm(person.pays) }}
        </div>
      </li>
    </ul>

    <div
      class="flat mt-3 flex items-center justify-between gap-2.5 rounded-[10px]
             bg-bg px-3 py-2.5 text-[13.5px]"
    >
      <span>Or just split it flat, {{ people(plan.persons.length) }}</span>
      <strong>RM{{ plan.flatRate.toFixed(2) }} each</strong>
    </div>
  </section>
</template>

<script setup>
import { rm, people } from '../lib/money.js'

defineProps({
  plan: { type: Object, required: true }
})

// "Chicken Chop, Roti Bakar Set" reads better than a bare count when someone
// ordered a few different things.
function itemList (person) {
  return person.units.map(unit => unit.label).join(', ')
}

function orderList (person) {
  const label = person.orders.length === 1 ? 'order' : 'orders'
  return `${label} ${person.orders.join(' + ')}`
}
</script>
