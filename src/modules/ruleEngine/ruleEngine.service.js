// RuleEngine service: load balancing, multi-sport conflict avoidance, and injury substitution logic

/**
 * Common injury-to-contraindicated muscle/movement keywords mapping
 */
const INJURY_BODY_PART_MAP = {
  knee: ['squat', 'lunge', 'sprint', 'jump', 'box jump', 'leg press'],
  knee_left: ['squat', 'lunge', 'sprint', 'jump', 'box jump', 'leg press'],
  knee_right: ['squat', 'lunge', 'sprint', 'jump', 'box jump', 'leg press'],
  shoulder: ['bench press', 'overhead press', 'dip', 'military press'],
  shoulder_left: ['bench press', 'overhead press', 'dip', 'military press'],
  shoulder_right: ['bench press', 'overhead press', 'dip', 'military press'],
  lower_back: ['deadlift', 'barbell squat', 'bent over row', 'heavy squat'],
  back: ['deadlift', 'barbell squat', 'bent over row'],
  ankle: ['sprint', 'plyometrics', 'shuttle runs', 'box jump'],
  hamstring: ['sprint', 'romanian deadlift', 'hamstring curl'],
};

/**
 * Validates and enforces injury substitutions on LLM generated plan days & exercises
 * @param {object} planJSON - Parsed plan object from LLM
 * @param {Array} userInjuries - User injuries array from database
 * @param {Array} [exerciseCatalog=[]] - Master exercises list from database
 * @returns {object} Updated plan object with safety flags enforced
 */
const validateAndSubstituteInjuries = (planJSON, userInjuries = [], exerciseCatalog = []) => {
  if (!planJSON || !Array.isArray(planJSON.days)) {
    return planJSON;
  }

  if (!userInjuries || userInjuries.length === 0) {
    return planJSON;
  }

  const activeInjuries = userInjuries.filter(inj => 
    inj.recovery_status !== 'fully_healed'
  );

  if (activeInjuries.length === 0) {
    return planJSON;
  }

  // Create lookup for catalog contraindications
  const catalogMap = new Map();
  exerciseCatalog.forEach(ex => {
    if (ex.name) {
      catalogMap.set(ex.name.toLowerCase(), ex);
    }
  });

  const updatedDays = planJSON.days.map(day => {
    if (!Array.isArray(day.exercises)) {
      return day;
    }

    const updatedExercises = day.exercises.map(exercise => {
      let isSubstituted = exercise.is_injury_substituted || false;
      let notes = exercise.notes || '';
      const exNameLower = (exercise.exercise_name || '').toLowerCase();

      // Check against catalog contraindications
      const matchedCatalogEx = catalogMap.get(exNameLower);
      if (matchedCatalogEx && Array.isArray(matchedCatalogEx.contraindicated_body_parts)) {
        for (const inj of activeInjuries) {
          const bodyPartLower = (inj.body_part || '').toLowerCase();
          if (matchedCatalogEx.contraindicated_body_parts.some(cb => cb.toLowerCase().includes(bodyPartLower))) {
            isSubstituted = true;
            if (!notes.includes('injury substituted')) {
              notes = `Modified/substituted to protect ${inj.body_part} (${inj.condition}). ${notes}`.trim();
            }
          }
        }
      }

      // Check against keyword mapping
      for (const inj of activeInjuries) {
        const bodyPartKey = (inj.body_part || '').toLowerCase();
        const prohibitedKeywords = INJURY_BODY_PART_MAP[bodyPartKey] || [];
        for (const keyword of prohibitedKeywords) {
          if (exNameLower.includes(keyword)) {
            isSubstituted = true;
            if (!notes.includes('injury substituted') && !notes.includes('protect')) {
              notes = `Substituted low-impact variation to protect ${inj.body_part}. ${notes}`.trim();
            }
          }
        }
      }

      return {
        ...exercise,
        is_injury_substituted: isSubstituted,
        notes,
      };
    });

    return {
      ...day,
      exercises: updatedExercises,
    };
  });

  return {
    ...planJSON,
    days: updatedDays,
  };
};

module.exports = {
  validateAndSubstituteInjuries,
};
