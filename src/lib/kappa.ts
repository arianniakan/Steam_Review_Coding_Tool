// Cohen's kappa for two binary raters (human vs AI) over a set of
// (review, code) presence/absence judgments — the standard way to extend
// kappa to multi-label qualitative coding: each code is its own binary
// rating task, and judgments are pooled across all codes and reviews.

export interface KappaPair {
  humanPresent: boolean;
  aiPresent: boolean;
}

export interface KappaResult {
  kappa: number | null; // null when undefined (e.g. no variance to explain)
  observedAgreement: number;
  expectedAgreement: number;
  totalPairs: number;
  bothPresent: number;
  humanOnly: number;
  aiOnly: number;
  neitherPresent: number;
}

export function cohensKappa(pairs: KappaPair[]): KappaResult {
  const totalPairs = pairs.length;
  let bothPresent = 0;
  let humanOnly = 0;
  let aiOnly = 0;
  let neitherPresent = 0;

  for (const p of pairs) {
    if (p.humanPresent && p.aiPresent) bothPresent++;
    else if (p.humanPresent && !p.aiPresent) humanOnly++;
    else if (!p.humanPresent && p.aiPresent) aiOnly++;
    else neitherPresent++;
  }

  if (totalPairs === 0) {
    return {
      kappa: null,
      observedAgreement: 0,
      expectedAgreement: 0,
      totalPairs: 0,
      bothPresent,
      humanOnly,
      aiOnly,
      neitherPresent,
    };
  }

  const observedAgreement = (bothPresent + neitherPresent) / totalPairs;
  const pHumanYes = (bothPresent + humanOnly) / totalPairs;
  const pAiYes = (bothPresent + aiOnly) / totalPairs;
  const expectedAgreement = pHumanYes * pAiYes + (1 - pHumanYes) * (1 - pAiYes);
  // If expectedAgreement is 1, both raters were fully deterministic and in
  // total agreement — kappa's denominator is 0 and the statistic is undefined.
  const kappa =
    expectedAgreement === 1 ? null : (observedAgreement - expectedAgreement) / (1 - expectedAgreement);

  return {
    kappa,
    observedAgreement,
    expectedAgreement,
    totalPairs,
    bothPresent,
    humanOnly,
    aiOnly,
    neitherPresent,
  };
}

export function interpretKappa(kappa: number): string {
  // Landis & Koch (1977) benchmark scale — the conventional reference.
  if (kappa < 0) return "poor (worse than chance)";
  if (kappa < 0.2) return "slight";
  if (kappa < 0.4) return "fair";
  if (kappa < 0.6) return "moderate";
  if (kappa < 0.8) return "substantial";
  return "almost perfect";
}
