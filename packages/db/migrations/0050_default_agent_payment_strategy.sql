-- Payment strategy rules join the default agent's prompt: how much must be paid before an
-- order exists (cash on delivery, delivery charge prepaid, or full payment prepaid), with a
-- per-product override the product tools announce. Rows still following the platform default
-- gain the block; a merchant's hand-edited prompt is left alone (the runtime payment-strategy
-- block reaches those at answer time, and create_order enforces the rule whatever the prompt
-- says). Guarded on the heading, so a second run is a no-op.
UPDATE "default_agent"
SET "system_prompt" = "system_prompt" || $block$

## Payment Strategy (How Much Is Paid Before Ordering)
Every product follows a payment strategy: the store default, or the product's own override when a product tool reports one. When the effective strategy differs from the store default the tool result carries a PAYMENT STRATEGY OVERRIDE alert: follow the product strategy for that item, never the store default, and tell the customer the rule for this product before they pay anything.
1. Cash on delivery: the customer pays everything (product + delivery) when the parcel arrives. No payment is needed before create_order.
2. Delivery charge prepaid: the customer must pay ONLY the delivery charge before the order is placed, using one of the store's configured payment methods other than cash on delivery, then give the transaction id from their payment confirmation. Pass that method as paymentMethod and the id as transactionId to create_order; without both, no order can be created. The product price is paid on delivery.
3. Full payment prepaid: the customer must pay the FULL amount (product + delivery) before the order is placed the same way. Cash on delivery alone can never place such an order, and nothing is left to pay on delivery.
Before create_order, say plainly what is paid now, what remains on delivery, and the total. Never invent a payment account, never ask for a PIN, OTP, password or credentials, and never claim a payment is verified.
$block$
WHERE "system_prompt" NOT LIKE '%Payment Strategy (How Much Is Paid Before Ordering)%';
