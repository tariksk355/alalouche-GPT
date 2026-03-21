const { PrismaClient } = require('@prisma/client');
const crypto = require('node:crypto');

const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}


function normalizeNodeEnv() {
  const raw = (process.env.NODE_ENV || 'development').trim().toLowerCase();
  return raw || 'development';
}

function normalizeOptionalString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function defaultBranding(name) {
  return {
    logoUrl: null,
    primaryColor: '#b5122a',
    secondaryColor: '#111827',
    accentColor: '#b5122a',
    tagline: `${name}`,
  };
}

function defaultContact(email, phone) {
  return {
    phone,
    email,
    addressLine1: 'Rte de Chantemerle 58',
    city: 'Granges-Paccot',
    postalCode: '1763',
    countryCode: 'CH',
  };
}

function defaultCapabilities({ orderingEnabled = true, reservationEnabled = true, deviceReceiverEnabled = true } = {}) {
  return {
    orderingEnabled,
    reservationEnabled,
    deliveryEnabled: false,
    takeawayEnabled: true,
    deviceReceiverEnabled,
  };
}

function defaultMenuCatalog() {
  return [
    { id: 'menu-doner', name: 'Kebab Döner', description: 'Pain maison, viande kebab, crudités, sauce au choix.', price: 12.5, category: 'Sandwichs et menu', sortOrder: 10, available: true },
    { id: 'menu-doner-menu', name: 'Menu Kebab Döner', description: 'Kebab + frites + boisson 33cl.', price: 17.5, category: 'Sandwichs et menu', sortOrder: 20, available: true },
    { id: 'sauce-fromage', name: 'Sauce fromage', description: 'Sauce chaude au fromage.', price: 2.5, category: 'Nos sauces chaudes', sortOrder: 30, available: true },
    { id: 'sauce-algerienne', name: 'Sauce algérienne', description: 'Sauce froide légèrement relevée.', price: 2, category: 'Nos sauces froides', sortOrder: 40, available: true },
    { id: 'plat-assiette', name: 'Assiette kebab', description: 'Viande, salade, frites et pain.', price: 18.5, category: 'Plats et Pide', sortOrder: 50, available: true },
    { id: 'boisson-coca', name: 'Coca-Cola 33cl', description: 'Boisson fraîche.', price: 3.5, category: 'Boissons', sortOrder: 60, available: true },
    { id: 'biere-efes', name: 'Efes 33cl', description: 'Bière blonde turque.', price: 5, category: 'Bières & Alcools', sortOrder: 70, available: true },
    { id: 'dessert-fondue', name: 'Fondue chocolat', description: 'Fondue chocolat avec fruits frais.', price: 9.5, category: 'Desserts', sortOrder: 80, available: true },
  ];
}

async function upsertRestaurant({ id, slug, name, primaryDomain, email, phone, provisionedContactEmail = null }) {
  const existingRestaurant = await prisma.restaurant.findUnique({
    where: { id },
    select: { contactInfo: true },
  });

  const existingContact = existingRestaurant?.contactInfo && typeof existingRestaurant.contactInfo === 'object' && !Array.isArray(existingRestaurant.contactInfo)
    ? existingRestaurant.contactInfo
    : {};

  const nextContactEmail =
    normalizeOptionalString(provisionedContactEmail) ||
    normalizeOptionalString(existingContact.email) ||
    normalizeOptionalString(email);
  const nextContactPhone = normalizeOptionalString(existingContact.phone) || normalizeOptionalString(phone);
  const contactInfo = {
    ...defaultContact(nextContactEmail, nextContactPhone),
    ...existingContact,
    ...(nextContactPhone ? { phone: nextContactPhone } : {}),
    ...(nextContactEmail ? { email: nextContactEmail } : {}),
  };

  return prisma.restaurant.upsert({
    where: { id },
    update: {
      name,
      slug,
      primaryDomain,
      status: 'active',
      branding: defaultBranding(name),
      contactInfo,
      locale: 'fr-CH',
      timezone: 'Europe/Zurich',
      currency: 'CHF',
      capabilities: defaultCapabilities(),
      orderingSettings: { orderNumberPrefix: slug?.slice(0, 3)?.toUpperCase() || 'ORD', minPrepMinutesDefault: 15, menuCatalog: defaultMenuCatalog() },
      reservationSettings: { slotIntervalMinutes: 30, maxPartySize: 12, advanceBookingDays: 30 },
    },
    create: {
      id,
      name,
      slug,
      primaryDomain,
      status: 'active',
      branding: defaultBranding(name),
      contactInfo,
      locale: 'fr-CH',
      timezone: 'Europe/Zurich',
      currency: 'CHF',
      capabilities: defaultCapabilities(),
      orderingSettings: { orderNumberPrefix: slug?.slice(0, 3)?.toUpperCase() || 'ORD', minPrepMinutesDefault: 15, menuCatalog: defaultMenuCatalog() },
      reservationSettings: { slotIntervalMinutes: 30, maxPartySize: 12, advanceBookingDays: 30 },
    },
  });
}


