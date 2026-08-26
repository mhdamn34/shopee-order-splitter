<script setup>
import { rm } from '../lib/money.js'

defineProps({
  plan: { type: Object, required: true },
  deliveryCents: { type: Number, required: true }
})
</script>

<template>
  <section class="card @container/plan">
    <h2 class="card-title">The plan</h2>

    <!-- The grand total leads, so it is the first thing on screen rather than
         something you scroll past the order cards to reach. -->
    <div
      class="mb-3 border-b border-line pb-2.5 text-[13px] text-muted
             [&>div]:flex [&>div]:justify-between [&>div]:py-0.5"
    >
      <div class="grand mb-1 text-[19px] font-bold text-ink">
        <span>Grand total</span><span class="text-accent">{{ rm(plan.grandTotal) }}</span>
      </div>
      <div><span>Food</span><span>{{ rm(plan.itemsTotal) }}</span></div>
      <div><span>Vouchers</span><span>&minus;{{ rm(plan.itemDiscountTotal) }}</span></div>
      <div>
        <span>Delivery ({{ plan.orderCount }} × {{ rm(deliveryCents) }})</span>
        <span>{{ rm(plan.deliveryTotal) }}</span>
      </div>
      <div v-if="plan.deliveryDiscountTotal > 0">
        <span>Delivery vouchers</span>
        <span>&minus;{{ rm(plan.deliveryDiscountTotal) }}</span>
      </div>
    </div>

    <!-- Side by side once there is room for two cards. Measured both ways: at
         around 240px a couple of item names wrap onto a second line, but two
         columns of wrapped cards still come out shorter than one column of
         unwrapped ones, and less scrolling is the whole point. -->
    <div
      class="orders grid items-start gap-2.5
             @min-[480px]/plan:grid-cols-[repeat(auto-fill,minmax(230px,1fr))]"
    >
      <div
        v-for="(order, index) in plan.orders"
        :key="index"
        class="order rounded-xl border border-line p-3"
      >
        <div class="mb-2 flex items-baseline justify-between">
          <h3 class="text-[15px] font-semibold">Order {{ index + 1 }}</h3>
          <span class="font-bold">{{ rm(order.total) }}</span>
        </div>

        <!-- min-w-0 on the name and nowrap on the price means only the name ever
             wraps, never both halves of the line. -->
        <ul
          class="mb-2.5 text-[13.5px]
                 [&>li]:flex [&>li]:justify-between [&>li]:gap-2.5 [&>li]:py-0.5
                 [&>li]:text-muted
                 [&_span:first-child]:min-w-0 [&_span:first-child]:text-ink
                 [&_span:last-child]:shrink-0 [&_span:last-child]:whitespace-nowrap"
        >
          <li v-for="(unit, u) in order.units" :key="u">
            <span>
              {{ unit.label }}
              <em
                v-if="unit.who"
                class="ml-1 rounded-full bg-accent-soft px-1.5 py-px text-[11px] not-italic text-accent"
              >{{ unit.who }}</em>
            </span>
            <span>{{ rm(unit.price) }}</span>
          </li>
        </ul>

        <div
          class="border-t border-dashed border-line pt-2 text-[13px]
                 [&>div]:flex [&>div]:justify-between [&>div]:py-0.5"
        >
          <div class="text-muted">
            <span>Subtotal</span><span>{{ rm(order.subtotal) }}</span>
          </div>
          <div v-if="order.voucher" class="font-semibold text-good">
            <span>Voucher (min {{ rm(order.voucher.min) }})</span>
            <span>&minus;{{ rm(order.discount) }}</span>
          </div>
          <div v-else class="text-muted italic">
            <span>No voucher applied</span><span>&mdash;</span>
          </div>
          <div v-if="order.freeDelivery" class="font-semibold text-good">
            <span>Delivery free (min {{ rm(order.deliveryVoucher.min) }})</span>
            <span>&minus;{{ rm(order.deliveryDiscount) }}</span>
          </div>
          <template v-else-if="order.deliveryVoucher">
            <div class="font-semibold text-good">
              <span>Delivery voucher (min {{ rm(order.deliveryVoucher.min) }})</span>
              <span>&minus;{{ rm(order.deliveryDiscount) }}</span>
            </div>
            <div class="text-muted">
              <span>Delivery</span><span>{{ rm(order.deliveryPaid) }}</span>
            </div>
          </template>
          <div v-else class="text-muted">
            <span>Delivery</span><span>{{ rm(deliveryCents) }}</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
