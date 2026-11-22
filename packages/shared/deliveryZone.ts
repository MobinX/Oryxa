/**
 * OnlyOrders — Deterministic Bangladesh Delivery Zone Resolver
 *
 * Maps customer delivery addresses and regional text (English, Banglish, Bangla)
 * to merchant-configured delivery zones without relying on LLM guesswork.
 */

export interface DeliveryZoneConfig {
  label: string;
  price: number;
  aliases?: string[];
}

export interface ZoneResolution {
  status: 'resolved' | 'ambiguous' | 'unsupported_international';
  zone?: DeliveryZoneConfig;
  method:
    | 'merchant_label_match'
    | 'bd_geo_dhaka_city'
    | 'bd_geo_dhaka_suburb'
    | 'bd_geo_outside_dhaka'
    | 'single_zone_default'
    | 'none';
  normalizedRegion?: string;
}

const DHAKA_CITY_TOKENS = [
  'dhaka city', 'inside dhaka', 'dhaka metro', 'ঢাকা সিটি', 'ঢাকার ভিতরে', 'ঢাকার ভেতরে',
  'mirpur', 'মিরপুর', 'uttara', 'উত্তরা', 'dhanmondi', 'ধানমন্ডি', 'gulshan', 'গুলশান',
  'banani', 'বনানী', 'mohammadpur', 'মোহাম্মদপুর', 'badda', 'বাড্ডা', 'rampura', 'রামপুরা',
  'bashundhara', 'বসুন্ধরা', 'motijheel', 'মতিঝিল', 'farmgate', 'ফার্মগেট', 'tejgaon', 'তেজগাঁও',
  'khilgaon', 'খিলগাঁও', 'jatrabari', 'যাত্রাবাড়ী', 'wari', 'ওয়ারী', 'lalbagh', 'লালবাগ',
  'old dhaka', 'puran dhaka', 'পুরান ঢাকা', 'shyamoli', 'শ্যামলী', 'adabor', 'আদাবর',
  'banasree', 'বনশ্রী', 'aftabnagar', 'আফতাবনগর', 'malibagh', 'মালিবাগ', 'moghbazar', 'মগবাজার',
  'panthapath', 'kalabagan', 'new market', 'azimpur', 'shahbagh', 'kakrail', 'shantinagar',
  'khilkhet', 'nikunja', 'pallabi', 'kafrul', 'cantonment', 'demra', 'hazaribagh', 'mugda',
  'eskaton', 'elephant road', 'chawkbazar', 'kotwali', 'sutrapur', 'gendaria', 'baridhara',
];

const DHAKA_SUBURB_TOKENS = [
  'savar', 'সাভার', 'ashulia', 'আশুলিয়া', 'gazipur', 'গাজীপুর', 'tongi', 'টঙ্গী',
  'narayanganj', 'নারায়ণগঞ্জ', 'keraniganj', 'কেরানীগঞ্জ', 'dhamrai', 'ধামরাই', 'dohar', 'nawabganj',
];

const OUTSIDE_DHAKA_TOKENS = [
  'outside dhaka', 'saradesh', 'all bangladesh', 'ঢাকার বাইরে', 'ঢাকার বাহিরে',
  'sylhet', 'সিলেট', 'zindabazar', 'জিন্দাবাজার', 'amberkhana', 'upashahar', 'moulvibazar', 'habiganj', 'sunamganj',
  'chittagong', 'chattogram', 'চট্টগ্রাম', 'agrabad', 'nasirabad', 'gec', 'halishahar', 'coxs bazar', "cox's bazar", 'কক্সবাজার',
  'khulna', 'খুলনা', 'rajshahi', 'রাজশাহী', 'barishal', 'barisal', 'বরিশাল', 'rangpur', 'রংপুর',
  'mymensingh', 'ময়মনসিংহ', 'comilla', 'cumilla', 'কুমিল্লা', 'bogura', 'bogra', 'বগুড়া',
  'jessore', 'jashore', 'যশোর', 'feni', 'ফেনী', 'noakhali', 'নোয়াখালী', 'brahmanbaria', 'ব্রাহ্মণবাড়িয়া',
  'tangail', 'টাঙ্গাইল', 'narsingdi', 'নরসিংদী', 'manikganj', 'munshiganj', 'faridpur', 'pabna',
  'sirajganj', 'dinajpur', 'kushtia', 'satkhira', 'bhola', 'chandpur', 'lakshmipur', 'jamalpur',
  'sherpur', 'netrokona', 'kishoreganj', 'madaripur', 'gopalganj', 'shariatpur', 'rajbari',
  'magura', 'jhenaidah', 'narail', 'chuadanga', 'meherpur', 'bagerhat', 'pirojpur', 'jhalokathi',
  'barguna', 'patuakhali', 'naogaon', 'natore', 'chapainawabganj', 'joypurhat', 'gaibandha',
  'kurigram', 'lalmonirhat', 'nilphamari', 'panchagarh', 'thakurgaon', 'bandarban', 'rangamati', 'khagrachari',
];

