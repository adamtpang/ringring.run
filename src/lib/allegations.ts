/**
 * Conservative screen for reviews that allege discrimination or bias. Such reviews are dropped
 * from every peer-benchmark count, and no review text is ever stored in the benchmark.
 */
export const ALLEGATION_RE =
  /racis|discriminat|prejudic|bigot|homophob|transphob|sexis|xenophob|\b(race|ethnicity|skin colou?r)\b/i;
