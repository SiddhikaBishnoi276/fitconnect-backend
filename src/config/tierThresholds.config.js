// Gamification RP thresholds & tier definitions (Bronze/Silver/Gold/Elite)

const TIER_ORDER = ['bronze', 'silver', 'gold', 'elite'];

const TIER_THRESHOLDS = {
  bronze: 0,
  silver: 500,
  gold: 1500,
  elite: 3000,
};

/**
 * Calculates the appropriate tier for a given RP point total
 * @param {number} rpPoints 
 * @returns {string} 'bronze' | 'silver' | 'gold' | 'elite'
 */
const getTierForRp = (rpPoints) => {
  const points = Math.max(0, Number(rpPoints) || 0);
  if (points >= TIER_THRESHOLDS.elite) return 'elite';
  if (points >= TIER_THRESHOLDS.gold) return 'gold';
  if (points >= TIER_THRESHOLDS.silver) return 'silver';
  return 'bronze';
};

/**
 * Checks if newTier is strictly higher than previousTier based on TIER_ORDER
 * @param {string} previousTier 
 * @param {string} newTier 
 * @returns {boolean}
 */
const isTierPromotion = (previousTier, newTier) => {
  const prevIndex = TIER_ORDER.indexOf(String(previousTier || 'bronze').toLowerCase());
  const newIndex = TIER_ORDER.indexOf(String(newTier || 'bronze').toLowerCase());
  return newIndex > prevIndex;
};

module.exports = {
  TIER_ORDER,
  TIER_THRESHOLDS,
  getTierForRp,
  isTierPromotion,
};
