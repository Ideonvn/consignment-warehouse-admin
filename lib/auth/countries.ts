/**
 * Dial codes for the country selector.
 *
 * Ported from the bidder app (`consignment-warehouse-web`, same path). There is
 * no shared package, deliberately — see "Phone entry" in CLAUDE.md — so a fix
 * to either copy must be carried across to the other.
 *
 * A curated list, not a complete one — see `lib/auth/phone.ts` for why, and for
 * the escape hatch that keeps an unlisted country signable-in: a pasted or typed
 * `+…` number is always accepted whole, whether or not its code is here.
 *
 * Africa is covered in full because that is where the warehouse sells; the rest
 * is the markets a South African consignment buyer plausibly bids from.
 */
export type Country = {
  /** ISO 3166-1 alpha-2, used as the option key. */
  iso: string;
  name: string;
  /** Dial code without the plus. */
  dial: string;
  /**
   * How the national part is grouped for display, where I am confident of the
   * local convention. Everything else falls back to threes — see the note in
   * `lib/auth/phone.ts`.
   */
  groups?: number[];
};

export const COUNTRIES: Country[] = [
  { iso: "ZA", name: "South Africa", dial: "27", groups: [2, 3, 4] },
  { iso: "AO", name: "Angola", dial: "244" },
  { iso: "BW", name: "Botswana", dial: "267" },
  { iso: "CD", name: "Congo (DRC)", dial: "243" },
  { iso: "CG", name: "Congo (Republic)", dial: "242" },
  { iso: "CI", name: "Côte d'Ivoire", dial: "225" },
  { iso: "CM", name: "Cameroon", dial: "237" },
  { iso: "DZ", name: "Algeria", dial: "213" },
  { iso: "EG", name: "Egypt", dial: "20" },
  { iso: "ET", name: "Ethiopia", dial: "251" },
  { iso: "GH", name: "Ghana", dial: "233" },
  { iso: "KE", name: "Kenya", dial: "254" },
  { iso: "LS", name: "Lesotho", dial: "266" },
  { iso: "LY", name: "Libya", dial: "218" },
  { iso: "MA", name: "Morocco", dial: "212" },
  { iso: "MG", name: "Madagascar", dial: "261" },
  { iso: "MU", name: "Mauritius", dial: "230" },
  { iso: "MW", name: "Malawi", dial: "265" },
  { iso: "MZ", name: "Mozambique", dial: "258" },
  { iso: "NA", name: "Namibia", dial: "264" },
  { iso: "NG", name: "Nigeria", dial: "234" },
  { iso: "RW", name: "Rwanda", dial: "250" },
  { iso: "SC", name: "Seychelles", dial: "248" },
  { iso: "SD", name: "Sudan", dial: "249" },
  { iso: "SN", name: "Senegal", dial: "221" },
  { iso: "SZ", name: "Eswatini", dial: "268" },
  { iso: "TN", name: "Tunisia", dial: "216" },
  { iso: "TZ", name: "Tanzania", dial: "255" },
  { iso: "UG", name: "Uganda", dial: "256" },
  { iso: "ZM", name: "Zambia", dial: "260" },
  { iso: "ZW", name: "Zimbabwe", dial: "263" },
  { iso: "AE", name: "United Arab Emirates", dial: "971" },
  { iso: "AR", name: "Argentina", dial: "54" },
  { iso: "AT", name: "Austria", dial: "43" },
  { iso: "AU", name: "Australia", dial: "61" },
  { iso: "BE", name: "Belgium", dial: "32" },
  { iso: "BR", name: "Brazil", dial: "55" },
  { iso: "CA", name: "Canada", dial: "1", groups: [3, 3, 4] },
  { iso: "CH", name: "Switzerland", dial: "41" },
  { iso: "CL", name: "Chile", dial: "56" },
  { iso: "CN", name: "China", dial: "86" },
  { iso: "CZ", name: "Czechia", dial: "420" },
  { iso: "DE", name: "Germany", dial: "49" },
  { iso: "DK", name: "Denmark", dial: "45" },
  { iso: "ES", name: "Spain", dial: "34" },
  { iso: "FI", name: "Finland", dial: "358" },
  { iso: "FR", name: "France", dial: "33" },
  { iso: "GR", name: "Greece", dial: "30" },
  { iso: "HK", name: "Hong Kong", dial: "852" },
  { iso: "HU", name: "Hungary", dial: "36" },
  { iso: "ID", name: "Indonesia", dial: "62" },
  { iso: "IE", name: "Ireland", dial: "353" },
  { iso: "IL", name: "Israel", dial: "972" },
  { iso: "IN", name: "India", dial: "91" },
  { iso: "IT", name: "Italy", dial: "39" },
  { iso: "JP", name: "Japan", dial: "81" },
  { iso: "KR", name: "South Korea", dial: "82" },
  { iso: "MY", name: "Malaysia", dial: "60" },
  { iso: "MX", name: "Mexico", dial: "52" },
  { iso: "NL", name: "Netherlands", dial: "31" },
  { iso: "NO", name: "Norway", dial: "47" },
  { iso: "NZ", name: "New Zealand", dial: "64" },
  { iso: "PH", name: "Philippines", dial: "63" },
  { iso: "PK", name: "Pakistan", dial: "92" },
  { iso: "PL", name: "Poland", dial: "48" },
  { iso: "PT", name: "Portugal", dial: "351" },
  { iso: "QA", name: "Qatar", dial: "974" },
  { iso: "RO", name: "Romania", dial: "40" },
  { iso: "RU", name: "Russia", dial: "7" },
  { iso: "SA", name: "Saudi Arabia", dial: "966" },
  { iso: "SE", name: "Sweden", dial: "46" },
  { iso: "SG", name: "Singapore", dial: "65" },
  { iso: "TH", name: "Thailand", dial: "66" },
  { iso: "TR", name: "Türkiye", dial: "90" },
  { iso: "UA", name: "Ukraine", dial: "380" },
  { iso: "GB", name: "United Kingdom", dial: "44", groups: [4, 6] },
  { iso: "US", name: "United States", dial: "1", groups: [3, 3, 4] },
  { iso: "VN", name: "Vietnam", dial: "84" },
];

export const DEFAULT_COUNTRY = COUNTRIES[0];

/**
 * Stands in for a dial code this list doesn't carry. Its empty `dial` is what
 * makes the escape hatch work: the digits already *are* the whole international
 * number, so composing E.164 must prepend nothing at all.
 */
export const UNLISTED_COUNTRY: Country = { iso: "", name: "Other", dial: "" };
