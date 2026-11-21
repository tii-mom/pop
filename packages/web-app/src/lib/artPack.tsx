const base = '/assets/fruit-edition';
const fruitNames = ['青苹果', '黄香蕉', '橙子'];
const fruits = ['apple', 'banana', 'orange'];
const colors = ['#B8FF24', '#FFCA06', '#FF7600'];
export function fruitImage(tier: number, claimed: number, maximum: number, active = true) {
  const state = !active ? 'whole' : maximum > 0 && claimed >= maximum ? 'finished' : claimed > 0 ? 'shared' : 'first';
  const step = state === 'shared' ? Math.floor(((claimed - 1) / Math.max(1, maximum - 1)) * 8) : 0;
  const suffix = step > 0 ? `-${step}` : '';
  return `${base}/fruit/${fruits[tier] ?? fruits[0]}-${state}${suffix}.png`;
}
const tiers = fruits.map((_, tier) => ({
  name: fruitNames[tier], shortLabel: fruitNames[tier], color: colors[tier],
  src: fruitImage(tier, 0, 1, false), openSrc: fruitImage(tier, 0, 1),
  borderClass: 'border-white/15', confettiColors: [colors[tier], '#FFCA06', '#FFFFFF'],
}));
export type TierArtMeta = typeof tiers[number];
export function getTierVisualMeta(id: number) { return tiers[id] ?? tiers[0]; }
export const useTierVisualMeta = getTierVisualMeta;
const pack = {
  logoSrc: base + '/brand/pop.png', posterLogoSrc: base + '/brand/pop.png',
  tokenIconSrc: base + '/ui/pop.svg', seasonBannerSrc: base + '/editorial/season.png',
};
export function useArtPack() { return { pack }; }
