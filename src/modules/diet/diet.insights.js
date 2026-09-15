/**
 * Diet Insights - Pure helper functions for generating rule-based insights and hydration tips.
 */

/**
 * Returns an insight string based on session intensity.
 * @param {'high'|'medium'|'low'|'none'} intensity
 * @returns {string}
 */
function getInsightLine(intensity) {
  const insights = {
    high: 'Higher carbs today — heavy training session',
    medium: 'Balanced macros today — moderate training load',
    low: 'Lighter day — recovery focus',
    none: 'Rest day — maintenance targets'
  };

  return insights[intensity] || insights.none;
}

/**
 * Returns hydration targets and recommendations based on session intensity.
 * @param {'high'|'medium'|'low'|'none'} intensity
 * @returns {{ target_liters: number, label: string, tip: string }}
 */
function getHydrationTip(intensity) {
  const targets = {
    high: 3.5,
    medium: 2.75,
    low: 2.2,
    none: 2.0
  };

  const target_liters = targets[intensity] !== undefined ? targets[intensity] : targets.none;
  const tip = intensity === 'high'
    ? 'Sip regularly, not all at once. Include coconut water post-session.'
    : 'Sip regularly through the day rather than all at once.';
  const label = `${intensity === 'high' ? 'High-intensity' : 'Today'} — aim for ${target_liters}L`;

  return {
    target_liters,
    label,
    tip
  };
}

module.exports = {
  getInsightLine,
  getHydrationTip
};
