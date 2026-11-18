import { CandidateQuestionInput } from "./types";

/**
 * Deterministic solver-verified sample candidates across all 10 visual domains
 * (`graphs`, `circuits`, `fields`, `mechanics`, `waves`, `optics-shm`,
 * `thermal`, `grav-astro`, `em-induction`, `quantum-nuclear`) plus
 * `pure-calculation`, covering IB (SL/HL), UK A-Level (Y12/Y13), and NCUK IFY.
 */
export function buildSampleCandidates(): CandidateQuestionInput[] {
  return [
    // 1. GRAPHS — MCQ
    {
      id: "sp-graphs-mcq-001",
      conceptId: "kinematics-motion-graphs",
      templateArchetype: "signed-vt-total-distance",
      seed: 100101,
      syllabi: [
        { syllabus: "ib", level: "SL", topicId: "A.1", subtopicId: "A.1.2" },
        { syllabus: "alevel", level: "Y12", topicId: "3.4.1", subtopicId: "3.4.1.2" },
        { syllabus: "ncuk", level: "IFY", topicId: "NCUK-M1", subtopicId: "kinematics" },
      ],
      format: "mcq",
      difficulty: "standard",
      domain: "graphs",
      scenarioSpec: {
        kind: "rover-distance",
        durationS: 8,
        points: [
          { x: 0, y: 0 },
          { x: 2, y: 6 },
          { x: 4, y: 6 },
          { x: 6, y: -2 },
          { x: 8, y: -2 },
        ],
      },
      hiddenQuantities: ["distanceM", "displacementM"],
      targetQuantityKey: "distanceM",
      stem: "An inspection rover travels along a straight rail. The velocity–time graph shows its motion over an 8 s interval. What total distance does the rover travel during the 8 s?",
      options: [
        {
          label: "A",
          text: "18.0 m",
          isCorrect: false,
          distractorRationale:
            "Computes net signed displacement by subtracting the area below the time axis instead of adding unsigned areas.",
        },
        {
          label: "B",
          text: "22.5 m",
          isCorrect: false,
          distractorRationale:
            "Integrates only up to the zero-velocity crossing at t = 5.5 s and ignores motion in the reverse direction.",
        },
        {
          label: "C",
          text: "27.0 m",
          isCorrect: true,
        },
        {
          label: "D",
          text: "48.0 m",
          isCorrect: false,
          distractorRationale:
            "Multiplies peak velocity (6 m s⁻¹) by total duration (8 s) as if speed were constant.",
        },
      ],
      workedSolution:
        "Total distance is the sum of unsigned areas between the v–t graph and the time axis. Velocity crosses zero at t = 5.5 s. Positive area (0 to 5.5 s) = ½(2)(6) + (2)(6) + ½(1.5)(6) = 22.5 m. Negative area magnitude (5.5 to 8 s) = ½(0.5)(2) + (2)(2) = 4.5 m. Total distance = 22.5 + 4.5 = 27.0 m.",
      markScheme: [
        {
          code: "A1",
          criterion:
            "Sums positive (22.5 m) and unsigned negative (4.5 m) areas to obtain 27.0 m (C).",
          marks: 1,
        },
      ],
      totalMarks: 1,
    },

    // 2. GRAPHS — Structured
    {
      id: "sp-graphs-struct-002",
      conceptId: "kinematics-motion-graphs",
      templateArchetype: "trapezoid-shuttle-journey",
      seed: 100102,
      syllabi: [
        { syllabus: "ib", level: "SL", topicId: "A.1", subtopicId: "A.1.2" },
        { syllabus: "alevel", level: "Y12", topicId: "3.4.1", subtopicId: "3.4.1.2" },
        { syllabus: "ncuk", level: "IFY", topicId: "NCUK-M1", subtopicId: "kinematics" },
      ],
      format: "structured",
      difficulty: "foundation",
      domain: "graphs",
      scenarioSpec: {
        kind: "shuttle-motion",
        durationS: 10,
        brakingStartS: 7,
        points: [
          { x: 0, y: 0 },
          { x: 3, y: 9 },
          { x: 7, y: 9 },
          { x: 10, y: 0 },
        ],
      },
      hiddenQuantities: ["distanceM", "meanSpeedMs", "brakingAccelerationMs2"],
      stem: "An automated airport shuttle travels between two concourses along a straight track. The graph shows how its velocity varies with time over the 10 s journey, with braking beginning at t = 7 s.",
      parts: [
        {
          partId: "a",
          prompt: "Calculate the total distance travelled by the shuttle.",
          marks: 2,
          targetQuantityKey: "distanceM",
          expectedAnswer: "63.0 m",
          workingSteps: [
            "Distance equals the area under the velocity–time trapezium.",
            "s = ½ × (10 + 4) × 9 = 63.0 m.",
          ],
        },
        {
          partId: "b",
          prompt: "Determine the mean speed of the shuttle over the 10 s journey.",
          marks: 2,
          dependsOnPartIds: ["a"],
          targetQuantityKey: "meanSpeedMs",
          expectedAnswer: "6.30 m s⁻¹",
          workingSteps: [
            "Mean speed = total distance / total time.",
            "v_mean = 63.0 / 10 = 6.30 m s⁻¹.",
          ],
        },
        {
          partId: "c",
          prompt: "Calculate the acceleration of the shuttle between t = 7 s and t = 10 s.",
          marks: 1,
          targetQuantityKey: "brakingAccelerationMs2",
          expectedAnswer: "-3.00 m s⁻²",
          workingSteps: [
            "a = Δv / Δt = (0 - 9) / (10 - 7) = -3.00 m s⁻².",
          ],
        },
      ],
      workedSolution:
        "(a) Area under trapezium = ½(10 + 4)(9) = 63.0 m. (b) Mean speed = 63.0 / 10 = 6.30 m s⁻¹. (c) Gradient during braking = (0 − 9) / (10 − 7) = −3.00 m s⁻².",
      markScheme: [
        {
          code: "M1",
          partId: "a",
          criterion: "Identifies total distance as area under the v–t graph.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "a",
          criterion: "Obtains 63.0 m.",
          marks: 1,
        },
        {
          code: "M1",
          partId: "b",
          criterion: "Divides total distance from (a) by 10 s.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "b",
          criterion: "Obtains 6.30 m s⁻¹.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "c",
          criterion: "Obtains -3.00 m s⁻² (including negative sign).",
          marks: 1,
        },
      ],
      totalMarks: 5,
    },

    // 3. CIRCUITS — MCQ
    {
      id: "sp-circuits-mcq-003",
      conceptId: "dc-series-parallel-networks",
      templateArchetype: "parallel-branch-resistor-power",
      seed: 100201,
      syllabi: [
        { syllabus: "ib", level: "SL", topicId: "B.5", subtopicId: "B.5.2" },
        { syllabus: "alevel", level: "Y12", topicId: "3.5.1", subtopicId: "3.5.1.4" },
        { syllabus: "ncuk", level: "IFY", topicId: "NCUK-E1", subtopicId: "dc-circuits" },
      ],
      format: "mcq",
      difficulty: "standard",
      domain: "circuits",
      scenarioSpec: {
        kind: "branch-heater",
        voltageV: 21,
        seriesOhm: 3,
        branchOhm: [12, 6],
      },
      hiddenQuantities: [
        "parallelOhm",
        "totalOhm",
        "totalCurrentA",
        "branchVoltageV",
        "branchOnePowerW",
        "branchTwoPowerW",
      ],
      targetQuantityKey: "branchTwoPowerW",
      stem: "An ideal 21 V DC supply is connected to a 3 Ω resistor in series with a parallel combination of a 12 Ω resistor and a 6 Ω resistor, as shown. What is the power dissipated in the 6 Ω resistor?",
      options: [
        {
          label: "A",
          text: "12.0 W",
          isCorrect: false,
          distractorRationale:
            "Calculates the power dissipated in the 12 Ω branch instead of the 6 Ω branch.",
        },
        {
          label: "B",
          text: "24.0 W",
          isCorrect: true,
        },
        {
          label: "C",
          text: "54.0 W",
          isCorrect: false,
          distractorRationale:
            "Uses total supply current I = 3.0 A directly in P = I²R without splitting current at the parallel junction.",
        },
        {
          label: "D",
          text: "73.5 W",
          isCorrect: false,
          distractorRationale:
            "Applies the full 21 V supply across the 6 Ω resistor, ignoring the potential drop across the 3 Ω series resistor.",
        },
      ],
      workedSolution:
        "Parallel resistance R_p = (12 × 6)/(12 + 6) = 4.00 Ω. Total resistance R_tot = 3 + 4 = 7.00 Ω. Supply current I = 21 / 7 = 3.00 A. Potential difference across parallel branches V_p = 3.00 × 4.00 = 12.0 V. Power in 6 Ω resistor P = V_p² / 6 = 144 / 6 = 24.0 W.",
      markScheme: [
        {
          code: "A1",
          criterion:
            "Finds V_parallel = 12.0 V and calculates P = 12.0² / 6 = 24.0 W (B).",
          marks: 1,
        },
      ],
      totalMarks: 1,
    },

    // 4. CIRCUITS — Structured
    {
      id: "sp-circuits-struct-004",
      conceptId: "emf-internal-resistance-and-dividers",
      templateArchetype: "non-ideal-cell-series-parallel-load",
      seed: 100202,
      syllabi: [
        { syllabus: "ib", level: "SL", topicId: "B.5", subtopicId: "B.5.3" },
        { syllabus: "alevel", level: "Y12", topicId: "3.5.1", subtopicId: "3.5.1.5" },
        { syllabus: "ncuk", level: "IFY", topicId: "NCUK-E1", subtopicId: "dc-circuits" },
      ],
      format: "structured",
      difficulty: "higher",
      domain: "circuits",
      scenarioSpec: {
        kind: "dc-series-parallel",
        emfV: 18,
        internalOhm: 1,
        seriesOhm: 4,
        parallelBranchOhms: [12, 6],
        durationS: 10,
      },
      hiddenQuantities: [
        "parallelOhm",
        "externalOhm",
        "totalOhm",
        "totalCurrentA",
        "terminalVoltageV",
        "externalEnergyJ",
      ],
      stem: "A battery of emf 18 V and internal resistance 1 Ω is connected to a 4 Ω resistor in series with a parallel arrangement of 12 Ω and 6 Ω resistors. The circuit operates steadily for 10 s.",
      parts: [
        {
          partId: "a",
          prompt: "Show that the total external load resistance is 8.00 Ω and calculate the current drawn from the battery.",
          marks: 2,
          targetQuantityKey: "totalCurrentA",
          expectedAnswer: "2.00 A",
          workingSteps: [
            "R_parallel = (12 × 6)/(12 + 6) = 4.00 Ω; R_ext = 4 + 4 = 8.00 Ω.",
            "I = ε / (R_ext + r) = 18 / (8 + 1) = 2.00 A.",
          ],
        },
        {
          partId: "b",
          prompt: "Calculate the terminal potential difference across the battery.",
          marks: 2,
          dependsOnPartIds: ["a"],
          targetQuantityKey: "terminalVoltageV",
          expectedAnswer: "16.0 V",
          workingSteps: [
            "V_terminal = ε − I r = 18 − (2.00)(1) = 16.0 V.",
          ],
        },
        {
          partId: "c",
          prompt: "Determine the total electrical energy transferred to the external circuit during the 10 s interval.",
          marks: 2,
          dependsOnPartIds: ["a", "b"],
          targetQuantityKey: "externalEnergyJ",
          expectedAnswer: "320 J",
          workingSteps: [
            "E_ext = V_terminal × I × t = 16.0 × 2.00 × 10 = 320 J.",
          ],
        },
      ],
      workedSolution:
        "(a) R_p = 4.00 Ω, so R_ext = 4 + 4 = 8.00 Ω. Total circuit resistance = 8 + 1 = 9.00 Ω, giving I = 18 / 9 = 2.00 A. (b) Terminal voltage V = ε − Ir = 18 − 2.00(1) = 16.0 V. (c) External energy E = VIt = 16.0 × 2.00 × 10 = 320 J.",
      markScheme: [
        {
          code: "M1",
          partId: "a",
          criterion: "Combines parallel resistors (4.00 Ω) with 4 Ω series and 1 Ω internal resistance.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "a",
          criterion: "Obtains I = 2.00 A.",
          marks: 1,
        },
        {
          code: "M1",
          partId: "b",
          criterion: "Applies V = ε − Ir or V = I R_ext.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "b",
          criterion: "Obtains 16.0 V.",
          marks: 1,
        },
        {
          code: "M1",
          partId: "c",
          criterion: "Uses E = VIt with terminal voltage (excluding internal dissipation).",
          marks: 1,
        },
        {
          code: "A1",
          partId: "c",
          criterion: "Obtains 320 J.",
          marks: 1,
        },
      ],
      totalMarks: 6,
    },

    // 5. FIELDS — MCQ
    {
      id: "sp-fields-mcq-005",
      conceptId: "coulomb-superposition-and-null-points",
      templateArchetype: "collinear-opposite-charges-field",
      seed: 100301,
      syllabi: [
        { syllabus: "ib", level: "SL", topicId: "D.2", subtopicId: "D.2.1" },
        { syllabus: "alevel", level: "Y13", topicId: "3.7.3", subtopicId: "3.7.3.1" },
        { syllabus: "ncuk", level: "IFY", topicId: "NCUK-E2", subtopicId: "electric-fields" },
      ],
      format: "mcq",
      difficulty: "standard",
      domain: "fields",
      scenarioSpec: {
        kind: "charge-field",
        chargesNC: [3, -6],
        separationM: 0.6,
        probeM: 0.2,
      },
      hiddenQuantities: ["fieldNC"],
      targetQuantityKey: "fieldNC",
      stem: "Two point charges of +3 nC and −6 nC are fixed 0.6 m apart in vacuum. Point P lies on the line joining the charges, 0.2 m to the right of the +3 nC charge. Take k = 8.99 × 10⁹ N m² C⁻². What is the resultant electric field at P?",
      options: [
        {
          label: "A",
          text: "337 N C⁻¹ to the right",
          isCorrect: false,
          distractorRationale:
            "Subtracts the two field magnitudes instead of recognizing both point toward the right at P.",
        },
        {
          label: "B",
          text: "1.01 × 10³ N C⁻¹ to the right",
          isCorrect: true,
        },
        {
          label: "C",
          text: "1.01 × 10³ N C⁻¹ to the left",
          isCorrect: false,
          distractorRationale:
            "Computes the correct superposition magnitude but reverses the electric field direction.",
        },
        {
          label: "D",
          text: "337 N C⁻¹ to the left",
          isCorrect: false,
          distractorRationale:
            "Subtracts the field magnitudes and assigns the reversed resultant direction.",
        },
      ],
      workedSolution:
        "At point P, the +3 nC charge repels a positive test charge to the right: E₁ = k(3 × 10⁻⁹)/(0.2)² = 674.25 N C⁻¹. The −6 nC charge (at distance 0.4 m to the right) attracts a positive test charge to the right: E₂ = k(6 × 10⁻⁹)/(0.4)² = 337.125 N C⁻¹. Resultant field E = 674.25 + 337.125 = 1.01 × 10³ N C⁻¹ to the right.",
      markScheme: [
        {
          code: "A1",
          criterion:
            "Adds collinear field contributions toward the −6 nC charge to obtain 1.01 × 10³ N C⁻¹ to the right (B).",
          marks: 1,
        },
      ],
      totalMarks: 1,
    },

    // 6. FIELDS — Structured
    {
      id: "sp-fields-struct-006",
      conceptId: "electric-potential-and-equipotential-work",
      templateArchetype: "like-charges-null-field-potential",
      seed: 100302,
      syllabi: [
        { syllabus: "ib", level: "HL", topicId: "D.2", subtopicId: "D.2.3" },
        { syllabus: "alevel", level: "Y13", topicId: "3.7.3", subtopicId: "3.7.3.2" },
        { syllabus: "ncuk", level: "IFY", topicId: "NCUK-E2", subtopicId: "electric-potential" },
      ],
      format: "structured",
      difficulty: "higher",
      domain: "fields",
      scenarioSpec: {
        kind: "null-potential",
        chargesNC: [4, 9],
        separationM: 0.5,
      },
      hiddenQuantities: ["nullPositionM", "potentialV", "fieldNC"],
      stem: "Two fixed positive point charges of +4 nC and +9 nC are separated by 0.5 m in vacuum, with the +4 nC charge on the left. Take k = 8.99 × 10⁹ N m² C⁻² and electric potential to be zero at infinity.",
      parts: [
        {
          partId: "a",
          prompt: "Calculate the distance from the +4 nC charge to the point on the line between the charges where the resultant electric field is zero.",
          marks: 2,
          targetQuantityKey: "nullPositionM",
          expectedAnswer: "0.200 m",
          workingSteps: [
            "Equate field magnitudes: 4 / x² = 9 / (0.5 − x)².",
            "(0.5 − x) / x = 3 / 2 => 1.0 − 2x = 3x => x = 0.200 m.",
          ],
        },
        {
          partId: "b",
          prompt: "Calculate the electric potential at this zero-field point.",
          marks: 2,
          dependsOnPartIds: ["a"],
          targetQuantityKey: "potentialV",
          expectedAnswer: "450 V",
          workingSteps: [
            "V = k(q₁ / x + q₂ / (d − x)) = 8.99 × 10⁹ × (4 × 10⁻⁹ / 0.200 + 9 × 10⁻⁹ / 0.300).",
            "V = 8.99 × (20 + 30) = 449.5 V ≈ 450 V.",
          ],
        },
      ],
      workedSolution:
        "(a) Setting kq₁/x² = kq₂/(0.5 − x)² gives (0.5 − x)/x = √(9/4) = 1.5, so x = 0.200 m. (b) Scalar potentials add: V = 8.99 × 10⁹ × (4 × 10⁻⁹ / 0.200 + 9 × 10⁻⁹ / 0.300) = 450 V.",
      markScheme: [
        {
          code: "M1",
          partId: "a",
          criterion: "Equates inverse-square electric field magnitudes from the two charges.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "a",
          criterion: "Obtains x = 0.200 m.",
          marks: 1,
        },
        {
          code: "M1",
          partId: "b",
          criterion: "Sums scalar potentials kq₁/x + kq₂/(d − x).",
          marks: 1,
        },
        {
          code: "A1",
          partId: "b",
          criterion: "Obtains 450 V (accept 449.5 V).",
          marks: 1,
        },
      ],
      totalMarks: 4,
    },

    // 7. MECHANICS — MCQ
    {
      id: "sp-mechanics-mcq-007",
      conceptId: "collisions-and-momentum-conservation",
      templateArchetype: "inelastic-cart-kinetic-energy-loss",
      seed: 100401,
      syllabi: [
        { syllabus: "ib", level: "SL", topicId: "A.2", subtopicId: "A.2.4" },
        { syllabus: "alevel", level: "Y12", topicId: "3.4.1", subtopicId: "3.4.1.6" },
        { syllabus: "ncuk", level: "IFY", topicId: "NCUK-M2", subtopicId: "collisions" },
      ],
      format: "mcq",
      difficulty: "standard",
      domain: "mechanics",
      scenarioSpec: {
        kind: "collision-loss",
        massXKg: 0.8,
        massYKg: 1.2,
        initialXMs: 5,
        finalYMs: 2,
      },
      hiddenQuantities: [
        "finalXMs",
        "initialEnergyJ",
        "finalEnergyJ",
        "lostEnergyJ",
      ],
      targetQuantityKey: "lostEnergyJ",
      stem: "On a horizontal frictionless air track, cart X of mass 0.8 kg moves at 5 m s⁻¹ to the right and collides with a stationary cart Y of mass 1.2 kg. Immediately after the collision, cart Y moves at 2 m s⁻¹ to the right. How much kinetic energy is lost in the collision?",
      options: [
        {
          label: "A",
          text: "2.40 J",
          isCorrect: false,
          distractorRationale:
            "Computes only the final kinetic energy of cart Y instead of the kinetic energy lost.",
        },
        {
          label: "B",
          text: "4.00 J",
          isCorrect: false,
          distractorRationale:
            "Computes the total final kinetic energy of both carts rather than subtracting it from initial kinetic energy.",
        },
        {
          label: "C",
          text: "6.00 J",
          isCorrect: true,
        },
        {
          label: "D",
          text: "7.60 J",
          isCorrect: false,
          distractorRationale:
            "Assumes cart X comes to rest after impact without checking conservation of momentum.",
        },
      ],
      workedSolution:
        "By conservation of momentum: 0.8(5) = 0.8 v_X + 1.2(2), so 4.0 = 0.8 v_X + 2.4 => v_X = 2.00 m s⁻¹. Initial kinetic energy K_i = ½(0.8)(5²) = 10.0 J. Final kinetic energy K_f = ½(0.8)(2.00²) + ½(1.2)(2²) = 1.60 + 2.40 = 4.00 J. Kinetic energy lost = 10.0 − 4.00 = 6.00 J.",
      markScheme: [
        {
          code: "A1",
          criterion:
            "Finds v_X = 2.00 m s⁻¹ from momentum conservation and ΔK_lost = 10.0 − 4.00 = 6.00 J (C).",
          marks: 1,
        },
      ],
      totalMarks: 1,
    },

    // 8. MECHANICS — Structured
    {
      id: "sp-mechanics-struct-008",
      conceptId: "projectile-motion-2d",
      templateArchetype: "level-ground-projectile-flight-range",
      seed: 100402,
      syllabi: [
        { syllabus: "ib", level: "SL", topicId: "A.1", subtopicId: "A.1.3" },
        { syllabus: "alevel", level: "Y12", topicId: "3.4.1", subtopicId: "3.4.1.4" },
        { syllabus: "ncuk", level: "IFY", topicId: "NCUK-M1", subtopicId: "projectiles" },
      ],
      format: "structured",
      difficulty: "standard",
      domain: "mechanics",
      scenarioSpec: {
        kind: "projectile-kinematics",
        launchSpeedMs: 20,
        launchAngleDegrees: 30,
        gravityMs2: 9.8,
      },
      hiddenQuantities: [
        "flightTimeS",
        "maxHeightM",
        "horizontalRangeM",
        "horizontalSpeedMs",
        "initialVerticalSpeedMs",
      ],
      stem: "A ball is launched from level ground with an initial speed of 20 m s⁻¹ at an angle of 30° above the horizontal. Air resistance is negligible; take g = 9.8 m s⁻².",
      parts: [
        {
          partId: "a",
          prompt: "Calculate the total time of flight before the ball returns to level ground.",
          marks: 2,
          targetQuantityKey: "flightTimeS",
          expectedAnswer: "2.04 s",
          workingSteps: [
            "u_y = 20 sin 30° = 10.0 m s⁻¹.",
            "T = 2 u_y / g = 20.0 / 9.8 = 2.04 s.",
          ],
        },
        {
          partId: "b",
          prompt: "Calculate the maximum vertical height reached above the ground.",
          marks: 2,
          targetQuantityKey: "maxHeightM",
          expectedAnswer: "5.10 m",
          workingSteps: [
            "h_max = u_y² / (2g) = 10.0² / (2 × 9.8) = 5.10 m.",
          ],
        },
        {
          partId: "c",
          prompt: "Determine the horizontal range of the ball.",
          marks: 2,
          dependsOnPartIds: ["a"],
          targetQuantityKey: "horizontalRangeM",
          expectedAnswer: "35.3 m",
          workingSteps: [
            "u_x = 20 cos 30° = 17.32 m s⁻¹.",
            "R = u_x T = 17.32 × 2.0408 = 35.3 m.",
          ],
        },
      ],
      workedSolution:
        "(a) Vertical launch component u_y = 20 sin 30° = 10.0 m s⁻¹; time of flight T = 2(10.0)/9.8 = 2.04 s. (b) Maximum height h = u_y²/(2g) = 100/19.6 = 5.10 m. (c) Horizontal range R = (20 cos 30°)(2.0408) = 35.3 m.",
      markScheme: [
        {
          code: "M1",
          partId: "a",
          criterion: "Resolves vertical velocity component u sin 30° = 10.0 m s⁻¹ and uses T = 2u_y/g.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "a",
          criterion: "Obtains T = 2.04 s.",
          marks: 1,
        },
        {
          code: "M1",
          partId: "b",
          criterion: "Uses v_y² = u_y² − 2gh with v_y = 0 at apex.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "b",
          criterion: "Obtains h = 5.10 m.",
          marks: 1,
        },
        {
          code: "M1",
          partId: "c",
          criterion: "Multiplies horizontal speed (20 cos 30°) by time of flight.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "c",
          criterion: "Obtains R = 35.3 m.",
          marks: 1,
        },
      ],
      totalMarks: 6,
    },

    // 9. PURE-CALCULATION — MCQ (Figureless)
    {
      id: "sp-pure-mcq-009",
      conceptId: "uncertainties-suvat-and-efficiency",
      templateArchetype: "motor-wasted-thermal-energy",
      seed: 100501,
      syllabi: [
        { syllabus: "ib", level: "SL", topicId: "A.3", subtopicId: "A.3.3" },
        { syllabus: "alevel", level: "Y12", topicId: "3.4.1", subtopicId: "3.4.1.8" },
        { syllabus: "ncuk", level: "IFY", topicId: "NCUK-M3", subtopicId: "power-efficiency" },
      ],
      format: "mcq",
      difficulty: "foundation",
      domain: "pure-calculation",
      scenarioSpec: {
        kind: "power-efficiency",
        inputPowerW: 800,
        usefulPowerW: 600,
        durationS: 20,
      },
      hiddenQuantities: [
        "efficiency",
        "efficiencyPercent",
        "usefulEnergyJ",
        "totalInputEnergyJ",
        "wastedEnergyJ",
      ],
      targetQuantityKey: "wastedEnergyJ",
      stem: "An electric winch motor draws 800 W of electrical input power and delivers 600 W of useful mechanical output power continuously for 20 s. How much energy is wasted to the surroundings in this 20 s interval?",
      options: [
        {
          label: "A",
          text: "200 J",
          isCorrect: false,
          distractorRationale:
            "Calculates wasted power in watts (800 − 600 = 200 W) without multiplying by the 20 s time interval.",
        },
        {
          label: "B",
          text: "4.00 × 10³ J",
          isCorrect: true,
        },
        {
          label: "C",
          text: "1.20 × 10⁴ J",
          isCorrect: false,
          distractorRationale:
            "Computes the useful mechanical energy output (600 × 20) instead of wasted energy.",
        },
        {
          label: "D",
          text: "1.60 × 10⁴ J",
          isCorrect: false,
          distractorRationale:
            "Computes the total electrical energy input (800 × 20) instead of wasted energy.",
        },
      ],
      workedSolution:
        "Wasted power = P_in − P_useful = 800 − 600 = 200 W. Over 20 s, wasted energy E_wasted = 200 × 20 = 4.00 × 10³ J (4000 J).",
      markScheme: [
        {
          code: "A1",
          criterion:
            "Subtracts useful power from input power and multiplies by 20 s to obtain 4.00 × 10³ J (B).",
          marks: 1,
        },
      ],
      totalMarks: 1,
    },

    // 10. WAVES — MCQ
    {
      id: "sp-waves-mcq-010",
      conceptId: "standing-waves-harmonics",
      templateArchetype: "fixed-string-third-harmonic-frequency",
      seed: 100601,
      syllabi: [
        {
          syllabus: "ib",
          level: "SL",
          topicId: "ib-theme-c",
          subtopicId: "ib-c4-standing-waves-resonance",
        },
        {
          syllabus: "alevel",
          level: "Y12",
          topicId: "alevel-sec3-waves",
          subtopicId: "alevel-3-3-1-progressive-stationary-waves",
        },
        {
          syllabus: "ncuk",
          level: "IFY-S2",
          topicId: "ncuk-ac6",
          subtopicId: "ncuk-ac6-5",
        },
      ],
      format: "mcq",
      difficulty: "standard",
      domain: "waves",
      scenarioSpec: {
        kind: "standing-wave",
        boundaryKind: "string-fixed-both",
        lengthM: 1.2,
        harmonicNumber: 3,
        waveSpeedMs: 96,
      },
      hiddenQuantities: [
        "wavelengthM",
        "fundamentalFrequencyHz",
        "harmonicFrequencyHz",
        "frequencyHz",
        "periodS",
        "adjacentNodeSpacingM",
        "nodeToAntinodeSpacingM",
      ],
      targetQuantityKey: "harmonicFrequencyHz",
      stem: "A taut string of length 1.2 m fixed at both ends vibrates in its 3rd harmonic mode, as shown. Transverse waves travel along the string at 96 m s⁻¹. What is the frequency of this standing wave?",
      options: [
        {
          label: "A",
          text: "40.0 Hz",
          isCorrect: false,
          distractorRationale:
            "Calculates the fundamental (first-harmonic) frequency v / (2L) = 96 / 2.4 instead of the 3rd harmonic.",
        },
        {
          label: "B",
          text: "80.0 Hz",
          isCorrect: false,
          distractorRationale:
            "Divides wave speed by the full string length L = 1.2 m instead of the 3rd-harmonic wavelength λ = 0.80 m.",
        },
        {
          label: "C",
          text: "120 Hz",
          isCorrect: true,
        },
        {
          label: "D",
          text: "240 Hz",
          isCorrect: false,
          distractorRationale:
            "Omits the factor of 2 in λ₃ = 2L / 3 and computes f = 3v / L = 3(96) / 1.2.",
        },
      ],
      workedSolution:
        "For a string fixed at both ends in the n = 3 harmonic, λ₃ = 2L / 3 = 2(1.2) / 3 = 0.800 m. Therefore f₃ = v / λ₃ = 96 / 0.800 = 120 Hz.",
      markScheme: [
        {
          code: "A1",
          criterion:
            "Determines λ₃ = 0.800 m and computes f₃ = 96 / 0.800 = 120 Hz (C).",
          marks: 1,
        },
      ],
      totalMarks: 1,
    },

    // 11. OPTICS & SHM — Structured
    {
      id: "sp-optics-shm-struct-011",
      conceptId: "simple-harmonic-motion",
      templateArchetype: "horizontal-mass-spring-energy-speed",
      seed: 100701,
      syllabi: [
        {
          syllabus: "ib",
          level: "SL",
          topicId: "ib-theme-c",
          subtopicId: "ib-c1-shm",
        },
        {
          syllabus: "alevel",
          level: "Y13",
          topicId: "alevel-sec6-further-mechanics-thermal",
          subtopicId: "alevel-3-6-1-periodic-motion-shm",
        },
        {
          syllabus: "ncuk",
          level: "IFY-S2",
          topicId: "ncuk-ac6",
          subtopicId: "ncuk-ac6-1",
        },
      ],
      format: "structured",
      difficulty: "standard",
      domain: "optics-shm",
      scenarioSpec: {
        kind: "mass-spring-shm",
        orientation: "horizontal",
        massKg: 0.5,
        springConstantNm: 200,
        amplitudeM: 0.08,
        phaseConvention: "cosine",
        queryDisplacementM: 0.04,
        plotMode: "energy-displacement",
      },
      hiddenQuantities: [
        "angularFrequencyRadS",
        "periodS",
        "frequencyHz",
        "energyOscillationFrequencyHz",
        "energyOscillationPeriodS",
        "maxSpeedMs",
        "maxAccelerationMs2",
        "maxRestoringForceN",
        "totalEnergyJ",
        "equalEnergyDisplacementM",
        "speedAtQueryDisplacementMs",
        "positiveVelocityAtQueryDisplacementMs",
        "negativeVelocityAtQueryDisplacementMs",
        "accelerationAtQueryDisplacementMs2",
        "kineticEnergyAtQueryDisplacementJ",
        "potentialEnergyAtQueryDisplacementJ",
        "potentialEnergyAtQueryTimeJ",
        "accelerationAtQueryTimeMs2",
        "restoringForceAtQueryTimeN",
      ],
      stem: "A block of mass 0.5 kg attached to an ideal horizontal spring of spring constant 200 N m⁻¹ oscillates in simple harmonic motion on a frictionless surface with an amplitude of 0.08 m.",
      parts: [
        {
          partId: "a",
          prompt: "Calculate the period of oscillation of the block.",
          marks: 2,
          targetQuantityKey: "periodS",
          expectedAnswer: "0.314 s",
          workingSteps: [
            "ω = √(k / m) = √(200 / 0.5) = 20.0 rad s⁻¹.",
            "T = 2π / ω = 2π / 20.0 = 0.314 s.",
          ],
        },
        {
          partId: "b",
          prompt: "Calculate the total mechanical energy of the oscillating system.",
          marks: 2,
          targetQuantityKey: "totalEnergyJ",
          expectedAnswer: "0.640 J",
          workingSteps: [
            "E_total = ½ k x₀² = ½ × 200 × (0.08)² = 0.640 J.",
          ],
        },
        {
          partId: "c",
          prompt: "Determine the speed of the block when its displacement from equilibrium is 0.04 m.",
          marks: 2,
          dependsOnPartIds: ["a"],
          targetQuantityKey: "speedAtQueryDisplacementMs",
          expectedAnswer: "1.39 m s⁻¹",
          workingSteps: [
            "v = ω √(x₀² − x²) = 20.0 × √(0.08² − 0.04²).",
            "v = 20.0 × √0.0048 = 1.39 m s⁻¹.",
          ],
        },
      ],
      workedSolution:
        "(a) ω = √(200 / 0.5) = 20.0 rad s⁻¹, so T = 2π / 20.0 = 0.314 s. (b) Total energy E = ½ k A² = ½(200)(0.08)² = 0.640 J. (c) At x = 0.04 m, speed v = 20.0√(0.08² − 0.04²) = 1.39 m s⁻¹.",
      markScheme: [
        {
          code: "M1",
          partId: "a",
          criterion: "Uses T = 2π√(m / k) with m = 0.5 kg and k = 200 N m⁻¹.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "a",
          criterion: "Obtains T = 0.314 s.",
          marks: 1,
        },
        {
          code: "M1",
          partId: "b",
          criterion: "Substitutes k = 200 N m⁻¹ and A = 0.08 m into E = ½ k A².",
          marks: 1,
        },
        {
          code: "A1",
          partId: "b",
          criterion: "Obtains E = 0.640 J.",
          marks: 1,
        },
        {
          code: "M1",
          partId: "c",
          criterion: "Applies v = ω√(A² − x²) or ½mv² = E_total − ½kx² at x = 0.04 m.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "c",
          criterion: "Obtains v = 1.39 m s⁻¹.",
          marks: 1,
        },
      ],
      totalMarks: 6,
    },

    // 12. THERMAL — MCQ
    {
      id: "sp-thermal-mcq-012",
      conceptId: "ideal-gas-kinetic-theory",
      templateArchetype: "maxwell-boltzmann-rms-speed",
      seed: 100801,
      syllabi: [
        {
          syllabus: "ib",
          level: "SL",
          topicId: "ib-theme-b",
          subtopicId: "ib-b3-gas-laws",
        },
        {
          syllabus: "alevel",
          level: "Y13",
          topicId: "alevel-sec6-further-mechanics-thermal",
          subtopicId: "alevel-3-6-2-thermal-physics",
        },
        {
          syllabus: "ncuk",
          level: "IFY-S1",
          topicId: "ncuk-ac3",
          subtopicId: "ncuk-ac3-4",
        },
      ],
      format: "mcq",
      difficulty: "standard",
      domain: "thermal",
      scenarioSpec: {
        kind: "kinetic-theory",
        gasName: "Argon",
        temperatureK: 300,
        molarMassKgPerMol: 0.04,
        moles: 2,
        volumeM3: 0.05,
      },
      hiddenQuantities: [
        "rmsSpeedMs",
        "meanSpeedMs",
        "mostProbableSpeedMs",
        "pressurePa",
        "averageKineticEnergyJ",
        "averageKineticEnergyEv",
        "molarInternalEnergyJPerMol",
        "densityKgPerM3",
        "particleMassKg",
      ],
      targetQuantityKey: "rmsSpeedMs",
      stem: "A rigid vessel of volume 0.05 m³ contains 2 mol of monatomic argon gas of molar mass 0.04 kg mol⁻¹ in thermal equilibrium at 300 K. Take R = 8.31 J mol⁻¹ K⁻¹. What is the root-mean-square (rms) speed of the argon atoms?",
      options: [
        {
          label: "A",
          text: "250 m s⁻¹",
          isCorrect: false,
          distractorRationale:
            "Omits the factor of 3 in v_rms = √(3RT / M) and computes √(RT / M).",
        },
        {
          label: "B",
          text: "353 m s⁻¹",
          isCorrect: false,
          distractorRationale:
            "Uses a factor of 2 instead of 3, calculating the most probable speed √(2RT / M).",
        },
        {
          label: "C",
          text: "432 m s⁻¹",
          isCorrect: true,
        },
        {
          label: "D",
          text: "1.87 × 10⁵ m s⁻¹",
          isCorrect: false,
          distractorRationale:
            "Calculates mean-square speed 3RT / M without taking the square root.",
        },
      ],
      workedSolution:
        "Using v_rms = √(3RT / M) with R = 8.31 J mol⁻¹ K⁻¹, T = 300 K, and M = 0.04 kg mol⁻¹ gives v_rms = √(3 × 8.31 × 300 / 0.04) = √186975 = 432 m s⁻¹.",
      markScheme: [
        {
          code: "A1",
          criterion:
            "Substitutes T = 300 K and M = 0.04 kg mol⁻¹ into √(3RT / M) to obtain 432 m s⁻¹ (C).",
          marks: 1,
        },
      ],
      totalMarks: 1,
    },

    // 13. GRAVITATION & ASTROPHYSICS — Structured
    {
      id: "sp-grav-astro-struct-013",
      conceptId: "gravitational-potential-orbits",
      templateArchetype: "circular-satellite-orbit-speed-energy",
      seed: 100901,
      syllabi: [
        {
          syllabus: "ib",
          level: "HL",
          topicId: "ib-theme-d",
          subtopicId: "ib-d1-gravitational-fields",
        },
        {
          syllabus: "alevel",
          level: "Y13",
          topicId: "alevel-sec7-fields-consequences",
          subtopicId: "alevel-3-7-2-gravitational-fields",
        },
        {
          syllabus: "ncuk",
          level: "IFY-S2",
          topicId: "ncuk-ac5",
          subtopicId: "ncuk-ac5-1",
        },
      ],
      format: "structured",
      difficulty: "higher",
      domain: "grav-astro",
      scenarioSpec: {
        kind: "circular-orbit-energy",
        centralMassKg: 6.0e24,
        centralRadiusM: 6.4e6,
        satelliteMassKg: 500,
        orbitRadiusM: 8.0e6,
      },
      hiddenQuantities: [
        "altitudeM",
        "fieldStrengthNkg",
        "gravitationalForceN",
        "orbitalSpeedMs",
        "escapeSpeedMs",
        "angularSpeedRadS",
        "orbitalPeriodS",
        "gravitationalPotentialJkg",
        "kineticEnergyJ",
        "potentialEnergyJ",
        "totalEnergyJ",
        "bindingEnergyJ",
      ],
      stem: "A scientific satellite of mass 500 kg travels in a circular orbit of radius 8.0 × 10⁶ m around a spherical planet of mass 6.0 × 10²⁴ kg and radius 6.4 × 10⁶ m. Take G = 6.67 × 10⁻¹¹ N m² kg⁻².",
      parts: [
        {
          partId: "a",
          prompt: "Calculate the orbital speed of the satellite.",
          marks: 2,
          targetQuantityKey: "orbitalSpeedMs",
          expectedAnswer: "7.07 × 10³ m s⁻¹",
          workingSteps: [
            "v = √(GM / r) = √(6.67 × 10⁻¹¹ × 6.0 × 10²⁴ / 8.0 × 10⁶).",
            "v = √(5.0025 × 10⁷) = 7.07 × 10³ m s⁻¹.",
          ],
        },
        {
          partId: "b",
          prompt: "Determine the orbital period of the satellite.",
          marks: 2,
          dependsOnPartIds: ["a"],
          targetQuantityKey: "orbitalPeriodS",
          expectedAnswer: "7.11 × 10³ s",
          workingSteps: [
            "T = 2πr / v = 2π(8.0 × 10⁶) / 7072.8 = 7.11 × 10³ s.",
          ],
        },
        {
          partId: "c",
          prompt: "Calculate the total mechanical energy of the satellite in this circular orbit.",
          marks: 2,
          targetQuantityKey: "totalEnergyJ",
          expectedAnswer: "-1.25 × 10¹⁰ J",
          workingSteps: [
            "E_total = −GMm / (2r) = −(6.67 × 10⁻¹¹)(6.0 × 10²⁴)(500) / (2 × 8.0 × 10⁶).",
            "E_total = −1.25 × 10¹⁰ J.",
          ],
        },
      ],
      workedSolution:
        "(a) Orbital speed v = √(GM / r) = √(4.002 × 10¹⁴ / 8.0 × 10⁶) = 7.07 × 10³ m s⁻¹. (b) Period T = 2πr / v = 2π(8.0 × 10⁶) / 7073 = 7.11 × 10³ s. (c) Total mechanical energy E = −GMm / (2r) = −1.25 × 10¹⁰ J.",
      markScheme: [
        {
          code: "M1",
          partId: "a",
          criterion: "Equates gravitational force to centripetal force to obtain v = √(GM / r).",
          marks: 1,
        },
        {
          code: "A1",
          partId: "a",
          criterion: "Obtains v = 7.07 × 10³ m s⁻¹.",
          marks: 1,
        },
        {
          code: "M1",
          partId: "b",
          criterion: "Uses T = 2πr / v or Kepler's third law T = 2π√(r³ / GM).",
          marks: 1,
        },
        {
          code: "A1",
          partId: "b",
          criterion: "Obtains T = 7.11 × 10³ s.",
          marks: 1,
        },
        {
          code: "M1",
          partId: "c",
          criterion: "Uses E_total = −GMm / (2r) (including negative bound-state sign).",
          marks: 1,
        },
        {
          code: "A1",
          partId: "c",
          criterion: "Obtains −1.25 × 10¹⁰ J.",
          marks: 1,
        },
      ],
      totalMarks: 6,
    },

    // 14. EM INDUCTION — MCQ
    {
      id: "sp-em-induction-mcq-014",
      conceptId: "electromagnetic-induction-faraday-lenz",
      templateArchetype: "conducting-rod-rails-magnetic-braking-force",
      seed: 101001,
      syllabi: [
        {
          syllabus: "ib",
          level: "HL",
          topicId: "ib-theme-d",
          subtopicId: "ib-d4-induction",
        },
        {
          syllabus: "alevel",
          level: "Y13",
          topicId: "alevel-sec7-fields-consequences",
          subtopicId: "alevel-3-7-5-magnetic-fields-induction-ac",
        },
        {
          syllabus: "ncuk",
          level: "IFY-S2",
          topicId: "ncuk-ac4",
          subtopicId: "ncuk-ac4-6",
        },
      ],
      format: "mcq",
      difficulty: "higher",
      domain: "em-induction",
      scenarioSpec: {
        kind: "motional-emf-rails",
        magneticFieldT: 0.75,
        fieldDirection: "into-page",
        railSeparationM: 0.4,
        rodSpeedMs: 6,
        rodDirection: "right",
        loadResistanceOhm: 1.7,
        rodResistanceOhm: 0.3,
      },
      hiddenQuantities: [
        "totalResistanceOhm",
        "motionalEmfV",
        "inducedCurrentA",
        "terminalVoltageV",
        "magneticBrakingForceN",
        "mechanicalPowerW",
        "electricalPowerW",
      ],
      targetQuantityKey: "magneticBrakingForceN",
      stem: "A conducting rod of resistance 0.3 Ω slides to the right at a constant speed of 6 m s⁻¹ along smooth horizontal rails separated by 0.4 m in a uniform 0.75 T magnetic field directed into the page. The rails are connected to a 1.7 Ω load resistor. What external force magnitude is required to keep the rod moving at 6 m s⁻¹?",
      options: [
        {
          label: "A",
          text: "0.270 N",
          isCorrect: true,
        },
        {
          label: "B",
          text: "0.318 N",
          isCorrect: false,
          distractorRationale:
            "Neglects the 0.3 Ω internal resistance of the moving rod and divides ε = 1.80 V by 1.7 Ω only.",
        },
        {
          label: "C",
          text: "0.900 N",
          isCorrect: false,
          distractorRationale:
            "Stops after computing the induced current I = 0.900 A without multiplying by B L.",
        },
        {
          label: "D",
          text: "1.62 N",
          isCorrect: false,
          distractorRationale:
            "Calculates the mechanical power input P = Fv = 1.62 W instead of the applied force F.",
        },
      ],
      workedSolution:
        "Motional emf ε = BLv = 0.75 × 0.4 × 6 = 1.80 V. Total loop resistance R_tot = 1.7 + 0.3 = 2.00 Ω, so induced current I = 1.80 / 2.00 = 0.900 A. Magnetic braking force magnitude F = BIL = 0.75 × 0.900 × 0.4 = 0.270 N.",
      markScheme: [
        {
          code: "A1",
          criterion:
            "Finds ε = 1.80 V, I = 0.900 A, and F = BIL = 0.270 N (A).",
          marks: 1,
        },
      ],
      totalMarks: 1,
    },

    // 15. QUANTUM & NUCLEAR — Structured
    {
      id: "sp-quantum-nuclear-struct-015",
      conceptId: "photoelectric-effect",
      templateArchetype: "uv-photoelectric-threshold-stopping-potential",
      seed: 101101,
      syllabi: [
        {
          syllabus: "ib",
          level: "HL",
          topicId: "ib-theme-e",
          subtopicId: "ib-e2-quantum-physics",
        },
        {
          syllabus: "alevel",
          level: "Y12",
          topicId: "alevel-sec2-particles-radiation",
          subtopicId: "alevel-3-2-2-quantum-phenomena",
        },
        {
          syllabus: "ncuk",
          level: "IFY-S2",
          topicId: "ncuk-ac8",
          subtopicId: "ncuk-ac8-1",
        },
      ],
      format: "structured",
      difficulty: "standard",
      domain: "quantum-nuclear",
      scenarioSpec: {
        kind: "photoelectric-effect",
        workFunctionEv: 2.2,
        incidentFrequencyHz: 1.0e15,
      },
      hiddenQuantities: [
        "workFunctionJ",
        "thresholdFrequencyHz",
        "thresholdWavelengthM",
        "thresholdWavelengthNm",
        "incidentWavelengthM",
        "incidentWavelengthNm",
        "photonEnergyEv",
        "photonEnergyJ",
        "signedEnergyBalanceEv",
        "maxKineticEnergyEv",
        "maxKineticEnergyJ",
        "stoppingPotentialV",
        "maxElectronSpeedMs",
        "graphSlope",
      ],
      stem: "Monochromatic ultraviolet radiation of frequency 1.0 × 10¹⁵ Hz is incident on a clean potassium surface in vacuum with work function 2.2 eV. Take h = 6.63 × 10⁻³⁴ J s and e = 1.60 × 10⁻¹⁹ C.",
      parts: [
        {
          partId: "a",
          prompt: "Calculate the threshold frequency of the potassium surface.",
          marks: 2,
          targetQuantityKey: "thresholdFrequencyHz",
          expectedAnswer: "5.31 × 10¹⁴ Hz",
          workingSteps: [
            "Φ = 2.2 × 1.60 × 10⁻¹⁹ = 3.52 × 10⁻¹⁹ J.",
            "f₀ = Φ / h = 3.52 × 10⁻¹⁹ / 6.63 × 10⁻³⁴ = 5.31 × 10¹⁴ Hz.",
          ],
        },
        {
          partId: "b",
          prompt: "Determine the maximum kinetic energy, in eV, of the emitted photoelectrons.",
          marks: 2,
          targetQuantityKey: "maxKineticEnergyEv",
          expectedAnswer: "1.94 eV",
          workingSteps: [
            "Photon energy E = hf / e = (6.63 × 10⁻³⁴ × 1.0 × 10¹⁵) / 1.60 × 10⁻¹⁹ = 4.14 eV.",
            "E_k,max = 4.14 − 2.2 = 1.94 eV.",
          ],
        },
        {
          partId: "c",
          prompt: "State the stopping potential required to reduce the photocurrent to zero.",
          marks: 1,
          dependsOnPartIds: ["b"],
          targetQuantityKey: "stoppingPotentialV",
          expectedAnswer: "1.94 V",
          workingSteps: [
            "V_s = E_k,max / e = 1.94 V.",
          ],
        },
      ],
      workedSolution:
        "(a) Work function Φ = 2.2(1.60 × 10⁻¹⁹) = 3.52 × 10⁻¹⁹ J, so f₀ = Φ / h = 5.31 × 10¹⁴ Hz. (b) Incident photon energy = hf / e = 4.144 eV; E_k,max = 4.144 − 2.2 = 1.94 eV. (c) Stopping potential V_s = 1.94 V.",
      markScheme: [
        {
          code: "M1",
          partId: "a",
          criterion: "Converts 2.2 eV to 3.52 × 10⁻¹⁹ J and divides by Planck's constant h.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "a",
          criterion: "Obtains f₀ = 5.31 × 10¹⁴ Hz.",
          marks: 1,
        },
        {
          code: "M1",
          partId: "b",
          criterion: "Applies Einstein's photoelectric equation E_k,max = hf − Φ.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "b",
          criterion: "Obtains E_k,max = 1.94 eV.",
          marks: 1,
        },
        {
          code: "A1",
          partId: "c",
          criterion: "States stopping potential V_s = 1.94 V.",
          marks: 1,
        },
      ],
      totalMarks: 5,
    },
  ];
}
