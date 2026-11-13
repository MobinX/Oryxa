import 'dart:math';

/// Generates a 5-character alphanumeric variant short ID (3 uppercase letters, 2 digits, randomly shuffled).
/// Matches the web implementation in `@repo/utils/makeVariantId`.
String makeVariantId() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  final rand = Random();
  final chars = <String>[];
  for (int i = 0; i < 3; i++) {
    chars.add(letters[rand.nextInt(letters.length)]);
  }
  for (int i = 0; i < 2; i++) {
    chars.add(numbers[rand.nextInt(numbers.length)]);
  }

  // Fisher-Yates shuffle
  for (int i = chars.length - 1; i > 0; i--) {
    final j = rand.nextInt(i + 1);
    final tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }
  return chars.join('');
}

/// Converts text into a clean URL-friendly slug.
/// Matches the web implementation in `@repo/utils/slugify`.
String slugify(String text) {
  return text
      .toLowerCase()
      .trim()
      .replaceAll(RegExp(r'[^\w\s-]'), '')
      .replaceAll(RegExp(r'\s+'), '-')
      .replaceAll(RegExp(r'-+'), '-');
}

/// Supported currencies
const List<String> kSupportedCurrencies = [
  'BDT',
  'USD',
  'EUR',
  'GBP',
  'INR',
  'AED',
  'SAR',
  'MYR',
  'PKR',
  'LKR',
  'NPR',
];

/// Payment strategy options matching web
class PaymentStrategyOption {
  final String value;
  final String label;
  final String description;

  const PaymentStrategyOption({
    required this.value,
    required this.label,
    required this.description,
  });
}

const List<PaymentStrategyOption> kPaymentStrategyOptions = [
  PaymentStrategyOption(
    value: 'cod',
    label: 'Cash on Delivery (COD)',
    description: 'Customers pay in cash when the delivery arrives at their door.',
  ),
  PaymentStrategyOption(
    value: 'delivery_prepaid',
    label: 'Delivery Charge Prepaid',
    description: 'Customers pay delivery charges up front, then product cost on delivery.',
  ),
  PaymentStrategyOption(
    value: 'full_prepaid',
    label: 'Full Payment Prepaid',
    description: 'Customers pay the full total online before the order is packed and dispatched.',
  ),
];

String paymentStrategyLabel(String? strategy) {
  switch (strategy) {
    case 'delivery_prepaid':
      return 'Delivery Charge Prepaid';
    case 'full_prepaid':
      return 'Full Payment Prepaid';
    case 'cod':
    default:
      return 'Cash on Delivery (COD)';
  }
}

String paymentStrategyDescription(String? strategy) {
  switch (strategy) {
    case 'delivery_prepaid':
      return 'Customers pay delivery charges up front, then product cost on delivery.';
    case 'full_prepaid':
      return 'Customers pay the full total online before the order is packed and dispatched.';
    case 'cod':
    default:
      return 'Customers pay in cash when the delivery arrives at their door.';
  }
}
