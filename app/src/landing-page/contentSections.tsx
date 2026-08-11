import daBoiAvatar from "../client/static/da-boi.webp";
import kivo from "../client/static/examples/kivo.webp";
import messync from "../client/static/examples/messync.webp";
import microinfluencerClub from "../client/static/examples/microinfluencers.webp";
import promptpanda from "../client/static/examples/promptpanda.webp";
import reviewradar from "../client/static/examples/reviewradar.webp";
import scribeist from "../client/static/examples/scribeist.webp";
import searchcraft from "../client/static/examples/searchcraft.webp";
import { BlogUrl, DocsUrl } from "../shared/common";
import type { GridFeature } from "./components/FeaturesGrid";

export const features: GridFeature[] = [
  {
    name: "Invoicing",
    description: "Create, clone, collect due payments, and track partials.",
    emoji: "🧾",
    href: DocsUrl,
    size: "large",
  },
  {
    name: "Estimates",
    description: "Send quotes and convert them to invoices in one click.",
    emoji: "📋",
    href: DocsUrl,
    size: "medium",
  },
  {
    name: "Customers",
    description: "Manage client profiles, tax IDs, and company details.",
    emoji: "🤝",
    href: DocsUrl,
    size: "small",
  },
  {
    name: "Products & taxes",
    description: "Catalog products/services with categories, units, and tax rates.",
    emoji: "📦",
    href: DocsUrl,
    size: "medium",
  },
  {
    name: "Expenses",
    description: "Track spend by category alongside income reports.",
    emoji: "💸",
    href: DocsUrl,
    size: "small",
  },
  {
    name: "Multi-tenant SaaS",
    description: "Each company is isolated with plan limits and billing history.",
    emoji: "🏢",
    href: DocsUrl,
    size: "large",
  },
  {
    name: "Support tickets",
    description: "Departments, priorities, comments, and ratings built in.",
    emoji: "🎫",
    href: DocsUrl,
    size: "small",
  },
  {
    name: "Dashboard analytics",
    description: "Revenue, due, paid, income vs expense, and top payments.",
    emoji: "📈",
    href: DocsUrl,
    size: "medium",
  },
  {
    name: "Mobile ready",
    description: "Pair with the Expo PaySuite mobile app for field billing.",
    emoji: "📱",
    href: DocsUrl,
    size: "small",
  },
];

export const testimonials = [
  {
    name: "Da Boi",
    role: "Wasp Mascot",
    avatarSrc: daBoiAvatar,
    socialUrl: "https://twitter.com/wasplang",
    quote: "I don't even know how to code. I'm just a plushie.",
  },
  {
    name: "Mr. Foobar",
    role: "Founder @ Cool Startup",
    avatarSrc: daBoiAvatar,
    socialUrl: "",
    quote: "This product makes me cooler than I already am.",
  },
  {
    name: "Jamie",
    role: "Happy Customer",
    avatarSrc: daBoiAvatar,
    socialUrl: "#",
    quote: "My cats love it!",
  },
];

export const faqs = [
  {
    id: 1,
    question: "Whats the meaning of life?",
    answer: "42.",
    href: "https://en.wikipedia.org/wiki/42_(number)",
  },
];

export const footerNavigation = {
  app: [
    { name: "Documentation", href: DocsUrl },
    { name: "Blog", href: BlogUrl },
  ],
  company: [
    { name: "About", href: "https://wasp.sh" },
    { name: "Privacy", href: "#" },
    { name: "Terms of Service", href: "#" },
  ],
};

export const examples = [
  {
    name: "Example #1",
    description: "Describe your example here.",
    imageSrc: kivo,
    href: "#",
  },
  {
    name: "Example #2",
    description: "Describe your example here.",
    imageSrc: messync,
    href: "#",
  },
  {
    name: "Example #3",
    description: "Describe your example here.",
    imageSrc: microinfluencerClub,
    href: "#",
  },
  {
    name: "Example #4",
    description: "Describe your example here.",
    imageSrc: promptpanda,
    href: "#",
  },
  {
    name: "Example #5",
    description: "Describe your example here.",
    imageSrc: reviewradar,
    href: "#",
  },
  {
    name: "Example #6",
    description: "Describe your example here.",
    imageSrc: scribeist,
    href: "#",
  },
  {
    name: "Example #7",
    description: "Describe your example here.",
    imageSrc: searchcraft,
    href: "#",
  },
];
