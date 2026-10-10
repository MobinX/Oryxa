/**
 * Seeds the store that `/admin/agent-playground` tests prompts against.
 *
 *   bun --env-file=.env packages/db/scripts/seed-admin-sandbox.ts [owner-email]
 *
 * It only adds: one business (slug `oryxa-sandbox`), its default agent, and a catalog whose
 * products carry real descriptions, so an agent asked "is it water resistant?" has something
 * verified to answer with instead of inventing it. Re-running it reports what is already there
 * and writes nothing, which is what makes it safe to run against production twice by accident.
 *
 * The store is deliberately left on no plan. `businesses.plan_id IS NULL` means unlimited
 * replies, which is the shape an operator's own test tenant wants: a quota that ran out would
 * look like a broken agent to whoever is reading the transcript.
 */
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../client';
import { businesses, channels as channelsTable, products, users } from '../schema';
import { ADMIN_SANDBOX_SLUG } from '../crud/business';
import { ensureDefaultAgent, getDefaultAgent } from '../crud/default-agent';
import { createProduct } from '../crud/product';

interface SeedVariant {
  name: string;
  price: number;
  stock: number;
}

interface SeedProduct {
  name: string;
  sku: string;
  price: number;
  categoryName: string;
  description: string;
  variants: SeedVariant[];
}

/**
 * Six things a Bangladeshi Facebook page actually sells, priced in BDT. The descriptions are the
 * point: they are what the agent quotes back, so they carry the answers customers ask for —
 * warranty, delivery charge, material, whether it fits a 10 kg shipment.
 */
const CATALOG: SeedProduct[] = [
  {
    name: 'AirPods Pro 2nd Generation',
    sku: 'AP-PRO-2',
    price: 21500,
    categoryName: 'Electronics',
    description:
      'Apple AirPods Pro, second generation, with the USB-C charging case. Active noise cancellation, transparency mode and adaptive EQ. Up to 6 hours of listening per charge and 30 hours with the case. Sweat and water resistant for workouts and rain, not for swimming. Genuine Apple stock with a 6-month Oryxa service warranty; the serial number can be checked on Apples website before delivery. Cash on delivery all over Bangladesh, delivery inside Dhaka takes 1 working day and 2 to 3 days outside Dhaka.',
    variants: [
      { name: 'Sealed box', price: 21500, stock: 14 },
      { name: 'Open box, unread', price: 19900, stock: 3 },
    ],
  },
  {
    name: 'Premium Cotton T-Shirt',
    sku: 'TS-COT-001',
    price: 890,
    categoryName: 'Fashion',
    description:
      'Handmade 100 percent combed cotton t-shirt, 180 GSM bio-washed fabric, so it does not shrink past half a size in the first wash. Available in black, white, navy and olive with ribbed collar that keeps its shape. Cut is regular fit; a customer who normally wears L should order L, two sizes are listed below for the larger fits. Machine washable in cold water, no bleach. Pairs can be ordered together with free delivery inside Dhaka.',
    variants: [
      { name: 'Black M', price: 890, stock: 40 },
      { name: 'Black XL', price: 990, stock: 22 },
      { name: 'White L', price: 890, stock: 0 },
    ],
  },
  {
    name: 'Silk Jamdani Saree',
    sku: 'SIL-JAM-01',
    price: 4600,
    categoryName: 'Fashion',
    description:
      'Half-meter silk Jamdani handwoven in Dhakeshwri with a matching blouse piece and unpitched bottom for tailoring. Real handloom, so the motif on every saree differs slightly from the photo. Weight is about 700 grams, which fits inside a standard courier limit. Dry clean only. Blouse stitching can be added for 600 taka and takes three extra days before delivery.',
    variants: [
      { name: 'Red and gold', price: 4600, stock: 6 },
      { name: 'Maroon and silver', price: 4800, stock: 4 },
      { name: 'Sky blue', price: 4600, stock: 2 },
    ],
  },
  {
    name: 'Bluetooth Party Speaker 30W',
    sku: 'SPK-BT-30',
    price: 5400,
    categoryName: 'Electronics',
    description:
      'Portable 30 watt Bluetooth speaker with dual 3 inch drivers, built-in 3600 mAh rechargeable battery and about 8 hours of play at half volume. Connects by Bluetooth 5.3, AUX cable or USB pen drive, and two units can be paired together for true stereo. Splash resistant to rain and poolside splashes but must not be submerged. Comes with a 12-month warranty card, charging cable and AUX cable. Weighs 2.1 kg.',
    variants: [
      { name: 'Black', price: 5400, stock: 9 },
      { name: 'Teal', price: 5600, stock: 5 },
    ],
  },
  {
    name: 'Sundarban Organic Honey 500g',
    sku: 'HNY-SNR-500',
    price: 720,
    categoryName: 'Groceries',
    description:
      'Raw multifloral honey collected from the Sundarban mangrove belt, unheated and unfiltered, so it granulates naturally in winter which is the proof it is real and not syrup. 500 gram glass jar, net weight, with the collection month printed on the label. No added sugar, suitable for children over one year. Store at room temperature away from sunlight. Jars ship in thermocol sleeves and arrive intact in almost every order; a broken jar is replaced free.',
    variants: [
      { name: '500 g jar', price: 720, stock: 60 },
      { name: '250 g jar', price: 400, stock: 85 },
      { name: '1 kg family jar', price: 1300, stock: 18 },
    ],
  },
  {
    name: 'Power Bank 20000mAh Fast Charge',
    sku: 'PWB-20K-FC',
    price: 2350,
    categoryName: 'Electronics',
    description:
      '20000 mAh lithium polymer power bank with 22.5 watt PD output, one USB-C and two USB-A ports, so it charges a phone and earbuds at the same time. A 5000 mAh phone reaches about 80 percent in 40 minutes and the pack itself refills in roughly 4 hours from a 20 watt charger. Has an on-screen percentage readout and airline-legal capacity. Six-month warranty; it is not compatible with laptops that need more than 30 watts.',
    variants: [
      { name: 'Grey', price: 2350, stock: 26 },
      { name: 'Blue', price: 2350, stock: 11 },
    ],
  },
];

