import { CONTACT_EMAIL } from "@/lib/site";

/** A list item with an optional bold lead-in ("Requirements: …"). */
export type LegalItem = { lead?: string; text: string };

export type LegalBlock =
  | { type: "p"; text: string; lead?: string }
  | { type: "list"; items: LegalItem[] };

export type LegalSubsection = { title: string; blocks: LegalBlock[] };

export type LegalSection = {
  id: string;
  title: string;
  blocks?: LegalBlock[];
  subsections?: LegalSubsection[];
};

export type LegalDoc = {
  title: string;
  meta: string[];
  intro: LegalBlock[];
  sections: LegalSection[];
};

export const TERMS: LegalDoc = {
  title: "Terms of Service",
  meta: [],
  intro: [],
  sections: [
    {
      id: "acceptance",
      title: "Acceptance of Terms",
      blocks: [
        {
          type: "p",
          text: "By downloading, installing, or accessing Lokala via our mobile apps or website, you agree to be bound by these Terms of Service. If you do not agree to these terms, you may not use the app. These terms govern all users within our Northeastern US operational territory.",
        },
      ],
    },
    {
      id: "eligibility",
      title: "Account Eligibility & Verification",
      blocks: [
        {
          type: "list",
          items: [
            {
              lead: "Requirements",
              text: "You must create an account to view discounts and purchase gift certificates. You agree to provide an accurate, authentic email address.",
            },
            {
              lead: "Security Responsibilities",
              text: "Lokala relies on automated email validation to confirm account authenticity. You are entirely responsible for maintaining the privacy of your login session. Lokala is not liable for unauthorized app interactions stemming from a compromised email inbox.",
            },
          ],
        },
      ],
    },
    {
      id: "location",
      title: "Location-Based Services & App Behavior",
      blocks: [
        {
          type: "p",
          text: "Our services rely directly on proximity metrics to reveal real-time local discounts. While you can opt out of providing your geographic position, you acknowledge that doing so severely limits the app's core automated value.",
        },
      ],
    },
    {
      id: "gift-certificates",
      title: "The Multi-Establishment Gift Certificate Ecosystem",
      blocks: [
        {
          type: "p",
          text: "Lokala coordinates a shared gift certificate framework across independent small businesses. By purchasing or using a Lokala gift certificate, you acknowledge the following structure:",
        },
        {
          type: "list",
          items: [
            {
              lead: "Universal Redemption",
              text: "A Lokala gift certificate holds a cash value that can be split or fully redeemed across multiple, distinct participating local merchants listed within our system.",
            },
            {
              lead: "Merchant Responsibility",
              text: "Lokala acts as the technological network manager. The individual participating merchant—not Lokala—is solely responsible for providing the actual goods, services, or dining experiences you purchase. If a local business closes or changes ownership, Lokala will work to redirect your certificate balance to other active merchants in the ecosystem, but holds no direct liability for merchant defaults.",
            },
            {
              lead: "No Cash Back",
              text: "Unless explicitly required by state law throughout the Northeastern US, Lokala gift certificates are non-refundable and cannot be exchanged for physical currency.",
            },
          ],
        },
      ],
    },
    {
      id: "data",
      title: "Data Commercialization Consent",
      blocks: [
        {
          type: "p",
          text: "By using Lokala to browse local storefront promotions, you grant Lokala permission to analyze your user preference habits and market trends. This includes the monetization of aggregated choice metrics sold to regional commercial entities, subject to your right to opt-out via the app settings.",
        },
      ],
    },
    {
      id: "liability",
      title: "Limitation of Liability & Account Termination",
      blocks: [
        {
          type: "list",
          items: [
            {
              lead: "Disclaimers",
              text: "Lokala provides discount listings “as available.” Local merchants change their operational discounts frequently; we do not guarantee that a discount displayed in the app will always be honored if a business fails to update its store layout parameters.",
            },
            {
              lead: "Termination Right",
              text: "We reserve the right to suspend or ban accounts that attempt to manipulate authentication codes, spoof location tracking data, or forge gift certificate redemption tokens.",
            },
          ],
        },
      ],
    },
  ],
};

