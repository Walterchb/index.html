/*
  Inline visual registry
  ----------------------
  Visual exhibits are kept as high-resolution source-derived crops. Complex tables,
  diagrams, photos and layouts stay in their original form so no row/column relation
  is altered during reflow. Two simple two-column exhibits are also reconstructed as
  semantic HTML tables in script.js and retain the exact source crop in the full view.
*/
window.VISUAL_REGISTRY = {
  6: {
    kind: "figure", insertAfter: 2,
    asset: "assets/visuals/p006-real-financial-assets.webp",
    sourcePage: 6,
    label: "Source visual",
    title: "Real and Financial Assets",
    caption: "Certificate illustration used on source page 6 to support the explanation of financial assets.",
    alt: "A stock certificate illustration accompanying the discussion of financial assets on PDF page 6."
  },
  7: {
    kind: "semantic-table", table: "debt-equity", insertAfter: 0,
    skipBlocks: [1,2,3,4,5,6,7,8],
    asset: "assets/visuals/p007-exhibit-1-debt-equity.webp",
    sourcePage: 7,
    label: "Exhibit 1",
    title: "Debt and Equity Securities",
    caption: "Faithfully reconstructed as a semantic two-column table. The original layout remains available in the enlarged source view.",
    alt: "Exhibit 1 compares debt securities and equity securities in two columns."
  },
  8: {
    kind: "figure", insertAfter: 1,
    asset: "assets/visuals/p008-exhibit-2-financial-services-industry.webp",
    sourcePage: 8,
    label: "Exhibit 2",
    title: "The Financial Services Industry",
    caption: "Original diagram showing savers and spenders connected through direct finance, financial markets and financial intermediaries.",
    alt: "Diagram showing savers as providers of capital, spenders as users of capital, direct finance through financial markets, and indirect finance through financial intermediaries."
  },
  16: {
    kind: "semantic-table", table: "competitive-liquid", insertAfter: 5,
    skipBlocks: [6,7,8,9,10,11],
    asset: "assets/visuals/p016-exhibit-1-competitive-liquid-markets.webp",
    sourcePage: 16,
    label: "Exhibit 1",
    title: "Competitive and Liquid Markets",
    caption: "Faithfully reconstructed as a semantic two-column table. The original source layout is available in the enlarged view.",
    alt: "Exhibit 1 compares benefits of competitive markets with benefits of liquid markets and low transaction costs."
  },
  21: {
    kind: "figure", insertAfter: 4,
    asset: "assets/visuals/p021-exhibit-1-investor-services.webp",
    sourcePage: 21,
    label: "Exhibit 1",
    title: "Services Available to Investors",
    caption: "Original diagram connecting savers, institutional investors and individual investors with financial planning, investment management, investment information, trading and custodial services.",
    alt: "Diagram of services available to investors: financial planning, investment management, investment information, trading and custodial services."
  },
  23: {
    kind: "figure", insertAfter: 4,
    asset: "assets/visuals/p023-exhibit-2-investor-goals.webp",
    sourcePage: 23,
    label: "Exhibit 2",
    title: "Investors’ Goals and Needs",
    caption: "Original exhibit with participant photographs and profiles for Zhang Li, Mike Smith and Anna Huber.",
    alt: "Exhibit with participant photographs and goals for Zhang Li, Mike Smith and Anna Huber."
  },
  24: {
    kind: "figure", insertAfter: 2,
    asset: "assets/visuals/p024-industry-participant-profiles.webp",
    sourcePage: 24,
    label: "Source visual",
    title: "Industry participant profiles",
    caption: "Original participant profiles and photographs for Peter Robinson, Amina Al-Subari and James Armistead.",
    alt: "Photographs and profiles for Peter Robinson, Amina Al-Subari and James Armistead on source page 24."
  },
  29: {
    kind: "figure", insertAfter: 2,
    skipBlocks: [3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19],
    asset: "assets/visuals/p029-exhibit-1-categories-participants.webp",
    sourcePage: 29,
    label: "Exhibit 1",
    title: "Categories and Participants with Key Characteristics",
    caption: "Original three-column table retained as a high-resolution visual to preserve the source relationships among categories, participants and key characteristics.",
    alt: "Three-column table titled Categories and Participants with Key Characteristics."
  },
  33: {
    kind: "figure", insertAfter: 8,
    asset: "assets/visuals/p033-exhibit-1-sell-buy-side.webp",
    sourcePage: 33,
    label: "Exhibit 1",
    title: "Sell Side and Buy Side",
    caption: "Original diagram contrasting sell-side investment banks, brokers and dealers with buy-side pension funds, endowment funds, foundations and sovereign wealth funds.",
    alt: "Diagram comparing sell-side and buy-side participants."
  },
  35: {
    kind: "figure", insertAfter: 2,
    asset: "assets/visuals/p035-exhibit-2-front-middle-back-office.webp",
    sourcePage: 35,
    label: "Exhibit 2",
    title: "Front, Middle, and Back Office",
    caption: "Original workflow diagram of clients, orders, executions and the front, middle and back office functions.",
    alt: "Workflow diagram showing clients, front office, middle office and back office."
  },
  40: {
    kind: "figure", insertAfter: 6,
    skipBlocks: [7,8,9,10,11,12,13,14,15,16,17,18,19],
    asset: "assets/visuals/p040-exhibit-1-leadership-titles.webp",
    sourcePage: 40,
    label: "Exhibit 1",
    title: "Leadership Title and Its Responsibilities",
    caption: "Original table retained as a visual to preserve titles and responsibilities exactly as laid out in the packet.",
    alt: "Table of leadership titles and responsibilities, including CEO, CFO, COO, CIO, Head Trader and Chief Accountant."
  },
  41: {
    kind: "figure", insertBefore: 0,
    skipBlocks: [0,1,2,3,4,5,6],
    asset: "assets/visuals/p041-exhibit-1-leadership-titles-continuation.webp",
    sourcePage: 41,
    label: "Exhibit 1 (continued)",
    title: "Leadership Title and Its Responsibilities",
    caption: "Continuation of the source table for Treasurer, Chief Risk Officer, Chief Compliance Officer, Chief Audit Executive and General Counsel.",
    alt: "Continuation of the table of leadership titles and responsibilities."
  },
  46: {
    kind: "figure", insertBefore: 0,
    skipBlocks: [0,1,2,3,4,5,6,7],
    asset: "assets/visuals/p046-exhibit-1-circumstances.webp",
    sourcePage: 46,
    label: "Exhibit 1",
    title: "Circumstances",
    caption: "Original two-column table retained to preserve the sequence of circumstances and descriptions for Penn Square Bank.",
    alt: "Table titled Circumstances with descriptions of aggressive growth, filing for bankruptcy, cascading effect and disregarding the risks."
  },
  59: {
    kind: "figure", insertBefore: 0,
    asset: "assets/visuals/p059-exhibit-1-data-research-inputs.webp",
    sourcePage: 59,
    label: "Exhibit 1",
    title: "Investment Data Research Inputs",
    caption: "Original funnel diagram combining industry data, firm data and macro-economic data into investment data and research inputs.",
    alt: "Funnel diagram with industry data, firm data and macro-economic data as inputs."
  },
  63: {
    kind: "figure", insertAfter: 9,
    asset: "assets/visuals/p063-exhibit-1-life-trade.webp",
    sourcePage: 63,
    label: "Exhibit 1",
    title: "The Life of a Trade",
    caption: "Original process diagram from transaction through clearing and settlement to custody services.",
    alt: "Diagram showing the life of a trade from transaction to clearing and settlement to custody services."
  },
  68: {
    kind: "figure", insertAfter: 0,
    asset: "assets/visuals/p068-exhibit-2-clearinghouse.webp",
    sourcePage: 68,
    label: "Exhibit 2",
    title: "Clearinghouse",
    caption: "Original diagram of a clearing house between buyers’ and sellers’ brokers, with settlement and clearing flows.",
    alt: "Diagram showing a clearing house between buyers' broker and sellers' broker."
  },
  90: {
    kind: "figure", insertBefore: 0,
    skipBlocks: [0,1,2,3,4,5,6,7],
    asset: "assets/visuals/p090-exhibit-1-defi-problems-part1.webp",
    sourcePage: 90,
    label: "Exhibit 1 · Part 1",
    title: "Problems in Traditional Finance Addressed by DeFi",
    caption: "Original three-column table; part 1 covers centralized control and limited access.",
    alt: "Part one of a three-column table comparing traditional finance and DeFi for centralized control and limited access."
  },
  91: {
    kind: "figure", insertBefore: 0,
    skipBlocks: [0,1,2,3,4,5,6,7],
    asset: "assets/visuals/p091-exhibit-1-defi-problems-part2.webp",
    sourcePage: 91,
    label: "Exhibit 1 · Part 2",
    title: "Problems in Traditional Finance Addressed by DeFi",
    caption: "Original table continuation; part 2 covers inefficiency, lack of interoperability and opacity.",
    alt: "Part two of a three-column table comparing traditional finance and DeFi."
  },
  98: {
    kind: "figure", insertAfter: 5,
    asset: "assets/visuals/p098-exhibit-1-trust-laws-regulations.webp",
    sourcePage: 98,
    label: "Exhibit 1",
    title: "The Need for Trust, Laws, and Regulations",
    caption: "Original circular diagram placing trust in the investment industry at the center of company rules, laws and regulations, professional standards and ethical principles.",
    alt: "Circular diagram showing trust in the industry surrounded by company rules, laws and regulations, professional standards and ethical principles."
  },
  120: {
    kind: "figure", insertAfter: 4,
    asset: "assets/visuals/p120-exhibit-1-ethics-rules-standards.webp",
    sourcePage: 120,
    label: "Exhibit 1",
    title: "Ethics, Rules, and Standards",
    caption: "Original braided diagram linking ethics, rules and professional standards.",
    alt: "Braided diagram linking ethics, rules and professional standards."
  },
  146: {
    kind: "figure", insertAfter: 2,
    asset: "assets/visuals/p146-exhibit-1-decision-framework.webp",
    sourcePage: 146,
    label: "Exhibit 1",
    title: "Phases of the CFA Institute Decision-Making Framework",
    caption: "Original circular framework showing the phases identify, consider, act and reflect.",
    alt: "Circular CFA Institute decision-making framework with the phases identify, consider, act and reflect."
  }
};
