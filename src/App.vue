<template>
  <main class="mx-auto max-w-[560px] md:max-w-[1400px]">
    <header class="masthead">
      <h1 class="mb-1 text-center font-bold tracking-[-0.01em] md:text-[25px]">
        Shopee Order Splitter
      </h1>
      <p class="sub mb-4.5 text-center text-muted">
        Split one food order into several so you can stack more vouchers —
        without losing the savings to extra delivery fees.
      </p>
    </header>

    <div
      class="layout grid items-start md:grid-cols-[minmax(300px,1fr)_minmax(0,1.4fr)] md:gap-5"
    >
      <div class="column-inputs @container/inputs">
        <ItemsEditor
          :items="items"
          :unit-count="unitCount"
          :food-total="foodTotal"
          :payer-count="payerCount"
          :is-example="isExample"
          @update="updateItem"
          @add="addItem"
          @remove="removeItem"
          @clear="clearItems"
          @load-example="loadExample"
        />

        <div
          class="voucher-pair grid items-start gap-3.5 @min-[530px]/inputs:grid-cols-2"
        >
          <VoucherEditor
            :vouchers="vouchers"
            title="Item vouchers"
            hint="One per order, each usable once. Applies to the food subtotal."
            empty-message="No vouchers — splitting will only cost you extra delivery."
            @update="updateVoucher"
            @add="addVoucher"
            @remove="removeVoucher"
          />

          <VoucherEditor
            :vouchers="deliveryVouchers"
            title="Delivery vouchers"
            off-label="Off delivery (RM)"
            add-label="+ Add delivery voucher"
            hint="A separate slot, so an order can use one of these and an item voucher
              together. Anything at or above the delivery fee means free delivery."
            empty-message="No delivery vouchers — every order pays full delivery."
            @update="updateDeliveryVoucher"
            @add="addDeliveryVoucher"
            @remove="removeDeliveryVoucher"
          >
            <template #lead>
              <label class="field mb-3 block">
                <span class="mb-1.5 block text-xs text-muted">Delivery fee per order (RM)</span>
                <input
                  v-model="deliveryFee"
                  type="number"
                  inputmode="decimal"
                  step="0.01"
                  min="0"
                >
              </label>
            </template>
          </VoucherEditor>
        </div>

        <PaymentQr
          :image="qrImage"
          :payee="qrPayee"
          @update="setQr"
        />
      </div>

      <div class="column-output @container/output">
        <p class="status mx-0.5 mb-3.5 text-xs text-muted">
          {{ status }}
        </p>

        <p
          v-if="persistFailed"
          class="persist-warn mx-0.5 mb-3.5 text-xs text-warn"
        >
          Couldn't save on this device — your basket will not be remembered.
        </p>

        <template v-if="plan">
          <SplitComparison
            :rows="comparison"
            @select="selectOrderCount"
          />
          <NearMissWarning :near-misses="plan.nearMisses" />
          <PlanView
            :plan="plan"
            :delivery-cents="run.deliveryCents"
          />
          <PeopleSplit :plan="plan" />
          <ShareActions
            :plan="plan"
            :text="summary"
            :qr-image="qrImage"
            :qr-payee="qrPayee"
          />
        </template>
      </div>
    </div>
  </main>
</template>

<script setup>
import { computed } from "vue";
import { useSplitter } from "./composables/useSplitter.js";
import { buildSummary } from "./lib/plan.js";
import ItemsEditor from "./components/ItemsEditor.vue";
import VoucherEditor from "./components/VoucherEditor.vue";
import PaymentQr from "./components/PaymentQr.vue";
import SplitComparison from "./components/SplitComparison.vue";
import NearMissWarning from "./components/NearMissWarning.vue";
import PlanView from "./components/PlanView.vue";
import PeopleSplit from "./components/PeopleSplit.vue";
import ShareActions from "./components/ShareActions.vue";

const {
  deliveryFee,
  items,
  vouchers,
  deliveryVouchers,
  solving,
  isExample,
  persistFailed,
  qrImage,
  qrPayee,
  run,
  plan,
  comparison,
  hasItems,
  foodTotal,
  unitCount,
  updateItem,
  addItem,
  removeItem,
  clearItems,
  loadExample,
  setQr,
  updateVoucher,
  addVoucher,
  removeVoucher,
  updateDeliveryVoucher,
  addDeliveryVoucher,
  removeDeliveryVoucher,
  selectOrderCount,
} = useSplitter();

const status = computed(() => {
  if (solving.value) return "Working out the cheapest split…";
  if (!hasItems.value) return "Nothing to split yet.";
  if (run.value.exact) {
    return (
      `Checked all ${run.value.partitions.toLocaleString()} possible splits in ` +
      `${Math.round(run.value.elapsed)} ms. This is the cheapest.`
    );
  }
  return (
    `Too many items to check every split (${Math.round(run.value.partitions).toLocaleString()} ` +
    "of them), so this used the fast method: items sorted by price, highest first, then refined. " +
    "Very likely the best, but not guaranteed."
  );
});

const summary = computed(() =>
  plan.value ? buildSummary(plan.value, run.value.deliveryCents) : "",
);

const payerCount = computed(() => plan.value?.persons.length ?? 0);
</script>