export const PRIVACY: LegalDoc = {
  title: "Privacy Policy",
  meta: ["Effective Date: January 2024", "Last Updated: October 2026"],
  intro: [
    {
      type: "p",
      text: "Lokala LLC (“Lokala,” “we,” “us,” or “our”) operates the mylokala.com website and the Lokala mobile application available on the Apple App Store (collectively, the “Services”). This Privacy Policy explains how we collect, use, disclose, and safeguard information when you use our Services.",
    },
    {
      type: "p",
      text: "This Privacy Policy is linked within the Lokala app and provided to Apple in App Store Connect, as required by Apple's App Store Review Guidelines.",
    },
    {
      type: "p",
      text: "By using the Services, you agree to the collection and use of information in accordance with this Privacy Policy. If you do not agree, please do not use the Services.",
    },
  ],
  sections: [
    {
      id: "information-we-collect",
      title: "Information We Collect",
      subsections: [
        {
          title: "1.1 Information You Provide to Us",
          blocks: [
            {
              type: "list",
              items: [
                {
                  lead: "Account Information",
                  text: "Name, email address, and password when you create a Lokala account. Account creation is required to access the app, since all app features are tied to your individual account.",
                },
                {
                  lead: "Payment Information",
                  text: "When you purchase a gift certificate on mylokala.com, payment details are collected and processed by our third-party payment processor, Stripe. Lokala does not store full payment card or bank account numbers on its own servers.",
                },
                {
                  lead: "Gift Certificate Details",
                  text: "Sender, recipient, amount, and any personal message included with a gift certificate purchased on the website.",
                },
                {
                  lead: "Merchant Information",
                  text: "Business name, address, tax identification information, bank account details (via Stripe), and QR code registration information, provided by businesses during sign-up.",
                },
                {
                  lead: "Communications",
                  text: "Information you provide when you contact us for support, feedback, or inquiries.",
                },
              ],
            },
          ],
        },
        {
          title: "1.2 Information Collected Automatically",
          blocks: [
            {
              type: "list",
              items: [
                {
                  lead: "Usage Data",
                  text: "How you interact with the app, including discounts viewed, features used, and transaction activity.",
                },
                {
                  lead: "Device Information",
                  text: "Device type, operating system, and unique device identifiers.",
                },
                {
                  lead: "Transaction Data",
                  text: "Purchase amounts, tip amounts, and gift certificate balance/redemption activity.",
                },
              ],
            },
          ],
        },
        {
          title: "1.3 Information from Third Parties",
          blocks: [
            {
              type: "list",
              items: [
                {
                  lead: "Stripe",
                  text: "Shares limited transaction and account status information with us necessary to operate gift certificate balances and Merchant payouts.",
                },
                {
                  lead: "Merchants",
                  text: "Participating businesses may share redemption confirmations with us.",
                },
              ],
            },
          ],
        },
        {
          title: "1.4 Analytics",
          blocks: [
            {
              type: "p",
              text: "We use Supabase Analytics to collect usage data about how users interact with the app (such as screens viewed, features used, and general app performance). This data helps us understand usage patterns and improve the Services.",
            },
          ],
        },
        {
          title: "1.5 Apple App Privacy Details",
          blocks: [
            {
              type: "p",
              text: "As required by Apple, we disclose the categories of data Lokala collects and how they are used on the app's product page on the App Store (“App Privacy” details), consistent with the categories described in this Privacy Policy.",
            },
          ],
        },
      ],
    },
    {
      id: "how-we-use",
      title: "How We Use Your Information",
      blocks: [
        {
          type: "list",
          items: [
            { text: "Create and manage Lokala accounts." },
            { text: "Display available discounts and gift certificate balances within the app." },
            { text: "Process gift certificate purchases made via mylokala.com and reflect balances in the app." },
            { text: "Facilitate in-app redemption of gift certificate balances at participating Merchants via QR code." },
            { text: "Calculate and collect applicable processing fees." },
            { text: "Provide customer support and respond to inquiries." },
            { text: "Detect, investigate, and prevent fraud, unauthorized transactions, and misuse of the Services." },
            { text: "Improve and personalize the Services." },
            { text: "Communicate with you about your account or transactions." },
            { text: "Comply with legal, tax, and regulatory obligations." },
          ],
        },
      ],
    },
    {
      id: "how-we-share",
      title: "How We Share Your Information",
      blocks: [
        {
          type: "p",
          text: "We do not sell your personal information. We may share information with:",
        },
        {
          type: "list",
          items: [
            { text: "Stripe and other payment providers to process purchases and payouts." },
            { text: "Participating Merchants, limited to information necessary to confirm a transaction." },
            { text: "Service providers under confidentiality obligations." },
            { text: "Mid-Maine Chamber of Commerce and Colby College, in aggregate or de-identified form only." },
            { text: "Legal and regulatory authorities where required by law." },
            { text: "In connection with a business transaction such as a merger or sale." },
          ],
        },
      ],
    },
    {
      id: "retention",
      title: "Data Retention",
      blocks: [
        {
          type: "p",
          text: "We retain personal and transaction information for as long as necessary to provide the Services, maintain accurate gift certificate balance records, comply with legal and tax obligations, and resolve disputes.",
        },
      ],
    },
    {
      id: "security",
      title: "Data Security",
      blocks: [
        {
          type: "p",
          text: "We use reasonable administrative, technical, and physical safeguards to protect your information, and we rely on Stripe's PCI-compliant infrastructure for payment data. No method of transmission or storage is completely secure, and we cannot guarantee absolute security.",
        },
      ],
    },
    {
      id: "account-deletion",
      title: "Account Deletion",
      blocks: [
        {
          type: "p",
          text: "You may permanently delete your Lokala account and associated personal data in two ways:",
        },
        {
          type: "list",
          items: [
            {
              lead: "In the app",
              text: "Go to your account settings within the Lokala app and select “Delete Account.”",
            },
            {
              lead: "By email",
              text: `Send a request from the email address associated with your Lokala account to ${CONTACT_EMAIL} with the subject line “Delete My Account.” We will process your request within 30 days.`,
            },
          ],
        },
        {
          type: "p",
          text: "Certain transaction records may be retained after deletion where required for legal, tax, or fraud-prevention purposes.",
        },
      ],
    },
    {
      id: "age-eligibility",
      title: "Age Eligibility and Children's Privacy",
      blocks: [
        {
          type: "p",
          text: "The Services are intended for use by individuals who are at least 18 years old. We do not knowingly collect personal information from children under 13. If we learn that we have inadvertently collected personal information from a child under 13, we will delete it promptly.",
        },
      ],
    },
    {
      id: "your-choices",
      title: "Your Choices and Rights",
      blocks: [
        {
          type: "list",
          items: [
            {
              lead: "Access and Correction",
              text: "Review and update your account information within the app or by contacting us.",
            },
            {
              lead: "Marketing Communications",
              text: "Opt out of promotional emails via the unsubscribe link.",
            },
            {
              lead: "Deletion",
              text: `Delete your account in the app's account settings, or request deletion by emailing ${CONTACT_EMAIL}.`,
            },
            {
              lead: "State Privacy Rights",
              text: "Depending on your state of residence, you may have additional rights regarding your personal information.",
            },
          ],
        },
      ],
    },
    {
      id: "third-parties",
      title: "Third-Party Links and Services",
      blocks: [
        {
          type: "p",
          text: "Our Services may link to third-party websites or services, including Merchant websites and Stripe. We are not responsible for the privacy practices of third parties.",
        },
      ],
    },
    {
      id: "changes",
      title: "Changes to This Privacy Policy",
      blocks: [
        {
          type: "p",
          text: "We may update this Privacy Policy from time to time. We will post the revised policy with an updated “Last Updated” date within the app and on our website.",
        },
      ],
    },
  ],
};