async function owner(email: string) {
  const [row] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);
  return row ?? null;
}

/**
 * Returns the live sandbox row. A soft-deleted one is revived rather than replaced: the slug is
 * unique across the whole table, deleted rows included, so a second insert would be refused by
 * the database and the operator would be told the seed failed.
 */
async function ensureBusiness(userId: string) {
  const existing = await db.query.businesses.findFirst({
    where: eq(businesses.slug, ADMIN_SANDBOX_SLUG),
  });

  if (existing) {
    if (existing.deletedAt) {
      await db
        .update(businesses)
        .set({ deletedAt: null, userId })
        .where(eq(businesses.id, existing.id));
      console.log(`revived the soft-deleted ${ADMIN_SANDBOX_SLUG} store and moved it to this owner`);
    }
    return { ...existing, userId, deletedAt: null };
  }

  const [created] = await db
    .insert(businesses)
    .values({
      userId,
      name: 'Oryxa Sandbox',
      slug: ADMIN_SANDBOX_SLUG,
      type: 'Retail',
      description:
        'Oryxas own test store. It has a full catalog on purpose so the agent has real products to quote when someone tries a system prompt.',
    })
    .returning();

  console.log(`created store ${created.name} (${created.id})`);
  return created;
}

const seedSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function ensureCatalog(businessId: string) {
  const live = await db
    .select({ slug: products.slug })
    .from(products)
    .where(and(eq(products.businessId, businessId), isNull(products.deletedAt)));
  const present = new Set(live.map((row) => row.slug));

  let added = 0;
  for (const item of CATALOG) {
    if (present.has(seedSlug(item.name))) {
      console.log(`  keeps ${item.name}`);
      continue;
    }
    await createProduct({
      businessId,
      name: item.name,
      sku: item.sku,
      price: item.price,
      description: item.description,
      categoryName: item.categoryName,
      variants: item.variants.map((v) => ({
        name: v.name,
        price: v.price,
        stock: v.stock,
        isAvailable: v.stock > 0,
      })),
    });
    console.log(`  adds  ${item.name} (${item.variants.length} variants)`);
    added += 1;
  }
  return added;
}

export async function seedSandbox(email: string) {
  const account = await owner(email);
  if (!account) throw new Error(`no live user with email ${email}`);

  console.log(`seeding the playground store for ${account.email}`);

  const sandbox = await ensureBusiness(account.id);

  // Read before writing so the log can say which happened; `ensureDefaultAgent` is correct either
  // way and never overwrites a prompt the operator has been editing.
  const agentBefore = await getDefaultAgent(sandbox.id);
  const agent = await ensureDefaultAgent(sandbox.id);
  console.log(
    agentBefore
      ? `store already had ${agent.name} (${agent.id}) — its prompt is left exactly as it is`
      : `created ${agent.name} (${agent.id}) with the default prompt`,
  );

  const added = await ensureCatalog(sandbox.id);

  const liveChannels = await db
    .select({ id: channelsTable.id })
    .from(channelsTable)
    .where(and(eq(channelsTable.businessId, sandbox.id), isNull(channelsTable.deletedAt)));

  console.log(`\n${ADMIN_SANDBOX_SLUG} is ready`);
  console.log(`  businessId : ${sandbox.id}`);
  console.log(
    `  products   : ${CATALOG.length} wanted, ${added} added, ${CATALOG.length - added} already there`,
  );
  console.log(`  channels   : ${liveChannels.length} live — the playground makes its own on first run`);
  console.log('  plan       : none, which means unlimited replies for this store');
  console.log(`\nsign in to the dashboard as ${account.email} and open /admin/agent-playground.`);

  return { businessId: sandbox.id, agentId: agent.id, productsAdded: added };
}

// Only the CLI form exits; importing `seedSandbox()` for a dry run must not kill the importer.
if (process.argv[1]?.includes('seed-admin-sandbox')) {
  const email = process.argv[2] ?? 'mobin0219@gmail.com';
  try {
    await seedSandbox(email);
  } catch (err) {
    console.error(
      `${err instanceof Error ? err.message : err}\n` +
        'usage: bun --env-file=.env packages/db/scripts/seed-admin-sandbox.ts [operator-email]',
    );
    process.exit(1);
  }
  process.exit(0);
}
