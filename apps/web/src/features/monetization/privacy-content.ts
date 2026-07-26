/**
 * Privacy policy content — in-app page + store checklist source.
 * Receipt images: parsed and discarded by default (SPEC / parse-receipt).
 */

export type PrivacySection = {
  readonly id: string;
  readonly title: string;
  readonly paragraphs: readonly string[];
};

export const PRIVACY_LAST_UPDATED = '2026-07-26';

export const PRIVACY_SECTIONS: readonly PrivacySection[] = [
  {
    id: 'overview',
    title: 'Overview',
    paragraphs: [
      'The Good Pantry (“we”, “the app”) helps you track pantry inventory, recipes, and grocery lists. This policy explains what we collect, how we use it, and the choices you have. We design for a free tier that is a real pantry app — not a trial locked behind a wall.',
    ],
  },
  {
    id: 'receipts',
    title: 'Receipt images',
    paragraphs: [
      'When you photograph a receipt, the image is sent to our secure edge function so a vision model can extract line items. By default, images are parsed and discarded — we do not retain receipt photos after processing unless you explicitly opt in to retention.',
      'Even when images are not stored, the processing itself is a use of image data. We disclose that in App Store privacy labels under Photos / Camera as processed for app functionality.',
      'Parsed line items (product names, quantities, prices) may be kept as part of your pantry ledger so the inventory stays accurate. You can export or delete that data at any time from Settings.',
    ],
  },
  {
    id: 'pantry',
    title: 'Pantry data, recipes, and lists',
    paragraphs: [
      'Pantry quantities, locations, recipes, grocery lists, and cook history live on your device (offline-first on native) and, when you sign in, sync to your household in our hosted database (Supabase).',
      'Household sharing (paid) lets members of the same household see and edit shared inventory. Roles and invites are controlled by the household owner.',
    ],
  },
  {
    id: 'auth',
    title: 'Account and authentication',
    paragraphs: [
      'If you create an account, we store your email and authentication identifiers via Supabase Auth. Passwords are handled by the auth provider — we never log or email them.',
      'You can delete your account from Settings. Deletion removes your auth user and associated cloud membership; local device data may remain until you clear app storage or uninstall.',
    ],
  },
  {
    id: 'ads',
    title: 'Ads and tracking',
    paragraphs: [
      'Free-tier installs may show in-feed advertisements (never during cooking mode, and never as a sticky banner above the tab bar). On mobile we use Google AdMob; on web we may use Google AdSense when configured.',
      'In the EEA/UK and other regulated regions we use Google’s User Messaging Platform (UMP) to collect consent before personalized ads. Without consent we request non-personalized ads only.',
      'On iOS we request App Tracking Transparency (ATT) permission at a sensible moment — when an ad surface is about to appear — not on cold start. You can change tracking permission in iOS Settings.',
      'Subscribers (Good Pantry Pro) do not see ads.',
    ],
  },
  {
    id: 'chef',
    title: 'AI chef',
    paragraphs: [
      'The AI chef is a paid feature. When you use it, your message, a snapshot of pantry items you choose to include, and dietary preferences are sent to our edge function and then to a third-party model provider (OpenRouter) to generate a reply.',
      'We apply server-side safety gates (allergens and dietary flags). We do not use your chef chats to train our own models. Provider retention is governed by their policies and our data-processing terms.',
    ],
  },
  {
    id: 'export-delete',
    title: 'Export and deletion',
    paragraphs: [
      'You can export pantry, recipes, and history as JSON from Settings → Export my data.',
      'You can delete your account from Settings → Delete account. This is a real deletion request, not a mailto link.',
    ],
  },
  {
    id: 'contact',
    title: 'Contact',
    paragraphs: [
      'Questions about privacy: support@thegoodpantry.app (replace with your production support address before store submission).',
    ],
  },
];

/**
 * App Store privacy nutrition-label answers (document for the owner).
 * Not legal advice — product disclosure aligned with implemented behavior.
 */
export const APP_STORE_PRIVACY_LABELS = {
  dataLinkedToUser: [
    {
      category: 'Contact Info — Email Address',
      purpose: 'Account authentication',
      notes: 'Only if the user creates an account.',
    },
    {
      category: 'Identifiers — User ID',
      purpose: 'App functionality, analytics (auth)',
      notes: 'Supabase user id; household membership.',
    },
    {
      category: 'Purchases — Purchase History',
      purpose: 'App functionality',
      notes: 'Via RevenueCat / store; entitlement status only on our servers.',
    },
  ],
  dataNotLinkedToUser: [
    {
      category: 'Usage Data — Product Interaction',
      purpose: 'Analytics (optional / future)',
      notes: 'Prefer not to collect unless a product analytics stack is added.',
    },
  ],
  dataUsedToTrack: [
    {
      category: 'Device ID / Advertising Data',
      purpose: 'Third-party advertising',
      notes:
        'AdMob may use advertising identifiers when ATT is authorized and UMP consent allows personalized ads. Free tier only.',
    },
  ],
  /** Special disclosure: receipt image processing without retention. */
  receiptImages: {
    processed: true,
    retainedByDefault: false,
    purposes: ['App functionality — receipt line-item extraction'],
    nutritionLabelHint:
      'Photos (camera) — processed for app functionality; not stored by default after parse.',
  },
} as const;
