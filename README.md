<img src="public/apple-touch-icon.png" width="72" alt="">

# Shopee Order Splitter

Shopee vouchers have minimum spends, so one big food order usually only gets to
use one of them. Splitting the same basket into several orders lets you stack
more — but every order pays its own delivery fee, and past a point those fees
cost more than the extra vouchers save.

This works out where that line falls: the cheapest way to split your basket,
which voucher goes on which order, and what everyone owes you.

Everything runs in your browser. Nothing is uploaded, and there is no account.

## Quick start

```bash
npm install
npm run dev
```

Open **http://localhost:5173**. That is it.

To use a different port, put `VITE_APP_PORT=5175` in a `.env` file.

## How to use it

**1. Enter your items.** Name, who ordered it, the price, and how many. Only the
price really matters — the rest makes the result easier to read.

Naming is how the app knows who owes what. Give two rows the same name and they
become one payment. Leave a name blank and that row is billed on its own.

**2. Add your vouchers.** Each one is a minimum spend and an amount off. These
are your *item* vouchers — the discount codes that apply to the food subtotal.

**3. Add your delivery vouchers and the delivery fee.** Free-shipping vouchers
sit in a separate slot, so one order can use an item voucher and a delivery
voucher together. Anything at or above the delivery fee means free delivery.

**4. Read the plan.** You get the grand total first, then each order: what goes
in it, which voucher it uses, and what it costs. Under that, what each person
owes — or a flat rate if you would rather keep it simple.

**5. Compare the splits.** The table shows what one, two, three… orders would
cost. The cheapest is tagged. **Tap any row to switch to that plan** — sometimes
one fewer order is a couple of ringgit more and a lot less hassle.

Watch for the **So close** warning. It means an order is a ringgit or two short
of a voucher you are holding, and moving one item could pay for itself.

**6. Add your payment QR.** Drop a screenshot of your DuitNow or TNG QR into the
*Your payment QR* card and type your name. It is saved in your browser and never
uploaded.

**7. Share it.** *Share summary + QR* builds one image — who owes what, the
total, and your QR — and hands it to your phone's share sheet, your clipboard,
or your downloads, whichever your browser supports. Send it to the group chat
and everyone can scan and pay.

There is also *Copy summary for WhatsApp*, which copies the full order-by-order
breakdown as plain text.

## Your basket is remembered

Your items, vouchers, delivery fee and QR are saved on your device, so coming
back next week means editing last week's basket rather than starting over. Your
voucher list in particular rarely changes.

The first time you open it you get an example basket, labelled as one. **Clear
items** wipes the items and keeps your vouchers — which is the usual weekly
rhythm. **Load example** brings the demo back.

## Things worth knowing

- **Rows with no price are ignored.** They are almost always an empty row you
  have not filled in, and counting one as a person who owes nothing would
  distort both the head count and the flat rate.
- **Shares add up exactly.** Everyone pays `their share of the food / total ×
  grand total`, rounded to the cent, and the last person absorbs the remainder —
  unless that would take them below zero, in which case the biggest payer
  absorbs it.
- **Units move between orders individually.** That is what makes the vouchers
  stack, so one person's items can land in different orders while they still owe
  a single amount.
- **The seeded delivery vouchers are placeholders.** Replace them with the ones
  you actually hold.
- **`dist/` needs to be served.** Module scripts are CORS-blocked on `file://`,
  so the built output will not run by double-clicking it. Use `npm run preview`,
  or host it.

## Privacy

There is no server. Your basket and your QR are held in your own browser's
local storage and never sent anywhere. Clearing your browser data clears them.

The share image is built in the page, on your device. It goes only where you
send it.

## Development

```bash
npm run dev       # http://localhost:5173
npm test          # the full suite
npm run test:watch
npm run lint
npm run build     # -> dist/
npm run preview   # serve the built output
```

```
src/
  lib/            pure logic, no Vue — all of it unit tested
    solver.js       partitioning + voucher assignment
    plan.js         turns a split into orders, shares, near misses, summary text
    shareCard.js    lays out and draws the shareable payment card
    storage.js      versioned localStorage, with validation
    image.js        downscales an uploaded QR
    money.js        cents <-> RM
    defaults.js     the example basket
  composables/
    useSplitter.js  state, debounced solve, debounced save, derived results
  components/       one concern each, props down / events up
```

**[How it works →](docs/how-it-works.md)** — the search, the layout, the styling.