async function main() {
  const nodeEnv = normalizeNodeEnv();
  const isProduction = nodeEnv === 'production';
  const primaryRestaurantId = (process.env.DEFAULT_RESTAURANT_ID || '').trim() || 'alalouche';
  const provisionedPrimaryRestaurantContactEmail = normalizeOptionalString(process.env.RESTAURANT_CONTACT_EMAIL);
  const withSampleOrders = process.env.SEED_SAMPLE_ORDERS === 'true';
  const includeDemoTenant = !isProduction || process.env.SEED_INCLUDE_DEMO_TENANT === 'true';

  const primaryRestaurant = await upsertRestaurant({
    id: primaryRestaurantId,
    slug: 'alalouche',
    name: 'À la Louche',
    primaryDomain: null,
    email: isProduction ? null : 'info@alalouche.local',
    phone: '0263034561',
    provisionedContactEmail: provisionedPrimaryRestaurantContactEmail,
  });

  const secondaryRestaurant = includeDemoTenant
    ? await upsertRestaurant({
        id: 'demo-second-restaurant',
        slug: 'demo-bistro',
        name: 'Demo Bistro',
        primaryDomain: null,
        email: 'hello@demobistro.local',
        phone: '0215550101',
      })
    : null;

  await prisma.adminUser.upsert({
    where: { username: 'admin' },
    update: {
      displayName: 'Admin Local',
      restaurantId: primaryRestaurant.id,
      passwordHash: hashPassword('admin1234'),
    },
    create: {
      username: 'admin',
      displayName: 'Admin Local',
      restaurantId: primaryRestaurant.id,
      passwordHash: hashPassword('admin1234'),
    },
  });

  if (secondaryRestaurant) {
    await prisma.adminUser.upsert({
      where: { username: 'admin_demo_bistro' },
      update: {
        displayName: 'Admin Demo Bistro',
        restaurantId: secondaryRestaurant.id,
        passwordHash: hashPassword('admin1234'),
      },
      create: {
        username: 'admin_demo_bistro',
        displayName: 'Admin Demo Bistro',
        restaurantId: secondaryRestaurant.id,
        passwordHash: hashPassword('admin1234'),
      },
    });
  }

  await prisma.customer.upsert({
    where: { restaurantId_email: { restaurantId: primaryRestaurant.id, email: 'demo.customer@alalouche.local' } },
    update: {
      fullName: 'Client Démo',
      passwordHash: hashPassword('customer1234'),
      phone: '0263034561',
    },
    create: {
      restaurantId: primaryRestaurant.id,
      fullName: 'Client Démo',
      email: 'demo.customer@alalouche.local',
      passwordHash: hashPassword('customer1234'),
      phone: '0263034561',
    },
  });

  if (secondaryRestaurant) {
    await prisma.customer.upsert({
      where: { restaurantId_email: { restaurantId: secondaryRestaurant.id, email: 'demo.customer@demobistro.local' } },
      update: {
        fullName: 'Demo Bistro Customer',
        passwordHash: hashPassword('customer1234'),
        phone: '0215550101',
      },
      create: {
        restaurantId: secondaryRestaurant.id,
        fullName: 'Demo Bistro Customer',
        email: 'demo.customer@demobistro.local',
        passwordHash: hashPassword('customer1234'),
        phone: '0215550101',
      },
    });
  }

  if (withSampleOrders) {
    const existing = await prisma.order.count({ where: { restaurantId: primaryRestaurant.id } });
    if (existing === 0) {
      await prisma.order.createMany({
        data: [
          {
            restaurantId: primaryRestaurant.id,
            orderNumber: 'LOC-1001',
            customerName: 'Test Customer One',
            customerEmail: 'customer.one@example.com',
            status: 'new',
            totalAmount: 17.0,
            payload: {
              items: [
                { name: 'Sandwich', quantity: 1, price: 12.5 },
                { name: 'Frites', quantity: 1, price: 4.5 },
              ],
              total: 17.0,
            },
          },
          {
            restaurantId: primaryRestaurant.id,
            orderNumber: 'LOC-1002',
            customerName: 'Test Customer Two',
            customerEmail: 'customer.two@example.com',
            status: 'accepted',
            prepMinutes: 30,
            totalAmount: 16.0,
            payload: {
              items: [{ name: 'Salade', quantity: 2, price: 8.0 }],
              total: 16.0,
            },
          },
        ],
      });
    }

    const existingReservations = await prisma.reservation.count({ where: { restaurantId: primaryRestaurant.id } });
    if (existingReservations === 0) {
      const now = new Date();
      const upcoming = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const later = new Date(now.getTime() + 5 * 60 * 60 * 1000);

      await prisma.reservation.createMany({
        data: [
          {
            restaurantId: primaryRestaurant.id,
            customerName: 'Reservation Demo One',
            customerEmail: 'res.one@example.com',
            guestCount: 2,
            reservationDate: upcoming,
            status: 'pending',
            notes: 'Window seat',
          },
          {
            restaurantId: primaryRestaurant.id,
            customerName: 'Reservation Demo Two',
            customerEmail: 'res.two@example.com',
            guestCount: 4,
            reservationDate: later,
            status: 'confirmed',
          },
        ],
      });
    }
  }

  const primaryContactInfo = primaryRestaurant.contactInfo && typeof primaryRestaurant.contactInfo === 'object' && !Array.isArray(primaryRestaurant.contactInfo)
    ? primaryRestaurant.contactInfo
    : {};

  console.log('[seed] restaurants:', primaryRestaurant.id, secondaryRestaurant ? secondaryRestaurant.id : '(primary only)');
  console.log('[seed] primary restaurant contact email:', normalizeOptionalString(primaryContactInfo.email) || 'not set');
  console.log('[seed] sample orders:', withSampleOrders ? 'enabled' : 'disabled');
  console.log('[seed] demo tenant:', secondaryRestaurant ? 'included' : 'skipped');
  console.log('[seed] admin users:', secondaryRestaurant ? 'admin/admin1234, admin_demo_bistro/admin1234' : 'admin/admin1234');
  console.log('[seed] demo customers:', secondaryRestaurant ? 'demo.customer@alalouche.local, demo.customer@demobistro.local / customer1234' : 'demo.customer@alalouche.local / customer1234');
}

main()
  .catch((error) => {
    console.error('[seed] failed', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