const INTERNATIONAL_TOKENS = [
  'india', 'kolkata', 'uk', 'london', 'usa', 'america', 'dubai', 'uae', 'saudi', 'ksa', 'qatar', 'malaysia', 'singapore', 'canada', 'australia',
];

const includesAny = (haystack: string, needles: string[]) =>
  needles.some((n) => haystack.includes(n));

export function resolveDeliveryZone(
  rawInput: string,
  zones: DeliveryZoneConfig[] = []
): ZoneResolution {
  if (!zones || zones.length === 0) return { status: 'ambiguous', method: 'none' };
  if (zones.length === 1) return { status: 'resolved', zone: zones[0], method: 'single_zone_default' };

  const text = (rawInput ?? '').toLowerCase().trim();
  if (!text) return { status: 'ambiguous', method: 'none' };

  // 0. Guard against international requests if merchant only configures BD zones
  if (includesAny(text, INTERNATIONAL_TOKENS)) {
    const intlZone = zones.find((z) => /international|abroad|global|overseas/i.test(z.label));
    return intlZone
      ? { status: 'resolved', zone: intlZone, method: 'merchant_label_match' }
      : { status: 'unsupported_international', method: 'none' };
  }

  // 1. Exact / explicit merchant zone match FIRST
  const directMatch = zones.find((z) => {
    const candidates = [z.label.toLowerCase(), ...(z.aliases ?? []).map((a) => a.toLowerCase())];
    return candidates.some((c) => text.includes(c) || (c.includes(text) && text.length >= 4));
  });
  if (directMatch) return { status: 'resolved', zone: directMatch, method: 'merchant_label_match' };

  const findOutsideZone = () => zones.find((z) => /outside|all bangladesh|nationwide|saradesh|other/i.test(z.label));
  const findSuburbZone  = () => zones.find((z) => /sub|suburb|around dhaka|savar|gazipur/i.test(z.label));
  const findInsideZone  = () => zones.find((z) => /inside dhaka|dhaka city|dhaka metro|^dhaka$/i.test(z.label));

  // 2. Check Outside Dhaka BEFORE generic "dhaka"
  if (includesAny(text, OUTSIDE_DHAKA_TOKENS)) {
    const zone = findOutsideZone();
    if (zone) return { status: 'resolved', zone, method: 'bd_geo_outside_dhaka', normalizedRegion: 'outside_dhaka' };
  }

  // 3. Dhaka Suburbs -> Suburb zone if configured, otherwise Outside Dhaka
  if (includesAny(text, DHAKA_SUBURB_TOKENS)) {
    const zone = findSuburbZone() ?? findOutsideZone();
    if (zone) return { status: 'resolved', zone, method: 'bd_geo_dhaka_suburb', normalizedRegion: 'dhaka_suburb' };
  }

  // 4. Dhaka Metro Areas
  if (includesAny(text, DHAKA_CITY_TOKENS) || /\bdhaka\b|ঢাকা/.test(text)) {
    const zone = findInsideZone();
    if (zone) return { status: 'resolved', zone, method: 'bd_geo_dhaka_city', normalizedRegion: 'dhaka_city' };
  }

  return { status: 'ambiguous', method: 'none' };
}
