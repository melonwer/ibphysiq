import type { PhysicsDomainId, PublicBankItem, PublicBankManifest } from "./types";

/**
 * Deterministic 18-item verified fallback seed across IB Physics (SL/HL),
 * UK A-Level Physics (Y12/Y13), and NCUK IFY Physics (IFY/S1/S2) so unit tests
 * and fresh builds work cleanly even when `dataset/` is absent.
 */
export const SEED_FALLBACK_ITEMS: readonly PublicBankItem[] = [
  {
    "id": "sp-graphs-0277-mcq",
    "syllabi": [
      {
        "syllabus": "ib",
        "level": "HL",
        "topicId": "ib-theme-a",
        "subtopicId": "ib-a2-forces-momentum"
      },
      {
        "syllabus": "alevel",
        "level": "Y13",
        "topicId": "alevel-sec4-mechanics-materials",
        "subtopicId": "alevel-3-4-1-force-energy-momentum"
      },
      {
        "syllabus": "ncuk",
        "level": "IFY",
        "topicId": "ncuk-ac2",
        "subtopicId": "ncuk-ac2-6"
      }
    ],
    "format": "mcq",
    "difficulty": "foundation",
    "visualFamily": "cartesian_plot",
    "stem": "The graph displays the linear momentum of a frictionless puck on an air table (mass 3.2 kg) against time. What resultant force acts on it between t = 3.0 s and t = 8.0 s?",
    "workedSolution": "By Newton's second law, F = Δp / Δt = (22.4 − 6.4) / (8 − 3) = 3.20 N.",
    "markScheme": [
      {
        "code": "A1",
        "criterion": "Evaluates F = Δp / Δt = (22.4 − 6.4) / (5) = 3.20 N (D).",
        "marks": 1
      }
    ],
    "totalMarks": 1,
    "conceptId": "linear-momentum-impulse",
    "familyGroupKey": "linear-momentum-impulse::pt-momentum-gradient-kinetic-work",
    "svgMarkup": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"720\" height=\"500\" viewBox=\"0 0 720 500\" role=\"img\" aria-label=\"momentum / kg m s⁻¹ against time / s\"><rect width=\"720\" height=\"500\" fill=\"white\"/><defs><clipPath id=\"plot-sp-graphs-0277-mcq-figure\"><rect x=\"112\" y=\"38\" width=\"528\" height=\"378\"/></clipPath></defs><path d=\"M112 38V416\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M156 38V416\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M200 38V416\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M244 38V416\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M288 38V416\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M332 38V416\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M376 38V416\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M420 38V416\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M464 38V416\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M508 38V416\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M552 38V416\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M596 38V416\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M640 38V416\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M112 416H640\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M112 373.8125H640\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M112 331.625H640\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M112 289.4375H640\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M112 247.25H640\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M112 205.0625H640\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M112 162.875H640\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M112 120.6875H640\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M112 78.5H640\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M112 38V416\" stroke=\"#a0a7ad\" stroke-width=\"1\"/><path d=\"M200 38V416\" stroke=\"#a0a7ad\" stroke-width=\"1\"/><path d=\"M288 38V416\" stroke=\"#a0a7ad\" stroke-width=\"1\"/><path d=\"M376 38V416\" stroke=\"#a0a7ad\" stroke-width=\"1\"/><path d=\"M464 38V416\" stroke=\"#a0a7ad\" stroke-width=\"1\"/><path d=\"M552 38V416\" stroke=\"#a0a7ad\" stroke-width=\"1\"/><path d=\"M640 38V416\" stroke=\"#a0a7ad\" stroke-width=\"1\"/><path d=\"M112 416H640\" stroke=\"#a0a7ad\" stroke-width=\"1\"/><path d=\"M112 331.625H640\" stroke=\"#a0a7ad\" stroke-width=\"1\"/><path d=\"M112 247.25H640\" stroke=\"#a0a7ad\" stroke-width=\"1\"/><path d=\"M112 162.875H640\" stroke=\"#a0a7ad\" stroke-width=\"1\"/><path d=\"M112 78.5H640\" stroke=\"#a0a7ad\" stroke-width=\"1\"/><path d=\"M112 416H640\" fill=\"none\" stroke=\"#202429\" stroke-width=\"1.7\"/><path d=\"M112 416V38\" fill=\"none\" stroke=\"#202429\" stroke-width=\"1.7\"/><path d=\"M112 411v10\" stroke=\"#202429\"/><text x=\"112\" y=\"442\" text-anchor=\"middle\" font-size=\"17\" font-family=\"Arial, sans-serif\">0</text><path d=\"M200 411v10\" stroke=\"#202429\"/><text x=\"200\" y=\"442\" text-anchor=\"middle\" font-size=\"17\" font-family=\"Arial, sans-serif\">2</text><path d=\"M288 411v10\" stroke=\"#202429\"/><text x=\"288\" y=\"442\" text-anchor=\"middle\" font-size=\"17\" font-family=\"Arial, sans-serif\">4</text><path d=\"M376 411v10\" stroke=\"#202429\"/><text x=\"376\" y=\"442\" text-anchor=\"middle\" font-size=\"17\" font-family=\"Arial, sans-serif\">6</text><path d=\"M464 411v10\" stroke=\"#202429\"/><text x=\"464\" y=\"442\" text-anchor=\"middle\" font-size=\"17\" font-family=\"Arial, sans-serif\">8</text><path d=\"M552 411v10\" stroke=\"#202429\"/><text x=\"552\" y=\"442\" text-anchor=\"middle\" font-size=\"17\" font-family=\"Arial, sans-serif\">10</text><path d=\"M640 411v10\" stroke=\"#202429\"/><text x=\"640\" y=\"442\" text-anchor=\"middle\" font-size=\"17\" font-family=\"Arial, sans-serif\">12</text><path d=\"M107 416h10\" stroke=\"#202429\"/><text x=\"100\" y=\"421.95\" text-anchor=\"end\" font-size=\"17\" font-family=\"Arial, sans-serif\">0</text><path d=\"M107 331.625h10\" stroke=\"#202429\"/><text x=\"100\" y=\"337.575\" text-anchor=\"end\" font-size=\"17\" font-family=\"Arial, sans-serif\">5</text><path d=\"M107 247.25h10\" stroke=\"#202429\"/><text x=\"100\" y=\"253.2\" text-anchor=\"end\" font-size=\"17\" font-family=\"Arial, sans-serif\">10</text><path d=\"M107 162.875h10\" stroke=\"#202429\"/><text x=\"100\" y=\"168.825\" text-anchor=\"end\" font-size=\"17\" font-family=\"Arial, sans-serif\">15</text><path d=\"M107 78.5h10\" stroke=\"#202429\"/><text x=\"100\" y=\"84.45\" text-anchor=\"end\" font-size=\"17\" font-family=\"Arial, sans-serif\">20</text><path d=\"M112 308 L244 308 L464 38 L640 38\" fill=\"none\" stroke=\"#15191d\" stroke-width=\"2.2\" stroke-linejoin=\"round\" stroke-linecap=\"round\" clip-path=\"url(#plot-sp-graphs-0277-mcq-figure)\"/><text x=\"376\" y=\"480\" text-anchor=\"middle\" font-size=\"20\" font-family=\"Arial, sans-serif\">time / s</text><text transform=\"translate(28 227) rotate(-90)\" text-anchor=\"middle\" font-size=\"20\" font-family=\"Arial, sans-serif\">momentum / kg m s⁻¹</text></svg>",
    "options": [
      {
        "label": "A",
        "text": "1.00 N",
        "isCorrect": false,
        "distractorRationale": "Divides Δp / Δt by mass m, obtaining acceleration rather than resultant force."
      },
      {
        "label": "B",
        "text": "2.80 N",
        "isCorrect": false,
        "distractorRationale": "Computes the secant ratio p₂ / t₂ from the origin, ignoring both initial momentum p₁ and start time t₁."
      },
      {
        "label": "C",
        "text": "80.0 N",
        "isCorrect": false,
        "distractorRationale": "Multiplies Δp by Δt instead of evaluating the rate of change of momentum Δp / Δt."
      },
      {
        "label": "D",
        "text": "3.20 N",
        "isCorrect": true
      }
    ],
    "correctOptionIndex": 3
  },
  {
    "id": "sp-circuits-11-structured-234",
    "syllabi": [
      {
        "syllabus": "ib",
        "level": "SL",
        "topicId": "ib-theme-b",
        "subtopicId": "ib-b5-current-circuits"
      },
      {
        "syllabus": "alevel",
        "level": "Y13",
        "topicId": "alevel-sec5-electricity",
        "subtopicId": "alevel-3-5-1-current-electricity"
      },
      {
        "syllabus": "ncuk",
        "level": "IFY-S1",
        "topicId": "ncuk-ac4",
        "subtopicId": "ncuk-ac4-2"
      }
    ],
    "format": "structured",
    "difficulty": "higher",
    "visualFamily": "circuit_network",
    "stem": "The schematic of a surgical cautery wire test fixture shows an ideal 6 V source connected directly across cylindrical titanium wire R_1 (length 2.2 m, diameter 0.76 mm, resistivity 4.20 × 10⁻⁷ Ω m).",
    "workedSolution": "(a) A = π d² / 4 = 4.54 × 10⁻⁷ m², giving R_1 = ρL / A = 2.04 Ω. (b) I = 6 / 2.04 = 2.95 A. (c) P = V I = 17.7 W.",
    "markScheme": [
      {
        "code": "M1",
        "partId": "a",
        "criterion": "Computes circular area π(d/2)² in m² and applies R = ρL / A.",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "a",
        "criterion": "Obtains R_1 = 2.04 Ω.",
        "marks": 1
      },
      {
        "code": "M1",
        "partId": "b",
        "criterion": "Divides 6 V by R_1.",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "b",
        "criterion": "Obtains I = 2.95 A.",
        "marks": 1
      },
      {
        "code": "M1",
        "partId": "c",
        "criterion": "Applies P = V I or V² / R_1.",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "c",
        "criterion": "Obtains P = 17.7 W.",
        "marks": 1
      }
    ],
    "totalMarks": 6,
    "conceptId": "resistivity-ohmic-conductors",
    "familyGroupKey": "resistivity-ohmic-conductors::cylindrical-wire-resistivity-circuit",
    "svgMarkup": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"760\" height=\"500\" viewBox=\"0 0 760 500\" role=\"img\" aria-label=\"Circuit diagram with 2 components\"><rect width=\"760\" height=\"500\" fill=\"white\"/><defs><marker id=\"circuit-arrow-sp-circuits-11-structured-234-figure\" viewBox=\"0 0 10 10\" refX=\"8\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto\"><path d=\"M0 0L10 5L0 10Z\" fill=\"#171b1f\"/></marker></defs><path data-wire-id=\"sp-circuits-11-structured-234-figure-main-wire-1\" d=\"M101.12 142.021818L101.12 250\" fill=\"none\" stroke=\"#171b1f\" stroke-width=\"2\"/><path data-wire-id=\"sp-circuits-11-structured-234-figure-main-wire-2\" d=\"M101.12 250L101.12 357.978182\" fill=\"none\" stroke=\"#171b1f\" stroke-width=\"2\"/><path data-wire-id=\"sp-circuits-11-structured-234-figure-main-wire-3\" d=\"M658.88 142.021818L658.88 250\" fill=\"none\" stroke=\"#171b1f\" stroke-width=\"2\"/><path data-wire-id=\"sp-circuits-11-structured-234-figure-main-wire-4\" d=\"M658.88 250L658.88 357.978182\" fill=\"none\" stroke=\"#171b1f\" stroke-width=\"2\"/><path d=\"M101.12 142.021818L370 142.021818M390 142.021818L658.88 142.021818\" fill=\"none\" stroke=\"#171b1f\" stroke-width=\"2\"/><g transform=\"translate(380 142.021818) rotate(0)\"><g data-component-id=\"supply\" data-component-kind=\"cell\"><path d=\"M-6 -22V22M7 -13V13\" stroke=\"#171b1f\" stroke-width=\"2\"/></g></g><text x=\"380\" y=\"178.021818\" text-anchor=\"middle\" font-size=\"18\" font-family=\"Arial, sans-serif\">6 V</text><path d=\"M101.12 357.978182L340 357.978182M420 357.978182L658.88 357.978182\" fill=\"none\" stroke=\"#171b1f\" stroke-width=\"2\"/><g transform=\"translate(380 357.978182) rotate(0)\"><rect data-component-id=\"r1\" data-component-kind=\"resistor\" x=\"-38\" y=\"-14\" width=\"76\" height=\"28\" fill=\"white\" stroke=\"#171b1f\" stroke-width=\"2\"/></g><text x=\"380\" y=\"393.978182\" text-anchor=\"middle\" font-size=\"18\" font-family=\"Arial, sans-serif\">R_1</text></svg>",
    "parts": [
      {
        "partId": "a",
        "prompt": "Calculate the resistance of the cylindrical wire R_1.",
        "marks": 2,
        "targetQuantityKey": "parallelOhm",
        "expectedAnswer": "2.04 Ω",
        "workingSteps": [
          "A = π(d/2)² = π(0.76 × 10⁻³ / 2)² = 4.54 × 10⁻⁷ m².",
          "R_1 = ρL / A = 2.04 Ω."
        ]
      },
      {
        "partId": "b",
        "prompt": "Calculate the current in the wire.",
        "marks": 2,
        "dependsOnPartIds": [
          "a"
        ],
        "targetQuantityKey": "totalCurrentA",
        "expectedAnswer": "2.95 A",
        "workingSteps": [
          "I = V / R_1 = 6 / 2.04 = 2.95 A."
        ]
      },
      {
        "partId": "c",
        "prompt": "Determine the thermal power dissipated in the wire.",
        "marks": 2,
        "dependsOnPartIds": [
          "a",
          "b"
        ],
        "targetQuantityKey": "branchOnePowerW",
        "expectedAnswer": "17.7 W",
        "workingSteps": [
          "P = V × I = 6 × 2.95 = 17.7 W."
        ]
      }
    ]
  },
  {
    "id": "sp-fields-mcq-0064",
    "syllabi": [
      {
        "syllabus": "ib",
        "level": "SL",
        "topicId": "ib-theme-d",
        "subtopicId": "ib-d2-electric-magnetic-fields"
      },
      {
        "syllabus": "alevel",
        "level": "Y13",
        "topicId": "alevel-sec7-fields-consequences",
        "subtopicId": "alevel-3-7-3-electric-fields"
      },
      {
        "syllabus": "ncuk",
        "level": "IFY-S2",
        "topicId": "ncuk-ac4",
        "subtopicId": "ncuk-ac4-5"
      }
    ],
    "format": "mcq",
    "difficulty": "higher",
    "visualFamily": "field_map",
    "stem": "Inside a university physics Van de Graaff calibration tunnel, positive point charges +2Q (on the left) and +4Q (on the right) are fixed a distance 3 x apart in vacuum. Point P lies on the line joining them at a distance 1 x from +2Q (and 2 x from +4Q). Using Coulomb constant k, what is the resultant electric field at P expressed in terms of kQ/x²?",
    "workedSolution": "At P, +2Q produces (2/1²) kQ/x² = 2.00 kQ/x² to the right, while +4Q at distance 2 x produces (4/2²) kQ/x² = 1.00 kQ/x² to the left. Net field = 1.00 kQ/x² to the right (D).",
    "markScheme": [
      {
        "code": "A1",
        "criterion": "Subtracts (2/1²) and (4/2²) to obtain 1.00 kQ/x² to the right (D).",
        "marks": 1
      }
    ],
    "totalMarks": 1,
    "conceptId": "electrostatic-coulomb-uniform-fields",
    "familyGroupKey": "electrostatic-coulomb-uniform-fields::symbolic-superposition-field-multiple",
    "svgMarkup": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"800\" height=\"500\" viewBox=\"0 0 800 500\" role=\"img\" aria-label=\"Field diagram with 2 source or marker entities\"><rect width=\"800\" height=\"500\" fill=\"white\"/><defs><marker id=\"field-arrow-sp-fields-mcq-0064-figure\" viewBox=\"0 0 10 10\" refX=\"8\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto\"><path d=\"M0 0L10 5L0 10Z\" fill=\"#171b1f\"/></marker><marker id=\"field-reverse-arrow-sp-fields-mcq-0064-figure\" viewBox=\"0 0 10 10\" refX=\"2\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto\"><path d=\"M10 0L0 5L10 10Z\" fill=\"#59656c\"/></marker></defs><path data-path-id=\"baseline\" d=\"M107.68 233.84L706.24 233.84\" fill=\"none\" stroke=\"#59656c\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-dasharray=\"8 6\"/><path data-path-id=\"total\" d=\"M177.28 363.12L622.72 363.12\" fill=\"none\" stroke=\"#59656c\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" marker-start=\"url(#field-reverse-arrow-sp-fields-mcq-0064-figure)\" marker-end=\"url(#field-arrow-sp-fields-mcq-0064-figure)\"/><text x=\"400\" y=\"354.12\" text-anchor=\"middle\" font-size=\"15\" font-family=\"Arial, sans-serif\">d</text><path data-path-id=\"dimension-extension-1\" d=\"M177.28 245.96L177.28 375.24\" fill=\"none\" stroke=\"#59656c\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path data-path-id=\"dimension-extension-2\" d=\"M622.72 245.96L622.72 375.24\" fill=\"none\" stroke=\"#59656c\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><g data-entity-id=\"left-charge\"><circle cx=\"177.28\" cy=\"233.84\" r=\"18\" fill=\"white\" stroke=\"#171b1f\" stroke-width=\"2\"/><text x=\"177.28\" y=\"239.84\" text-anchor=\"middle\" font-size=\"20\" font-family=\"Arial, sans-serif\">+</text><text x=\"177.28\" y=\"262.84\" text-anchor=\"middle\" font-size=\"17\" font-family=\"Arial, sans-serif\">q₁</text></g><g data-entity-id=\"right-charge\"><circle cx=\"622.72\" cy=\"233.84\" r=\"18\" fill=\"white\" stroke=\"#171b1f\" stroke-width=\"2\"/><text x=\"622.72\" y=\"239.84\" text-anchor=\"middle\" font-size=\"20\" font-family=\"Arial, sans-serif\">+</text><text x=\"622.72\" y=\"262.84\" text-anchor=\"middle\" font-size=\"17\" font-family=\"Arial, sans-serif\">q₂</text></g></svg>",
    "options": [
      {
        "label": "A",
        "text": "1.00 kQ/x² to the left",
        "isCorrect": false,
        "distractorRationale": "Evaluates the correct inverse-square difference coefficient but reverses the resultant field direction."
      },
      {
        "label": "B",
        "text": "3.00 kQ/x² to the right",
        "isCorrect": false,
        "distractorRationale": "Adds the two field magnitudes between two positive charges instead of subtracting opposing vectors."
      },
      {
        "label": "C",
        "text": "0.150 kQ/x² to the right",
        "isCorrect": false,
        "distractorRationale": "Divides by unsquared distance ratios instead of squaring the distances from each charge."
      },
      {
        "label": "D",
        "text": "1.00 kQ/x² to the right",
        "isCorrect": true
      }
    ],
    "correctOptionIndex": 3
  },
  {
    "id": "sp-mech-structured-0199",
    "syllabi": [
      {
        "syllabus": "ib",
        "level": "SL",
        "topicId": "ib-theme-a",
        "subtopicId": "ib-a2-forces-momentum"
      },
      {
        "syllabus": "alevel",
        "level": "Y12",
        "topicId": "alevel-sec4-mechanics-materials",
        "subtopicId": "alevel-3-4-1-force-energy-momentum"
      },
      {
        "syllabus": "ncuk",
        "level": "IFY-S1",
        "topicId": "ncuk-ac2",
        "subtopicId": "ncuk-ac2-6"
      }
    ],
    "format": "structured",
    "difficulty": "standard",
    "visualFamily": "mechanics_scene",
    "stem": "Along a level low-friction dynamics rail, cart X of mass 2 kg travels to the right at 11 m s⁻¹ and collides with stationary cart Y of mass 2 kg. Immediately after impact, cart Y moves to the right at 8.39 m s⁻¹.",
    "workedSolution": "(a) v_X = (2 × 11 − 2 × 8.39) / 2. Answer: 2.61 m s⁻¹. (b) K_f = 0.5(2)(2.61)² + 0.5(2)(8.39)². Answer: 77.2 J. (c) K_i = 0.5 × 2 × 11² = 121 J. ΔK_lost = K_i − 77.2. Answer: 43.8 J.",
    "markScheme": [
      {
        "code": "M1",
        "partId": "a",
        "criterion": "Applies m_X u_X = m_X v_X + m_Y v_Y.",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "a",
        "criterion": "Obtains 2.61 m s⁻¹.",
        "marks": 1
      },
      {
        "code": "M1",
        "partId": "b",
        "criterion": "Sums ½m_X v_X² + ½m_Y v_Y².",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "b",
        "criterion": "Obtains 77.2 J.",
        "marks": 1
      },
      {
        "code": "M1",
        "partId": "c",
        "criterion": "Subtracts K_f from K_i = ½m_X u_X².",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "c",
        "criterion": "Obtains 43.8 J.",
        "marks": 1
      }
    ],
    "totalMarks": 6,
    "conceptId": "linear-momentum-impulse",
    "familyGroupKey": "linear-momentum-impulse::inelastic-cart-collision-energy-loss",
    "svgMarkup": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"620\" height=\"430\" viewBox=\"0 0 620 430\" role=\"img\"><title>Mechanics diagram</title><desc>X, 2 kg; Y, 2 kg; 11 m s⁻¹</desc><defs><marker id=\"mechanics-arrow-sp-mech-structured-0199-figure\" viewBox=\"0 0 10 10\" refX=\"9\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto-start-reverse\"><path d=\"M 0 0 L 10 5 L 0 10 z\"/></marker></defs><g font-family=\"Arial, sans-serif\" font-size=\"15\"><polyline points=\"158.8,262.6 461.2,262.6\" fill=\"none\" stroke=\"#202020\" stroke-width=\"2\"/><g transform=\"translate(230.8 241) rotate(0)\"><rect x=\"-19\" y=\"-13\" width=\"38\" height=\"26\" fill=\"white\" stroke=\"#202020\" stroke-width=\"2\"/><circle cx=\"-12\" cy=\"17\" r=\"4\"/><circle cx=\"12\" cy=\"17\" r=\"4\"/></g><text x=\"230.8\" y=\"216\" text-anchor=\"middle\">X, 2 kg</text><g transform=\"translate(392.8 241) rotate(0)\"><rect x=\"-19\" y=\"-13\" width=\"38\" height=\"26\" fill=\"white\" stroke=\"#202020\" stroke-width=\"2\"/><circle cx=\"-12\" cy=\"17\" r=\"4\"/><circle cx=\"12\" cy=\"17\" r=\"4\"/></g><text x=\"392.8\" y=\"216\" text-anchor=\"middle\">Y, 2 kg</text><line x1=\"230.8\" y1=\"241\" x2=\"313.6\" y2=\"241\" stroke=\"#202020\" stroke-width=\"2\" marker-end=\"url(#mechanics-arrow-sp-mech-structured-0199-figure)\"/><text x=\"313.6\" y=\"229\" text-anchor=\"middle\">11 m s⁻¹</text><text x=\"310\" y=\"418\" text-anchor=\"middle\" font-size=\"12\">Diagrams not to scale</text></g></svg>",
    "parts": [
      {
        "partId": "a",
        "prompt": "Calculate the velocity of cart X immediately after the collision.",
        "marks": 2,
        "targetQuantityKey": "finalXMs",
        "expectedAnswer": "2.61 m s⁻¹",
        "workingSteps": [
          "v_X = (2 × 11 − 2 × 8.39) / 2.",
          "Result = 2.61 m s⁻¹."
        ]
      },
      {
        "partId": "b",
        "prompt": "Calculate the total kinetic energy of the two bodies immediately after impact.",
        "marks": 2,
        "dependsOnPartIds": [
          "a"
        ],
        "targetQuantityKey": "finalEnergyJ",
        "expectedAnswer": "77.2 J",
        "workingSteps": [
          "K_f = 0.5(2)(2.61)² + 0.5(2)(8.39)².",
          "Result = 77.2 J."
        ]
      },
      {
        "partId": "c",
        "prompt": "Determine the kinetic energy lost during the collision.",
        "marks": 2,
        "dependsOnPartIds": [
          "b"
        ],
        "targetQuantityKey": "lostEnergyJ",
        "expectedAnswer": "43.8 J",
        "workingSteps": [
          "K_i = 0.5 × 2 × 11² = 121 J.",
          "ΔK_lost = K_i − 77.2.",
          "Result = 43.8 J."
        ]
      }
    ]
  },
  {
    "id": "sp-v2-waves-mcq-0125",
    "syllabi": [
      {
        "syllabus": "ib",
        "level": "HL",
        "topicId": "ib-theme-c",
        "subtopicId": "ib-c3-wave-phenomena"
      },
      {
        "syllabus": "alevel",
        "level": "Y13",
        "topicId": "alevel-sec3-waves",
        "subtopicId": "alevel-3-3-2-refraction-diffraction-interference"
      },
      {
        "syllabus": "ncuk",
        "level": "IFY",
        "topicId": "ncuk-ac6",
        "subtopicId": "ncuk-ac6-4"
      }
    ],
    "format": "mcq",
    "difficulty": "standard",
    "visualFamily": "waves",
    "stem": "Figure shows a collimated beam striking a transmission diffraction grating mounted on thevernier table of a spectrometer (500 lines mm⁻¹) normally and producing its n = 2 principal maximum at an angle of 32.1°. Calculate the beam's wavelength.",
    "workedSolution": "Slit spacing d = 10⁻³ / 500 = 2.00 × 10⁻⁶ m. Rearranging d sin θ = nλ gives λ = d sin(32.1°) / 2 = 5.32 × 10⁻⁷ m.",
    "markScheme": [
      {
        "code": "A1",
        "criterion": "Computes d = 10⁻³ / N and λ = d sin θ / n = 5.32 × 10⁻⁷ m (A).",
        "marks": 1
      }
    ],
    "totalMarks": 1,
    "conceptId": "single-slit-diffraction-gratings",
    "familyGroupKey": "single-slit-diffraction-gratings::grating-lines-per-mm-diffraction-angle",
    "svgMarkup": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"680\" height=\"420\" viewBox=\"0 0 680 420\" role=\"img\" aria-label=\"Diffraction grating interference diagram\"><title>Diffraction grating interference diagram</title><desc>λ; θ</desc><defs><marker id=\"waves-arrow-waves-diffraction-grating-mcq-18\" viewBox=\"0 0 10 10\" refX=\"8.5\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto-start-reverse\"><path d=\"M 0 0.5 L 10 5 L 0 9.5 z\" fill=\"#1f2937\"/></marker></defs><rect x=\"0\" y=\"0\" width=\"680\" height=\"420\" fill=\"#ffffff\"/><g font-family=\"Arial, Helvetica, sans-serif\" font-size=\"13\"><line x1=\"44\" y1=\"223\" x2=\"199\" y2=\"223\" stroke=\"#dc2626\" stroke-width=\"2.6\" marker-end=\"url(#waves-arrow-waves-diffraction-grating-mcq-18)\"/><text x=\"124.5\" y=\"209\" text-anchor=\"middle\" font-size=\"12.5\" font-weight=\"600\" fill=\"#b91c1c\">λ</text><line x1=\"205\" y1=\"149\" x2=\"205\" y2=\"297\" stroke=\"#111827\" stroke-width=\"3.5\"/><line x1=\"200\" y1=\"159\" x2=\"210\" y2=\"159\" stroke=\"#ffffff\" stroke-width=\"2\"/><line x1=\"200\" y1=\"167\" x2=\"210\" y2=\"167\" stroke=\"#ffffff\" stroke-width=\"2\"/><line x1=\"200\" y1=\"175\" x2=\"210\" y2=\"175\" stroke=\"#ffffff\" stroke-width=\"2\"/><line x1=\"200\" y1=\"183\" x2=\"210\" y2=\"183\" stroke=\"#ffffff\" stroke-width=\"2\"/><line x1=\"200\" y1=\"191\" x2=\"210\" y2=\"191\" stroke=\"#ffffff\" stroke-width=\"2\"/><line x1=\"200\" y1=\"199\" x2=\"210\" y2=\"199\" stroke=\"#ffffff\" stroke-width=\"2\"/><line x1=\"200\" y1=\"207\" x2=\"210\" y2=\"207\" stroke=\"#ffffff\" stroke-width=\"2\"/><line x1=\"200\" y1=\"215\" x2=\"210\" y2=\"215\" stroke=\"#ffffff\" stroke-width=\"2\"/><line x1=\"200\" y1=\"223\" x2=\"210\" y2=\"223\" stroke=\"#ffffff\" stroke-width=\"2\"/><line x1=\"200\" y1=\"231\" x2=\"210\" y2=\"231\" stroke=\"#ffffff\" stroke-width=\"2\"/><line x1=\"200\" y1=\"239\" x2=\"210\" y2=\"239\" stroke=\"#ffffff\" stroke-width=\"2\"/><line x1=\"200\" y1=\"247\" x2=\"210\" y2=\"247\" stroke=\"#ffffff\" stroke-width=\"2\"/><line x1=\"200\" y1=\"255\" x2=\"210\" y2=\"255\" stroke=\"#ffffff\" stroke-width=\"2\"/><line x1=\"200\" y1=\"263\" x2=\"210\" y2=\"263\" stroke=\"#ffffff\" stroke-width=\"2\"/><line x1=\"200\" y1=\"271\" x2=\"210\" y2=\"271\" stroke=\"#ffffff\" stroke-width=\"2\"/><line x1=\"200\" y1=\"279\" x2=\"210\" y2=\"279\" stroke=\"#ffffff\" stroke-width=\"2\"/><line x1=\"200\" y1=\"287\" x2=\"210\" y2=\"287\" stroke=\"#ffffff\" stroke-width=\"2\"/><path d=\"M 205 63 A 160 160 0 0 1 205 383\" fill=\"none\" stroke=\"#9ca3af\" stroke-width=\"1.5\" stroke-dasharray=\"5 4\"/><line x1=\"205\" y1=\"223\" x2=\"365\" y2=\"223\" stroke=\"#dc2626\" stroke-width=\"2\" marker-end=\"url(#waves-arrow-waves-diffraction-grating-mcq-18)\"/><text x=\"375\" y=\"227\" text-anchor=\"start\" font-size=\"12\" font-weight=\"600\" fill=\"#111827\">n = 0</text><line x1=\"205\" y1=\"223\" x2=\"343.5641\" y2=\"143\" stroke=\"#dc2626\" stroke-width=\"1.7\" stroke-dasharray=\"5 3\" marker-end=\"url(#waves-arrow-waves-diffraction-grating-mcq-18)\"/><line x1=\"205\" y1=\"223\" x2=\"343.5641\" y2=\"303\" stroke=\"#dc2626\" stroke-width=\"1.7\" stroke-dasharray=\"5 3\" marker-end=\"url(#waves-arrow-waves-diffraction-grating-mcq-18)\"/><text x=\"351.5641\" y=\"143\" text-anchor=\"start\" font-size=\"12\" fill=\"#374151\">+n</text><text x=\"351.5641\" y=\"307\" text-anchor=\"start\" font-size=\"12\" fill=\"#374151\">-n</text><path d=\"M 259 223 A 54 54 0 0 0 251.7654 196\" fill=\"none\" stroke=\"#1d4ed8\" stroke-width=\"1.5\"/><text x=\"278.4104\" y=\"204.365\" text-anchor=\"start\" font-size=\"12\" font-weight=\"600\" fill=\"#1d4ed8\">θ</text><text x=\"664\" y=\"408\" text-anchor=\"end\" font-size=\"11\" fill=\"#6b7280\">Diagram not to scale</text></g></svg>",
    "options": [
      {
        "label": "A",
        "text": "5.32 × 10⁻⁷ m",
        "isCorrect": true
      },
      {
        "label": "B",
        "text": "6.28 × 10⁻⁷ m",
        "isCorrect": false,
        "distractorRationale": "Substitutes tan θ instead of sin θ into λ = d sin θ / n."
      },
      {
        "label": "C",
        "text": "1.06 × 10⁻⁶ m",
        "isCorrect": false,
        "distractorRationale": "Omits division by diffraction order n, computing λ = d sin θ."
      },
      {
        "label": "D",
        "text": "5.32 × 10⁻⁴ m",
        "isCorrect": false,
        "distractorRationale": "Forgets to convert lines per mm into lines per metre, computing d = 1 / N in metres instead of 10⁻³ / N."
      }
    ],
    "correctOptionIndex": 0
  },
  {
    "id": "sp-optics-shm-struct-0270",
    "syllabi": [
      {
        "syllabus": "ib",
        "level": "SL",
        "topicId": "ib-theme-c",
        "subtopicId": "ib-c1-shm"
      },
      {
        "syllabus": "alevel",
        "level": "Y13",
        "topicId": "alevel-sec6-further-mechanics-thermal",
        "subtopicId": "alevel-3-6-1-periodic-motion-shm"
      },
      {
        "syllabus": "ncuk",
        "level": "IFY-S2",
        "topicId": "ncuk-ac6",
        "subtopicId": "ncuk-ac6-1"
      }
    ],
    "format": "structured",
    "difficulty": "standard",
    "visualFamily": "optics-shm",
    "stem": "In a violins bridge laser-Doppler vibration target, a component oscillates in simple harmonic motion at frequency f = 2.5 Hz with amplitude x₀ = 0.1 m. Its instantaneous state is examined when the displacement from equilibrium is x = 0.035 m.",
    "workedSolution": "(a) ω = 2π(2.5) = 15.7 rad s⁻¹. (b) At x = 0.035 m, a = −ω²x = -8.64 m s⁻². (c) Maximum acceleration magnitude a_max = ω² x₀ = 24.7 m s⁻².",
    "markScheme": [
      {
        "code": "M1",
        "partId": "a",
        "criterion": "Uses ω = 2πf with f = 2.5 Hz.",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "a",
        "criterion": "Obtains ω = 15.7 rad s⁻¹.",
        "marks": 1
      },
      {
        "code": "M1",
        "partId": "b",
        "criterion": "Applies a = −ω²x including restoring sign.",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "b",
        "criterion": "Obtains a = -8.64 m s⁻².",
        "marks": 1
      },
      {
        "code": "M1",
        "partId": "c",
        "criterion": "Uses a_max = ω² x₀.",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "c",
        "criterion": "Obtains a_max = 24.7 m s⁻².",
        "marks": 1
      }
    ],
    "totalMarks": 6,
    "conceptId": "simple-harmonic-motion",
    "familyGroupKey": "simple-harmonic-motion::shm-defining-acceleration-phase-portrait",
    "svgMarkup": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"680\" height=\"400\" viewBox=\"0 0 680 400\" role=\"img\" aria-label=\"Simple harmonic motion graph\"><title>Simple harmonic motion graph</title><desc>Simple harmonic motion kinematic and energy curves</desc><rect width=\"680\" height=\"400\" fill=\"#ffffff\"/><g font-family=\"Arial, Helvetica, sans-serif\"><rect x=\"80\" y=\"46\" width=\"550\" height=\"296\" fill=\"#ffffff\" stroke=\"#cbd5e1\" stroke-width=\"1.2\"/><line x1=\"88\" y1=\"194\" x2=\"622\" y2=\"194\" stroke=\"#64748b\" stroke-width=\"1.3\"/><line x1=\"355\" y1=\"54\" x2=\"355\" y2=\"334\" stroke=\"#64748b\" stroke-width=\"1.3\"/><text x=\"575\" y=\"210\" text-anchor=\"middle\" font-size=\"10.5\" fill=\"#475569\">+0.1</text><text x=\"135\" y=\"210\" text-anchor=\"middle\" font-size=\"10.5\" fill=\"#475569\">−0.1</text><text x=\"620\" y=\"188\" text-anchor=\"end\" font-size=\"11.5\" font-weight=\"600\" fill=\"#1e293b\">x / m</text><line x1=\"135\" y1=\"78.56\" x2=\"575\" y2=\"309.44\" stroke=\"#b91c1c\" stroke-width=\"2.4\"/><text x=\"363\" y=\"82.56\" font-size=\"10.5\" fill=\"#475569\">+a_max</text><text x=\"363\" y=\"313.44\" font-size=\"10.5\" fill=\"#475569\">−a_max</text><text x=\"363\" y=\"64\" font-size=\"11.5\" font-weight=\"600\" fill=\"#b91c1c\">a</text></g></svg>",
    "parts": [
      {
        "partId": "a",
        "prompt": "Calculate the angular frequency ω of the oscillation.",
        "marks": 2,
        "targetQuantityKey": "angularFrequencyRadS",
        "expectedAnswer": "15.7 rad s⁻¹",
        "workingSteps": [
          "ω = 2πf = 2π × 2.5 = 15.7 rad s⁻¹."
        ]
      },
      {
        "partId": "b",
        "prompt": "Calculate the signed acceleration a when the displacement is x = 0.035 m.",
        "marks": 2,
        "dependsOnPartIds": [
          "a"
        ],
        "targetQuantityKey": "accelerationAtQueryDisplacementMs2",
        "expectedAnswer": "-8.64 m s⁻²",
        "workingSteps": [
          "a = −ω²x = −(15.71)² × (0.035) = -8.64 m s⁻²."
        ]
      },
      {
        "partId": "c",
        "prompt": "Determine the magnitude of the maximum acceleration a_max.",
        "marks": 2,
        "dependsOnPartIds": [
          "a"
        ],
        "targetQuantityKey": "maxAccelerationMs2",
        "expectedAnswer": "24.7 m s⁻²",
        "workingSteps": [
          "a_max = ω² x₀ = (15.71)² × 0.1 = 24.7 m s⁻²."
        ]
      }
    ]
  },
  {
    "id": "sp-thermal-mcq-0220",
    "syllabi": [
      {
        "syllabus": "ib",
        "level": "SL",
        "topicId": "ib-theme-b",
        "subtopicId": "ib-b1-thermal-energy-transfers"
      },
      {
        "syllabus": "alevel",
        "level": "Y13",
        "topicId": "alevel-sec6-further-mechanics-thermal",
        "subtopicId": "alevel-3-6-2-thermal-physics"
      },
      {
        "syllabus": "ncuk",
        "level": "IFY",
        "topicId": "ncuk-ac3",
        "subtopicId": "ncuk-ac3-3"
      }
    ],
    "format": "mcq",
    "difficulty": "standard",
    "visualFamily": "thermal",
    "stem": "During a timed run in a metallurgical vacuum-induction melting pot, a Peltier extraction module rated at 600 W with coupling efficiency 0.9 removes thermal energy on 0.55 kg of water between 333 K and 255 K. Given melting point 273.15 K, L_f = 3.34 × 10⁵ J kg⁻¹, c_s = 2100 J kg⁻¹ K⁻¹, and c_l = 4180 J kg⁻¹ K⁻¹, determine the constant-temperature arrest time.",
    "workedSolution": "Effective thermal power P_eff = η P = 0.9 × 600 = 540.0 W. Plateau latent energy Q_f = m L_f = 1.837 × 10⁵ J, giving Δt_plateau = Q_f / P_eff = 340 s.",
    "markScheme": [
      {
        "code": "A1",
        "criterion": "Uses P_eff = η P and divides required thermal energy to obtain 340 s (C).",
        "marks": 1
      }
    ],
    "totalMarks": 1,
    "conceptId": "specific-heat-latent-heat",
    "familyGroupKey": "specific-heat-latent-heat::electrical-heater-phase-change-power-time",
    "svgMarkup": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"720\" height=\"500\" viewBox=\"0 0 720 500\" role=\"img\" aria-label=\"Temperature against time phase-change graph\"><title>Temperature against time phase-change graph</title><desc>Temperature against time phase-change graph</desc><rect width=\"720\" height=\"500\" fill=\"white\"/><line x1=\"96\" y1=\"426\" x2=\"680\" y2=\"426\" stroke=\"#202429\" stroke-width=\"1.8\"/><polygon points=\"685,426 675.75,429.4 675.75,422.6\" fill=\"#202429\"/><line x1=\"96\" y1=\"426\" x2=\"96\" y2=\"34\" stroke=\"#202429\" stroke-width=\"1.8\"/><polygon points=\"96,29 99.4,38.25 92.6,38.25\" fill=\"#202429\"/><text x=\"384\" y=\"482\" text-anchor=\"middle\" font-size=\"16\" font-family=\"Arial, sans-serif\" fill=\"#15191d\">time t</text><text transform=\"translate(26 234) rotate(-90)\" text-anchor=\"middle\" font-size=\"16\" font-family=\"Arial, sans-serif\" fill=\"#15191d\">temperature T</text><line x1=\"96\" y1=\"298.704\" x2=\"279.46\" y2=\"298.704\" stroke=\"#7b8590\" stroke-width=\"1.15\" stroke-dasharray=\"5 4\"/><text x=\"88\" y=\"303.704\" text-anchor=\"end\" font-size=\"14\" font-family=\"Arial, sans-serif\" fill=\"#202429\">T_m</text><line x1=\"279.46\" y1=\"298.704\" x2=\"279.46\" y2=\"426\" stroke=\"#7b8590\" stroke-width=\"1.05\" stroke-dasharray=\"4 4\"/><text x=\"279.46\" y=\"447\" text-anchor=\"middle\" font-size=\"13\" font-family=\"Arial, sans-serif\" fill=\"#202429\">t₁</text><line x1=\"524.394\" y1=\"298.704\" x2=\"524.394\" y2=\"426\" stroke=\"#7b8590\" stroke-width=\"1.05\" stroke-dasharray=\"4 4\"/><text x=\"524.394\" y=\"447\" text-anchor=\"middle\" font-size=\"13\" font-family=\"Arial, sans-serif\" fill=\"#202429\">t₂</text><line x1=\"552.345\" y1=\"368.4\" x2=\"552.345\" y2=\"426\" stroke=\"#7b8590\" stroke-width=\"1.05\" stroke-dasharray=\"4 4\"/><text x=\"552.345\" y=\"447\" text-anchor=\"middle\" font-size=\"13\" font-family=\"Arial, sans-serif\" fill=\"#202429\">t₃</text><path d=\"M96 68.88 L279.46 298.704 L524.394 298.704 L552.345 368.4\" fill=\"none\" stroke=\"#15191d\" stroke-width=\"2.4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"96\" cy=\"68.88\" r=\"3.6\" fill=\"#15191d\"/><circle cx=\"279.46\" cy=\"298.704\" r=\"3.6\" fill=\"#15191d\"/><circle cx=\"524.394\" cy=\"298.704\" r=\"3.6\" fill=\"#15191d\"/><circle cx=\"552.345\" cy=\"368.4\" r=\"3.6\" fill=\"#15191d\"/><text x=\"187.73\" y=\"173.792\" text-anchor=\"middle\" font-size=\"12.5\" font-family=\"Arial, sans-serif\" fill=\"#4f5962\">liquid</text><text x=\"401.927\" y=\"288.704\" text-anchor=\"middle\" font-size=\"12.5\" font-family=\"Arial, sans-serif\" fill=\"#4f5962\">liquid + solid</text><text x=\"538.369\" y=\"323.552\" text-anchor=\"middle\" font-size=\"12.5\" font-family=\"Arial, sans-serif\" fill=\"#4f5962\">solid</text></svg>",
    "options": [
      {
        "label": "A",
        "text": "276 s",
        "isCorrect": false,
        "distractorRationale": "Multiplies time by efficiency η instead of dividing energy by effective power η P."
      },
      {
        "label": "B",
        "text": "306 s",
        "isCorrect": false,
        "distractorRationale": "Divides thermal energy by the nominal electrical rating P rather than the effective thermal power η P."
      },
      {
        "label": "C",
        "text": "340 s",
        "isCorrect": true
      },
      {
        "label": "D",
        "text": "634 s",
        "isCorrect": false,
        "distractorRationale": "Calculates the total multi-stage duration rather than the isothermal fusion plateau duration alone."
      }
    ],
    "correctOptionIndex": 2
  },
  {
    "id": "ga-circular-orbit-energy-str-008",
    "syllabi": [
      {
        "syllabus": "ib",
        "level": "SL",
        "topicId": "ib-theme-d",
        "subtopicId": "ib-d1-gravitational-fields"
      },
      {
        "syllabus": "alevel",
        "level": "Y13",
        "topicId": "alevel-sec7-fields-consequences",
        "subtopicId": "alevel-3-7-2-gravitational-fields"
      },
      {
        "syllabus": "ncuk",
        "level": "IFY-S2",
        "topicId": "ncuk-ac5",
        "subtopicId": "ncuk-ac5-1"
      }
    ],
    "format": "structured",
    "difficulty": "foundation",
    "visualFamily": "grav-astro",
    "stem": "A synthetic-aperture radar satellite of mass 220 kg orbits a spherical terrestrial planet of mass 3.58 × 10²⁴ kg and radius 5.1 × 10⁶ m in a circular path at constant altitude 1.79 × 10⁶ m above the surface. Take G = 6.67 × 10⁻¹¹ N m² kg⁻².",
    "workedSolution": "(a) With orbital radius r = 6.89 × 10⁶ m, g = GM/r² = 5.03 N kg⁻¹. (b) Orbital speed v = √(GM/r) = 5.89 × 10³ m s⁻¹. (c) Period T = 2πr/v = 7.35 × 10³ s.",
    "markScheme": [
      {
        "code": "M1",
        "partId": "a",
        "criterion": "Uses centre-to-centre orbital radius r in g = GM / r².",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "a",
        "criterion": "Obtains g = 5.03 N kg⁻¹.",
        "marks": 1
      },
      {
        "code": "M1",
        "partId": "b",
        "criterion": "Equates v²/r to g (or GM/r²).",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "b",
        "criterion": "Obtains v = 5.89 × 10³ m s⁻¹.",
        "marks": 1
      },
      {
        "code": "M1",
        "partId": "c",
        "criterion": "Applies T = 2πr / v or Kepler's third law.",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "c",
        "criterion": "Obtains T = 7.35 × 10³ s.",
        "marks": 1
      }
    ],
    "totalMarks": 6,
    "conceptId": "gravitational-force-field",
    "familyGroupKey": "gravitational-force-field::circular-orbit-velocity-and-kepler",
    "svgMarkup": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"720\" height=\"460\" viewBox=\"0 0 720 460\" role=\"img\" aria-label=\"Orbital mechanics and energy profile diagram\"><title>Orbital mechanics and energy profile diagram</title><desc>v; r</desc><defs><marker id=\"ga-circular-orbit-energy-str-008-arrow-dark\" viewBox=\"0 0 10 10\" refX=\"9\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto-start-reverse\"><path d=\"M 0 0 L 10 5 L 0 10 z\" fill=\"#1f2937\"/></marker><marker id=\"ga-circular-orbit-energy-str-008-arrow-blue\" viewBox=\"0 0 10 10\" refX=\"9\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto-start-reverse\"><path d=\"M 0 0 L 10 5 L 0 10 z\" fill=\"#1d4ed8\"/></marker><marker id=\"ga-circular-orbit-energy-str-008-arrow-red\" viewBox=\"0 0 10 10\" refX=\"9\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto-start-reverse\"><path d=\"M 0 0 L 10 5 L 0 10 z\" fill=\"#b91c1c\"/></marker><marker id=\"ga-circular-orbit-energy-str-008-arrow-green\" viewBox=\"0 0 10 10\" refX=\"9\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto-start-reverse\"><path d=\"M 0 0 L 10 5 L 0 10 z\" fill=\"#047857\"/></marker><marker id=\"ga-circular-orbit-energy-str-008-arrow-amber\" viewBox=\"0 0 10 10\" refX=\"9\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto-start-reverse\"><path d=\"M 0 0 L 10 5 L 0 10 z\" fill=\"#b45309\"/></marker></defs><rect width=\"720\" height=\"460\" fill=\"#ffffff\"/><g font-family=\"Arial, sans-serif\"><circle cx=\"360\" cy=\"239.2\" r=\"60.996\" fill=\"#e5e7eb\" stroke=\"#1f2937\" stroke-width=\"2\"/><text x=\"360\" y=\"243.2\" text-anchor=\"middle\" font-size=\"12\" fill=\"#1f2937\" font-weight=\"bold\">M</text><circle cx=\"360\" cy=\"239.2\" r=\"179.4\" fill=\"none\" stroke=\"#1d4ed8\" stroke-width=\"1.8\" stroke-dasharray=\"6 4\"/><circle cx=\"539.4\" cy=\"239.2\" r=\"5.5\" fill=\"#1f2937\"/><line x1=\"539.4\" y1=\"239.2\" x2=\"539.4\" y2=\"187.2\" stroke=\"#1d4ed8\" stroke-width=\"2\" marker-end=\"url(#ga-circular-orbit-energy-str-008-arrow-blue)\"/><text x=\"547.4\" y=\"193.2\" text-anchor=\"start\" font-size=\"11\" fill=\"#1d4ed8\">v</text><line x1=\"539.4\" y1=\"239.2\" x2=\"495.4\" y2=\"239.2\" stroke=\"#b91c1c\" stroke-width=\"2\" marker-end=\"url(#ga-circular-orbit-energy-str-008-arrow-red)\"/><text x=\"517.4\" y=\"254.2\" text-anchor=\"middle\" font-size=\"11\" fill=\"#b91c1c\">F_g</text><text x=\"360\" y=\"51.8\" text-anchor=\"middle\" font-size=\"12\" fill=\"#1d4ed8\">r</text></g></svg>",
    "parts": [
      {
        "partId": "a",
        "prompt": "Calculate the gravitational field strength at the satellite's orbit.",
        "marks": 2,
        "targetQuantityKey": "fieldStrengthNkg",
        "expectedAnswer": "5.03 N kg⁻¹",
        "workingSteps": [
          "r = R_p + h = 5.1 × 10⁶ + 1.79 × 10⁶ = 6.89 × 10⁶ m.",
          "g = G M / r² = (6.67 × 10⁻¹¹ × 3.58 × 10²⁴) / (6.89 × 10⁶)² = 5.03 N kg⁻¹."
        ]
      },
      {
        "partId": "b",
        "prompt": "Determine the circular orbital speed of the synthetic-aperture radar satellite.",
        "marks": 2,
        "dependsOnPartIds": [
          "a"
        ],
        "targetQuantityKey": "orbitalSpeedMs",
        "expectedAnswer": "5.89 × 10³ m s⁻¹",
        "workingSteps": [
          "Setting centripetal acceleration v² / r = g gives v = √(g r) = √(G M / r).",
          "v = 5.89 × 10³ m s⁻¹."
        ]
      },
      {
        "partId": "c",
        "prompt": "Calculate the orbital period of the synthetic-aperture radar satellite.",
        "marks": 2,
        "dependsOnPartIds": [
          "b"
        ],
        "targetQuantityKey": "orbitalPeriodS",
        "expectedAnswer": "7.35 × 10³ s",
        "workingSteps": [
          "T = 2π r / v = 2π × 6.89 × 10⁶ / 5.89 × 10³ = 7.35 × 10³ s."
        ]
      }
    ]
  },
  {
    "id": "sp-v2-em-induction-mcq-0100",
    "syllabi": [
      {
        "syllabus": "ib",
        "level": "HL",
        "topicId": "ib-theme-d",
        "subtopicId": "ib-d4-induction"
      },
      {
        "syllabus": "alevel",
        "level": "Y13",
        "topicId": "alevel-sec7-fields-consequences",
        "subtopicId": "alevel-3-7-5-magnetic-fields-induction-ac"
      },
      {
        "syllabus": "ncuk",
        "level": "IFY-S2",
        "topicId": "ncuk-ac4",
        "subtopicId": "ncuk-ac4-6"
      }
    ],
    "format": "mcq",
    "difficulty": "standard",
    "visualFamily": "em-induction",
    "stem": "Connected to a charge integrator of total loop resistance 12 Ω, a flat electromagnet pole-gap calibration search coil containing 100 turns of area 0.01 m² faces normal to a field that reverses from +0.18 T to −0.108 T in 0.08 s. What is the magnitude of the average emf induced in the coil during the reversal?",
    "workedSolution": "|ΔB| = |-0.108 − 0.18| = 0.288 T. By Faraday's law, |ε| = N|ΔB|A / Δt = (100 × 0.288 × 0.01) / 0.08 = 3.60 V.",
    "markScheme": [
      {
        "code": "A1",
        "criterion": "Evaluates |ΔB| across sign reversal to obtain |ε| = 3.60 V (C).",
        "marks": 1
      }
    ],
    "totalMarks": 1,
    "conceptId": "electromagnetic-induction-faraday-lenz",
    "familyGroupKey": "electromagnetic-induction-faraday-lenz::faraday-field-reversal-induced-charge",
    "svgMarkup": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"760\" height=\"430\" viewBox=\"0 0 760 430\" role=\"img\" aria-label=\"Magnetic flux linkage and Faraday electromagnetic induction diagram\" data-scenario-kind=\"flux-faraday\"><title>Magnetic flux linkage and Faraday electromagnetic induction diagram</title><rect width=\"760\" height=\"430\" fill=\"white\"/><defs><marker id=\"em-arrow-flux-faraday\" viewBox=\"0 0 10 10\" refX=\"8\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto\"><path d=\"M0 0L10 5L0 10Z\" fill=\"#171b1f\"/></marker></defs><g font-family=\"Arial, sans-serif\"><line x1=\"90\" y1=\"86\" x2=\"670\" y2=\"86\" stroke=\"#486581\" stroke-width=\"1.6\" marker-end=\"url(#em-arrow-flux-faraday)\"/><line x1=\"90\" y1=\"150.5\" x2=\"670\" y2=\"150.5\" stroke=\"#486581\" stroke-width=\"1.6\" marker-end=\"url(#em-arrow-flux-faraday)\"/><line x1=\"90\" y1=\"215\" x2=\"670\" y2=\"215\" stroke=\"#486581\" stroke-width=\"1.6\" marker-end=\"url(#em-arrow-flux-faraday)\"/><line x1=\"90\" y1=\"279.5\" x2=\"670\" y2=\"279.5\" stroke=\"#486581\" stroke-width=\"1.6\" marker-end=\"url(#em-arrow-flux-faraday)\"/><line x1=\"90\" y1=\"344\" x2=\"670\" y2=\"344\" stroke=\"#486581\" stroke-width=\"1.6\" marker-end=\"url(#em-arrow-flux-faraday)\"/><line x1=\"380\" y1=\"139.6\" x2=\"380\" y2=\"307.6\" stroke=\"#171b1f\" stroke-width=\"5\" stroke-linecap=\"round\"/><line x1=\"380\" y1=\"223.6\" x2=\"476\" y2=\"223.6\" stroke=\"#171b1f\" stroke-width=\"1.8\" stroke-dasharray=\"5 4\" marker-end=\"url(#em-arrow-flux-faraday)\"/><text x=\"486\" y=\"219.6\" font-size=\"14\" font-style=\"italic\" fill=\"#171b1f\">n̂</text><text x=\"90\" y=\"52\" font-size=\"14\" fill=\"#171b1f\">N = 100,  A = 0.0100 m²</text><text x=\"670\" y=\"52\" text-anchor=\"end\" font-size=\"14\" fill=\"#171b1f\">B₁ → B₂ in Δt = 80.0 ms</text></g></svg>",
    "options": [
      {
        "label": "A",
        "text": "0.300 V",
        "isCorrect": false,
        "distractorRationale": "Divides emf by resistance R, reporting induced current instead of induced emf."
      },
      {
        "label": "B",
        "text": "0.900 V",
        "isCorrect": false,
        "distractorRationale": "Subtracts the field magnitudes |B₁| − |B₂| instead of taking the signed vector difference |B₂ − B₁|."
      },
      {
        "label": "C",
        "text": "3.60 V",
        "isCorrect": true
      },
      {
        "label": "D",
        "text": "2.25 V",
        "isCorrect": false,
        "distractorRationale": "Treats the field as dropping only to zero (ΔB = B₁) rather than reversing sign to B₂."
      }
    ],
    "correctOptionIndex": 2
  },
  {
    "id": "sp-qn-structured-245",
    "syllabi": [
      {
        "syllabus": "ib",
        "level": "SL",
        "topicId": "ib-theme-e",
        "subtopicId": "ib-e4-fission"
      },
      {
        "syllabus": "alevel",
        "level": "Y13",
        "topicId": "alevel-sec8-nuclear-physics",
        "subtopicId": "alevel-3-8-nuclear-decay-energy"
      },
      {
        "syllabus": "ncuk",
        "level": "IFY-S2",
        "topicId": "ncuk-ac7",
        "subtopicId": "ncuk-ac7-3"
      }
    ],
    "format": "structured",
    "difficulty": "foundation",
    "visualFamily": "quantum-nuclear",
    "stem": "A nuclear data benchmark for a blanket-breeding fusion energetics calculation specifies lithium-6 nucleus (6.013477 u) + deuteron (2.013553 u) → 2 alpha particles (each of mass 4.001506 u) (with mass-energy equivalent u = 931.5 MeV c⁻² and e = 1.60 × 10⁻¹⁹ C).",
    "workedSolution": "(a) Δm = Σm_reactants − Σm_products = 0.0240 u. Final answer: 0.0240 u. (b) Q = 0.0240 × 931.5 = 22.4 MeV. Final answer: 22.4 MeV. (c) Total nucleon number A = 8. Final answer: 8.",
    "markScheme": [
      {
        "code": "M1",
        "partId": "a",
        "criterion": "Sums all reactant and product rest masses including particle multiplicities.",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "a",
        "criterion": "Evaluates correctly to 0.0240 u.",
        "marks": 1
      },
      {
        "code": "M1",
        "partId": "b",
        "criterion": "Multiplies Δm in u by 931.5 MeV u⁻¹.",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "b",
        "criterion": "Evaluates correctly to 22.4 MeV.",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "c",
        "criterion": "Sums nucleon numbers across reactants (or products) to obtain 8.",
        "marks": 1
      }
    ],
    "totalMarks": 5,
    "conceptId": "nuclear-fission-fusion",
    "familyGroupKey": "nuclear-fission-fusion::fission-fusion-reaction-q-value",
    "svgMarkup": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"720\" height=\"460\" viewBox=\"0 0 720 460\" role=\"img\" aria-label=\"Mass-energy comparison between nuclear states\"><title>Nuclear mass-energy balance diagram</title><desc>Comparison of rest mass-energy before and after nuclear binding or reaction</desc><defs><marker id=\"qn-nb-arrow-nuclear-binding\" viewBox=\"0 0 10 10\" refX=\"8\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto\"><path d=\"M0 0L10 5L0 10Z\" fill=\"#0f172a\"/></marker></defs><rect width=\"720\" height=\"460\" fill=\"#ffffff\"/><g font-family=\"Arial, Helvetica, sans-serif\"><text x=\"360\" y=\"30\" text-anchor=\"middle\" font-size=\"15\" font-weight=\"700\" fill=\"#0f172a\">Nuclear mass–energy balance</text><line x1=\"110\" y1=\"96\" x2=\"250\" y2=\"96\" stroke=\"#0f172a\" stroke-width=\"3\"/><text x=\"180\" y=\"84\" text-anchor=\"middle\" font-size=\"13\" font-weight=\"600\" fill=\"#0f172a\">Reactants</text><line x1=\"470\" y1=\"364\" x2=\"610\" y2=\"364\" stroke=\"#1d4ed8\" stroke-width=\"3\"/><text x=\"540\" y=\"386\" text-anchor=\"middle\" font-size=\"13\" font-weight=\"600\" fill=\"#1d4ed8\">Products</text><line x1=\"250\" y1=\"96\" x2=\"506\" y2=\"96\" stroke=\"#94a3b8\" stroke-width=\"1.2\" stroke-dasharray=\"5 4\"/><line x1=\"494\" y1=\"96\" x2=\"494\" y2=\"360\" stroke=\"#dc2626\" stroke-width=\"2.2\" marker-end=\"url(#qn-nb-arrow-nuclear-binding)\"/><text x=\"506\" y=\"234\" font-size=\"13\" font-weight=\"700\" fill=\"#dc2626\">Q = Δm c²</text></g></svg>",
    "parts": [
      {
        "partId": "a",
        "prompt": "Calculate the rest-mass decrease Δm, in atomic mass units (u), for one fusion event.",
        "marks": 2,
        "targetQuantityKey": "massDifferenceU",
        "expectedAnswer": "0.0240 u",
        "workingSteps": [
          "Δm = Σm_reactants − Σm_products = 0.0240 u."
        ]
      },
      {
        "partId": "b",
        "prompt": "Determine the nuclear energy released Q, in MeV.",
        "marks": 2,
        "dependsOnPartIds": [
          "a"
        ],
        "targetQuantityKey": "qValueMeV",
        "expectedAnswer": "22.4 MeV",
        "workingSteps": [
          "Q = 0.0240 × 931.5 = 22.4 MeV."
        ]
      },
      {
        "partId": "c",
        "prompt": "State the total nucleon number conserved on each side of this fusion equation.",
        "marks": 1,
        "targetQuantityKey": "totalReactantA",
        "expectedAnswer": "8",
        "workingSteps": [
          "Total nucleon number A = 8."
        ]
      }
    ]
  },
  {
    "id": "sp-graphs-0193-struct",
    "syllabi": [
      {
        "syllabus": "ib",
        "level": "SL",
        "topicId": "ib-theme-a",
        "subtopicId": "ib-a1-kinematics"
      },
      {
        "syllabus": "alevel",
        "level": "Y12",
        "topicId": "alevel-sec4-mechanics-materials",
        "subtopicId": "alevel-3-4-1-force-energy-momentum"
      },
      {
        "syllabus": "ncuk",
        "level": "IFY-S1",
        "topicId": "ncuk-ac2",
        "subtopicId": "ncuk-ac2-1"
      }
    ],
    "format": "structured",
    "difficulty": "foundation",
    "visualFamily": "cartesian_plot",
    "stem": "In a laboratory motion trial, a robotic warehouse retrieval carriage travels along a straight aisle rail with forward taken as positive. The velocity–time graph records its motion from t = 0.0 s to t = 12.0 s, including uniform reversal thrust from t = 6.0 s to t = 10.0 s.",
    "workedSolution": "(a) Zero-velocity crossing is at t = 9 s. Positive area = 108 m and unsigned negative area = 15.0 m, giving total distance = 123 m. (b) Net displacement = 108 − 15.0 = 93.0 m; average velocity = 93.0 / 12 = 7.75 m s⁻¹. (c) Acceleration = (−6 − 18) / (10 − 6) = -6.00 m s⁻².",
    "markScheme": [
      {
        "code": "M1",
        "partId": "a",
        "criterion": "Finds zero-crossing t = 9 s and evaluates both unsigned areas (108 m and 15.0 m).",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "a",
        "criterion": "Obtains total distance = 123 m.",
        "marks": 1
      },
      {
        "code": "M1",
        "partId": "b",
        "criterion": "Subtracts areas for net displacement (93.0 m) and divides by 12 s.",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "b",
        "criterion": "Obtains average velocity = 7.75 m s⁻¹.",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "c",
        "criterion": "Obtains acceleration = -6.00 m s⁻² including negative sign.",
        "marks": 1
      }
    ],
    "totalMarks": 5,
    "conceptId": "motion-graphs",
    "familyGroupKey": "motion-graphs::vt-signed-rebound-distance",
    "svgMarkup": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"720\" height=\"500\" viewBox=\"0 0 720 500\" role=\"img\" aria-label=\"velocity / m s⁻¹ against time / s\"><rect width=\"720\" height=\"500\" fill=\"white\"/><defs><clipPath id=\"plot-sp-graphs-0193-struct-figure\"><rect x=\"112\" y=\"38\" width=\"528\" height=\"378\"/></clipPath></defs><path d=\"M112 38V416\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M156 38V416\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M200 38V416\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M244 38V416\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M288 38V416\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M332 38V416\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M376 38V416\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M420 38V416\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M464 38V416\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M508 38V416\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M552 38V416\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M596 38V416\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M640 38V416\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M112 400.25H640\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M112 360.875H640\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M112 321.5H640\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M112 282.125H640\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M112 242.75H640\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M112 203.375H640\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M112 164H640\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M112 124.625H640\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M112 85.25H640\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M112 45.875H640\" stroke=\"#d9dde1\" stroke-width=\"0.7\"/><path d=\"M112 38V416\" stroke=\"#a0a7ad\" stroke-width=\"1\"/><path d=\"M200 38V416\" stroke=\"#a0a7ad\" stroke-width=\"1\"/><path d=\"M288 38V416\" stroke=\"#a0a7ad\" stroke-width=\"1\"/><path d=\"M376 38V416\" stroke=\"#a0a7ad\" stroke-width=\"1\"/><path d=\"M464 38V416\" stroke=\"#a0a7ad\" stroke-width=\"1\"/><path d=\"M552 38V416\" stroke=\"#a0a7ad\" stroke-width=\"1\"/><path d=\"M640 38V416\" stroke=\"#a0a7ad\" stroke-width=\"1\"/><path d=\"M112 400.25H640\" stroke=\"#a0a7ad\" stroke-width=\"1\"/><path d=\"M112 321.5H640\" stroke=\"#a0a7ad\" stroke-width=\"1\"/><path d=\"M112 242.75H640\" stroke=\"#a0a7ad\" stroke-width=\"1\"/><path d=\"M112 164H640\" stroke=\"#a0a7ad\" stroke-width=\"1\"/><path d=\"M112 85.25H640\" stroke=\"#a0a7ad\" stroke-width=\"1\"/><path d=\"M112 321.5H640\" fill=\"none\" stroke=\"#202429\" stroke-width=\"1.7\"/><path d=\"M112 416V38\" fill=\"none\" stroke=\"#202429\" stroke-width=\"1.7\"/><path d=\"M112 316.5v10\" stroke=\"#202429\"/><text x=\"112\" y=\"347.5\" text-anchor=\"middle\" font-size=\"17\" font-family=\"Arial, sans-serif\">0</text><path d=\"M200 316.5v10\" stroke=\"#202429\"/><text x=\"200\" y=\"347.5\" text-anchor=\"middle\" font-size=\"17\" font-family=\"Arial, sans-serif\">2</text><path d=\"M288 316.5v10\" stroke=\"#202429\"/><text x=\"288\" y=\"347.5\" text-anchor=\"middle\" font-size=\"17\" font-family=\"Arial, sans-serif\">4</text><path d=\"M376 316.5v10\" stroke=\"#202429\"/><text x=\"376\" y=\"347.5\" text-anchor=\"middle\" font-size=\"17\" font-family=\"Arial, sans-serif\">6</text><path d=\"M464 316.5v10\" stroke=\"#202429\"/><text x=\"464\" y=\"347.5\" text-anchor=\"middle\" font-size=\"17\" font-family=\"Arial, sans-serif\">8</text><path d=\"M552 316.5v10\" stroke=\"#202429\"/><text x=\"552\" y=\"347.5\" text-anchor=\"middle\" font-size=\"17\" font-family=\"Arial, sans-serif\">10</text><path d=\"M640 316.5v10\" stroke=\"#202429\"/><text x=\"640\" y=\"347.5\" text-anchor=\"middle\" font-size=\"17\" font-family=\"Arial, sans-serif\">12</text><path d=\"M107 400.25h10\" stroke=\"#202429\"/><text x=\"100\" y=\"406.2\" text-anchor=\"end\" font-size=\"17\" font-family=\"Arial, sans-serif\">-5</text><path d=\"M107 321.5h10\" stroke=\"#202429\"/><text x=\"100\" y=\"327.45\" text-anchor=\"end\" font-size=\"17\" font-family=\"Arial, sans-serif\">0</text><path d=\"M107 242.75h10\" stroke=\"#202429\"/><text x=\"100\" y=\"248.7\" text-anchor=\"end\" font-size=\"17\" font-family=\"Arial, sans-serif\">5</text><path d=\"M107 164h10\" stroke=\"#202429\"/><text x=\"100\" y=\"169.95\" text-anchor=\"end\" font-size=\"17\" font-family=\"Arial, sans-serif\">10</text><path d=\"M107 85.25h10\" stroke=\"#202429\"/><text x=\"100\" y=\"91.2\" text-anchor=\"end\" font-size=\"17\" font-family=\"Arial, sans-serif\">15</text><path d=\"M112 321.5 L244 38 L376 38 L552 416 L640 416\" fill=\"none\" stroke=\"#15191d\" stroke-width=\"2.2\" stroke-linejoin=\"round\" stroke-linecap=\"round\" clip-path=\"url(#plot-sp-graphs-0193-struct-figure)\"/><text x=\"376\" y=\"480\" text-anchor=\"middle\" font-size=\"20\" font-family=\"Arial, sans-serif\">time / s</text><text transform=\"translate(28 227) rotate(-90)\" text-anchor=\"middle\" font-size=\"20\" font-family=\"Arial, sans-serif\">velocity / m s⁻¹</text></svg>",
    "parts": [
      {
        "partId": "a",
        "prompt": "Calculate the total distance travelled between t = 0.0 s and t = 12.0 s.",
        "marks": 2,
        "targetQuantityKey": "unsignedArea",
        "expectedAnswer": "123 m",
        "workingSteps": [
          "Velocity crosses zero at t = 9 s; forward area = 108 m.",
          "Unsigned reverse area = 15.0 m, so total distance = 108 + 15.0 = 123 m."
        ]
      },
      {
        "partId": "b",
        "prompt": "Determine the net displacement and hence calculate the average velocity over the 12.0 s interval.",
        "marks": 2,
        "dependsOnPartIds": [
          "a"
        ],
        "targetQuantityKey": "meanRate",
        "expectedAnswer": "7.75 m s⁻¹",
        "workingSteps": [
          "Net displacement Δs = 108 − 15.0 = 93.0 m.",
          "Average velocity = Δs / Δt = 93.0 / 12 = 7.75 m s⁻¹."
        ]
      },
      {
        "partId": "c",
        "prompt": "Calculate the acceleration between t = 6.0 s and t = 10.0 s.",
        "marks": 1,
        "targetQuantityKey": "gradient",
        "expectedAnswer": "-6.00 m s⁻²",
        "workingSteps": [
          "a = (−6 − 18) / (10 − 6) = -6.00 m s⁻²."
        ]
      }
    ]
  },
  {
    "id": "sp-circuits-09-mcq-176",
    "syllabi": [
      {
        "syllabus": "ib",
        "level": "SL",
        "topicId": "ib-theme-b",
        "subtopicId": "ib-b5-current-circuits"
      },
      {
        "syllabus": "alevel",
        "level": "Y13",
        "topicId": "alevel-sec5-electricity",
        "subtopicId": "alevel-3-5-1-current-electricity"
      },
      {
        "syllabus": "ncuk",
        "level": "IFY-S1",
        "topicId": "ncuk-ac4",
        "subtopicId": "ncuk-ac4-3"
      }
    ],
    "format": "mcq",
    "difficulty": "foundation",
    "visualFamily": "circuit_network",
    "stem": "During a variable-resistor cell characterisation practical (modelled by source V with internal and load resistances R in series), terminal p.d. is 23.4 V at current 1.2 A and drops to 10.2 V when current increases to 5.6 A. What is the internal resistance of the source?",
    "workedSolution": "Using V = ε − I r, internal resistance r = (V_1 − V_2)/(I_2 − I_1) = (23.4 − 10.2)/(5.6 − 1.2) = 3.00 Ω. Substituting back gives ε = V_1 + I_1 r = 23.4 + (1.2)(3.00) = 27.0 V.",
    "markScheme": [
      {
        "code": "A1",
        "criterion": "Solves simultaneous V = ε − I r equations to obtain 3.00 Ω.",
        "marks": 1
      }
    ],
    "totalMarks": 1,
    "conceptId": "emf-internal-resistance",
    "familyGroupKey": "emf-internal-resistance::two-point-vi-emf-internal-resistance",
    "svgMarkup": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"760\" height=\"500\" viewBox=\"0 0 760 500\" role=\"img\" aria-label=\"Circuit diagram with 3 components\"><rect width=\"760\" height=\"500\" fill=\"white\"/><defs><marker id=\"circuit-arrow-sp-circuits-09-mcq-176-figure\" viewBox=\"0 0 10 10\" refX=\"8\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto\"><path d=\"M0 0L10 5L0 10Z\" fill=\"#171b1f\"/></marker></defs><path data-wire-id=\"sp-circuits-09-mcq-176-figure-main-wire-1\" d=\"M101.12 142.021818L101.12 250\" fill=\"none\" stroke=\"#171b1f\" stroke-width=\"2\"/><path data-wire-id=\"sp-circuits-09-mcq-176-figure-main-wire-2\" d=\"M101.12 250L101.12 357.978182\" fill=\"none\" stroke=\"#171b1f\" stroke-width=\"2\"/><path data-wire-id=\"sp-circuits-09-mcq-176-figure-main-wire-3\" d=\"M658.88 142.021818L658.88 250\" fill=\"none\" stroke=\"#171b1f\" stroke-width=\"2\"/><path data-wire-id=\"sp-circuits-09-mcq-176-figure-main-wire-4\" d=\"M658.88 250L658.88 357.978182\" fill=\"none\" stroke=\"#171b1f\" stroke-width=\"2\"/><path d=\"M101.12 142.021818L370 142.021818M390 142.021818L658.88 142.021818\" fill=\"none\" stroke=\"#171b1f\" stroke-width=\"2\"/><g transform=\"translate(380 142.021818) rotate(0)\"><g data-component-id=\"supply\" data-component-kind=\"cell\"><path d=\"M-6 -22V22M7 -13V13\" stroke=\"#171b1f\" stroke-width=\"2\"/></g></g><text x=\"380\" y=\"178.021818\" text-anchor=\"middle\" font-size=\"18\" font-family=\"Arial, sans-serif\">V</text><path d=\"M101.12 357.978182L200.56 357.978182M280.56 357.978182L380 357.978182\" fill=\"none\" stroke=\"#171b1f\" stroke-width=\"2\"/><g transform=\"translate(240.56 357.978182) rotate(0)\"><rect data-component-id=\"r1\" data-component-kind=\"resistor\" x=\"-38\" y=\"-14\" width=\"76\" height=\"28\" fill=\"white\" stroke=\"#171b1f\" stroke-width=\"2\"/></g><text x=\"240.56\" y=\"393.978182\" text-anchor=\"middle\" font-size=\"18\" font-family=\"Arial, sans-serif\">R</text><path d=\"M380 357.978182L479.44 357.978182M559.44 357.978182L658.88 357.978182\" fill=\"none\" stroke=\"#171b1f\" stroke-width=\"2\"/><g transform=\"translate(519.44 357.978182) rotate(0)\"><rect data-component-id=\"r2\" data-component-kind=\"resistor\" x=\"-38\" y=\"-14\" width=\"76\" height=\"28\" fill=\"white\" stroke=\"#171b1f\" stroke-width=\"2\"/></g><text x=\"519.44\" y=\"393.978182\" text-anchor=\"middle\" font-size=\"18\" font-family=\"Arial, sans-serif\">R</text></svg>",
    "options": [
      {
        "label": "A",
        "text": "0.333 Ω",
        "isCorrect": false,
        "distractorRationale": "Inverts the gradient to calculate |ΔI / ΔV| instead of |ΔV / ΔI|."
      },
      {
        "label": "B",
        "text": "3.00 Ω",
        "isCorrect": true
      },
      {
        "label": "C",
        "text": "4.94 Ω",
        "isCorrect": false,
        "distractorRationale": "Divides the sum of voltages by the sum of currents instead of evaluating the magnitude of the V–I gradient."
      },
      {
        "label": "D",
        "text": "19.5 Ω",
        "isCorrect": false,
        "distractorRationale": "Computes static ratio V_1 / I_1 (19.5 Ω), which is the external load resistance at the first setting rather than internal resistance."
      }
    ],
    "correctOptionIndex": 1
  },
  {
    "id": "sp-fields-struct-0330",
    "syllabi": [
      {
        "syllabus": "ib",
        "level": "HL",
        "topicId": "ib-theme-d",
        "subtopicId": "ib-d2-electric-magnetic-fields"
      },
      {
        "syllabus": "alevel",
        "level": "Y13",
        "topicId": "alevel-sec7-fields-consequences",
        "subtopicId": "alevel-3-7-3-electric-fields"
      },
      {
        "syllabus": "ncuk",
        "level": "IFY-S2",
        "topicId": "ncuk-ac4",
        "subtopicId": "ncuk-ac4-5"
      }
    ],
    "format": "structured",
    "difficulty": "higher",
    "visualFamily": "field_map",
    "stem": "Within an evacuated target chamber at a tandem accelerator, a stationary tungsten target nucleus (charge +74e) repels an incoming alpha particle (charge +2e) that momentarily comes to rest at separation 4.4 × 10⁻¹⁴ m. Take k = 8.99 × 10⁹ N m² C⁻², e = 1.60 × 10⁻¹⁹ C, and zero electric potential at infinity.",
    "workedSolution": "(a) V = kZe / r_min = 2.42 × 10⁶ V. (b) E_p = 2eV = 7.74 × 10⁻¹³ J. (c) Dividing by e = 1.60 × 10⁻¹⁹ J eV⁻¹ gives 4.84 × 10⁶ eV.",
    "markScheme": [
      {
        "code": "M1",
        "partId": "a",
        "criterion": "Substitutes Q = 74e and r_min = 4.4 × 10⁻¹⁴ m into V = kQ/r.",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "a",
        "criterion": "Obtains 2.42 × 10⁶ V.",
        "marks": 1
      },
      {
        "code": "M1",
        "partId": "b",
        "criterion": "Multiplies potential from (a) by projectile charge 2e.",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "b",
        "criterion": "Obtains 7.74 × 10⁻¹³ J.",
        "marks": 1
      },
      {
        "code": "M1",
        "partId": "c",
        "criterion": "Divides joule energy by 1.60 × 10⁻¹⁹ J eV⁻¹ (or multiplies V in volts by z).",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "c",
        "criterion": "Obtains 4.84 × 10⁶ eV.",
        "marks": 1
      }
    ],
    "totalMarks": 6,
    "conceptId": "electric-potential-equipotentials",
    "familyGroupKey": "electric-potential-equipotentials::coulomb-nuclear-potential-barrier",
    "svgMarkup": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"800\" height=\"500\" viewBox=\"0 0 800 500\" role=\"img\" aria-label=\"Field diagram with 2 source or marker entities\"><rect width=\"800\" height=\"500\" fill=\"white\"/><defs><marker id=\"field-arrow-sp-fields-struct-0330-figure\" viewBox=\"0 0 10 10\" refX=\"8\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto\"><path d=\"M0 0L10 5L0 10Z\" fill=\"#171b1f\"/></marker><marker id=\"field-reverse-arrow-sp-fields-struct-0330-figure\" viewBox=\"0 0 10 10\" refX=\"2\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto\"><path d=\"M10 0L0 5L10 10Z\" fill=\"#59656c\"/></marker></defs><path data-path-id=\"baseline\" d=\"M107.68 233.84L706.24 233.84\" fill=\"none\" stroke=\"#59656c\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-dasharray=\"8 6\"/><path data-path-id=\"total\" d=\"M177.28 363.12L622.72 363.12\" fill=\"none\" stroke=\"#59656c\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" marker-start=\"url(#field-reverse-arrow-sp-fields-struct-0330-figure)\" marker-end=\"url(#field-arrow-sp-fields-struct-0330-figure)\"/><text x=\"400\" y=\"354.12\" text-anchor=\"middle\" font-size=\"15\" font-family=\"Arial, sans-serif\">d</text><path data-path-id=\"dimension-extension-1\" d=\"M177.28 245.96L177.28 375.24\" fill=\"none\" stroke=\"#59656c\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path data-path-id=\"dimension-extension-2\" d=\"M622.72 245.96L622.72 375.24\" fill=\"none\" stroke=\"#59656c\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><g data-entity-id=\"left-charge\"><circle cx=\"177.28\" cy=\"233.84\" r=\"18\" fill=\"white\" stroke=\"#171b1f\" stroke-width=\"2\"/><text x=\"177.28\" y=\"239.84\" text-anchor=\"middle\" font-size=\"20\" font-family=\"Arial, sans-serif\">+</text><text x=\"177.28\" y=\"262.84\" text-anchor=\"middle\" font-size=\"17\" font-family=\"Arial, sans-serif\">q₁</text></g><g data-entity-id=\"right-charge\"><circle cx=\"622.72\" cy=\"233.84\" r=\"18\" fill=\"white\" stroke=\"#171b1f\" stroke-width=\"2\"/><text x=\"622.72\" y=\"239.84\" text-anchor=\"middle\" font-size=\"20\" font-family=\"Arial, sans-serif\">+</text><text x=\"622.72\" y=\"262.84\" text-anchor=\"middle\" font-size=\"17\" font-family=\"Arial, sans-serif\">q₂</text></g></svg>",
    "parts": [
      {
        "partId": "a",
        "prompt": "Calculate the electric potential due to the tungsten nucleus at distance r_min.",
        "marks": 2,
        "targetQuantityKey": "potentialV",
        "expectedAnswer": "2.42 × 10⁶ V",
        "workingSteps": [
          "V = kZe / r_min = (8.99 × 10⁹ × 74 × 1.60 × 10⁻¹⁹) / (4.4 × 10⁻¹⁴).",
          "V = 2.42 × 10⁶ V."
        ]
      },
      {
        "partId": "b",
        "prompt": "Calculate the electrostatic potential energy (in joules) of the alpha particle at closest approach.",
        "marks": 2,
        "dependsOnPartIds": [
          "a"
        ],
        "targetQuantityKey": "barrierJ",
        "expectedAnswer": "7.74 × 10⁻¹³ J",
        "workingSteps": [
          "E_p = (+2e) V = 2 × 1.60 × 10⁻¹⁹ × 2.42 × 10⁶ V = 7.74 × 10⁻¹³ J."
        ]
      },
      {
        "partId": "c",
        "prompt": "Express this electrostatic potential energy in electronvolts (eV).",
        "marks": 2,
        "dependsOnPartIds": [
          "b"
        ],
        "targetQuantityKey": "barrierEv",
        "expectedAnswer": "4.84 × 10⁶ eV",
        "workingSteps": [
          "E_p (in eV) = E_p (in J) / (1.60 × 10⁻¹⁹ J eV⁻¹) = 4.84 × 10⁶ eV."
        ]
      }
    ]
  },
  {
    "id": "sp-mech-mcq-0329",
    "syllabi": [
      {
        "syllabus": "ib",
        "level": "SL",
        "topicId": "ib-theme-a",
        "subtopicId": "ib-a2-forces-momentum"
      },
      {
        "syllabus": "alevel",
        "level": "Y13",
        "topicId": "alevel-sec4-mechanics-materials",
        "subtopicId": "alevel-3-4-1-force-energy-momentum"
      },
      {
        "syllabus": "ncuk",
        "level": "IFY-S1",
        "topicId": "ncuk-ac2",
        "subtopicId": "ncuk-ac2-6"
      }
    ],
    "format": "mcq",
    "difficulty": "foundation",
    "visualFamily": "mechanics_scene",
    "stem": "Along a polished ice test channel, sled X of mass 2 kg travelling right at 8 m s⁻¹ meets sled Y of mass 3 kg travelling left at 3 m s⁻¹ (not drawn). After impact sled Y rebounds right at 4 m s⁻¹. What is the post-collision velocity of sled X?",
    "workedSolution": "Taking rightward as positive: p_before = (2)(8) + (3)(−3) = 7.00 kg m s⁻¹. From p_before = (2)v_X + (3)(4), v_X = -2.50 m s⁻¹, which is 2.50 m s⁻¹ to the left.",
    "markScheme": [
      {
        "code": "A1",
        "criterion": "Uses signed head-on momentum p_before = 7.00 kg m s⁻¹ to obtain 2.50 m s⁻¹ to the left (D).",
        "marks": 1
      }
    ],
    "totalMarks": 1,
    "conceptId": "linear-momentum-impulse",
    "familyGroupKey": "linear-momentum-impulse::head-on-signed-momentum-conservation",
    "svgMarkup": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"620\" height=\"430\" viewBox=\"0 0 620 430\" role=\"img\"><title>Mechanics diagram</title><desc>X, 2 kg; Y, 3 kg; 8 m s⁻¹</desc><defs><marker id=\"mechanics-arrow-sp-mech-mcq-0329-figure\" viewBox=\"0 0 10 10\" refX=\"9\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto-start-reverse\"><path d=\"M 0 0 L 10 5 L 0 10 z\"/></marker></defs><g font-family=\"Arial, sans-serif\" font-size=\"15\"><polyline points=\"158.8,262.6 461.2,262.6\" fill=\"none\" stroke=\"#202020\" stroke-width=\"2\"/><g transform=\"translate(230.8 241) rotate(0)\"><rect x=\"-19\" y=\"-13\" width=\"38\" height=\"26\" fill=\"white\" stroke=\"#202020\" stroke-width=\"2\"/><circle cx=\"-12\" cy=\"17\" r=\"4\"/><circle cx=\"12\" cy=\"17\" r=\"4\"/></g><text x=\"230.8\" y=\"216\" text-anchor=\"middle\">X, 2 kg</text><g transform=\"translate(392.8 241) rotate(0)\"><rect x=\"-19\" y=\"-13\" width=\"38\" height=\"26\" fill=\"white\" stroke=\"#202020\" stroke-width=\"2\"/><circle cx=\"-12\" cy=\"17\" r=\"4\"/><circle cx=\"12\" cy=\"17\" r=\"4\"/></g><text x=\"392.8\" y=\"216\" text-anchor=\"middle\">Y, 3 kg</text><line x1=\"230.8\" y1=\"241\" x2=\"313.6\" y2=\"241\" stroke=\"#202020\" stroke-width=\"2\" marker-end=\"url(#mechanics-arrow-sp-mech-mcq-0329-figure)\"/><text x=\"313.6\" y=\"229\" text-anchor=\"middle\">8 m s⁻¹</text><text x=\"310\" y=\"418\" text-anchor=\"middle\" font-size=\"12\">Diagrams not to scale</text></g></svg>",
    "options": [
      {
        "label": "A",
        "text": "2.50 m s⁻¹ to the right",
        "isCorrect": false,
        "distractorRationale": "Computes the correct post-collision speed magnitude for X but reverses its direction."
      },
      {
        "label": "B",
        "text": "6.50 m s⁻¹ to the right",
        "isCorrect": false,
        "distractorRationale": "Adds initial momentum magnitudes m_X |u_X| + m_Y |u_Y| instead of assigning a negative sign to Y's leftward approach velocity."
      },
      {
        "label": "C",
        "text": "9.50 m s⁻¹ to the right",
        "isCorrect": false,
        "distractorRationale": "Commits a sign error on Y's post-collision rightward momentum when rearranging for v_X."
      },
      {
        "label": "D",
        "text": "2.50 m s⁻¹ to the left",
        "isCorrect": true
      }
    ],
    "correctOptionIndex": 3
  },
  {
    "id": "waves-malus-polarization-structured-303",
    "syllabi": [
      {
        "syllabus": "alevel",
        "level": "Y12",
        "topicId": "alevel-sec3-waves",
        "subtopicId": "alevel-3-3-1-progressive-stationary-waves"
      },
      {
        "syllabus": "ncuk",
        "level": "IFY",
        "topicId": "ncuk-ac6",
        "subtopicId": "ncuk-ac6-2"
      }
    ],
    "format": "structured",
    "difficulty": "foundation",
    "visualFamily": "waves",
    "stem": "Linearly polarized waves of intensity 240 W m⁻² on a laser power-attenuation stage feeding a calibrated silicon photodiode detector pass normally through an ideal analyzer oriented at θ = 60° relative to the incident polarization axis (where I = I₀ cos²θ).",
    "workedSolution": "(a) E / E₀ = cos(60°) = 0.500. (b) I = I₀ cos²(60°) = 60.0 W m⁻². (c) Absorbed intensity = 240 − 60.0 = 180 W m⁻².",
    "markScheme": [
      {
        "code": "M1",
        "partId": "a",
        "criterion": "Projects electric-field vector via E / E₀ = cos θ.",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "a",
        "criterion": "Obtains 0.500.",
        "marks": 1
      },
      {
        "code": "M1",
        "partId": "b",
        "criterion": "Applies I = I₀ cos²θ.",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "b",
        "criterion": "Obtains I = 60.0 W m⁻².",
        "marks": 1
      },
      {
        "code": "M1",
        "partId": "c",
        "criterion": "Subtracts transmitted intensity from incident intensity.",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "c",
        "criterion": "Obtains 180 W m⁻².",
        "marks": 1
      }
    ],
    "totalMarks": 6,
    "conceptId": "progressive-waves-polarization",
    "familyGroupKey": "progressive-waves-polarization::malus-polarized-analyzer-transmission",
    "svgMarkup": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"680\" height=\"420\" viewBox=\"0 0 680 420\" role=\"img\" aria-label=\"Malus&apos;s law polarization diagram\"><title>Malus&apos;s law polarization diagram</title><desc>I₀ = 240 W m⁻²; I; θ</desc><defs><marker id=\"waves-arrow-waves-malus-polarization-structu\" viewBox=\"0 0 10 10\" refX=\"8.5\" refY=\"5\" markerWidth=\"6\" markerHeight=\"6\" orient=\"auto-start-reverse\"><path d=\"M 0 0.5 L 10 5 L 0 9.5 z\" fill=\"#1f2937\"/></marker></defs><rect x=\"0\" y=\"0\" width=\"680\" height=\"420\" fill=\"#ffffff\"/><g font-family=\"Arial, Helvetica, sans-serif\" font-size=\"13\"><line x1=\"42\" y1=\"227\" x2=\"360\" y2=\"227\" stroke=\"#6b7280\" stroke-width=\"1.5\" stroke-dasharray=\"5 4\" marker-end=\"url(#waves-arrow-waves-malus-polarization-structu)\"/><line x1=\"82\" y1=\"189\" x2=\"82\" y2=\"265\" stroke=\"#2563eb\" stroke-width=\"2\" marker-start=\"url(#waves-arrow-waves-malus-polarization-structu)\" marker-end=\"url(#waves-arrow-waves-malus-polarization-structu)\"/><line x1=\"122\" y1=\"189\" x2=\"122\" y2=\"265\" stroke=\"#2563eb\" stroke-width=\"2\" marker-start=\"url(#waves-arrow-waves-malus-polarization-structu)\" marker-end=\"url(#waves-arrow-waves-malus-polarization-structu)\"/><text x=\"90\" y=\"171\" text-anchor=\"middle\" font-size=\"12.5\" font-weight=\"600\" fill=\"#1d4ed8\">I₀ = 240 W m⁻²</text><ellipse cx=\"196\" cy=\"227\" rx=\"16\" ry=\"54\" fill=\"#fef2f2\" stroke=\"#991b1b\" stroke-width=\"2\"/><line x1=\"187.3397\" y1=\"248\" x2=\"204.6603\" y2=\"206\" stroke=\"#b91c1c\" stroke-width=\"2\"/><text x=\"196\" y=\"299\" text-anchor=\"middle\" font-size=\"12\" font-weight=\"600\" fill=\"#991b1b\">Analyzer A</text><line x1=\"278\" y1=\"208\" x2=\"278\" y2=\"246\" stroke=\"#059669\" stroke-width=\"2.2\" marker-start=\"url(#waves-arrow-waves-malus-polarization-structu)\" marker-end=\"url(#waves-arrow-waves-malus-polarization-structu)\"/><text x=\"278\" y=\"171\" text-anchor=\"middle\" font-size=\"12.5\" font-weight=\"600\" fill=\"#065f46\">I</text><circle cx=\"532\" cy=\"227\" r=\"92\" fill=\"#f9fafb\" stroke=\"#d1d5db\" stroke-width=\"1.4\"/><text x=\"532\" y=\"119\" text-anchor=\"middle\" font-size=\"12\" font-weight=\"600\" fill=\"#374151\">Front view (along beam)</text><line x1=\"532\" y1=\"227\" x2=\"532\" y2=\"135\" stroke=\"#2563eb\" stroke-width=\"2.2\" marker-end=\"url(#waves-arrow-waves-malus-polarization-structu)\"/><text x=\"522\" y=\"147\" text-anchor=\"end\" font-size=\"12\" font-weight=\"600\" fill=\"#1d4ed8\">E₀</text><line x1=\"452.3257\" y1=\"273\" x2=\"611.6743\" y2=\"181\" stroke=\"#b91c1c\" stroke-width=\"1.6\" stroke-dasharray=\"5 3\"/><line x1=\"532\" y1=\"135\" x2=\"571.8372\" y2=\"204\" stroke=\"#6b7280\" stroke-width=\"1.2\" stroke-dasharray=\"3 3\"/><line x1=\"532\" y1=\"227\" x2=\"571.8372\" y2=\"204\" stroke=\"#059669\" stroke-width=\"2.6\" marker-end=\"url(#waves-arrow-waves-malus-polarization-structu)\"/><text x=\"581.8372\" y=\"208\" text-anchor=\"start\" font-size=\"12\" font-weight=\"700\" fill=\"#065f46\">E</text><path d=\"M 532 189 A 38 38 0 0 1 564.909 208\" fill=\"none\" stroke=\"#991b1b\" stroke-width=\"1.5\"/><text x=\"562\" y=\"181.9667\" text-anchor=\"start\" font-size=\"12\" font-weight=\"600\" fill=\"#991b1b\">θ</text><text x=\"664\" y=\"408\" text-anchor=\"end\" font-size=\"11\" fill=\"#6b7280\">Diagram not to scale</text></g></svg>",
    "parts": [
      {
        "partId": "a",
        "prompt": "Calculate the ratio E / E₀ of the transmitted electric-field amplitude to the incident electric-field amplitude.",
        "marks": 2,
        "targetQuantityKey": "amplitudeTransmissionFactor",
        "expectedAnswer": "0.500",
        "workingSteps": [
          "Only the electric-field component parallel to the analyzer axis is transmitted: E / E₀ = cos θ.",
          "cos(60°) = 0.500."
        ]
      },
      {
        "partId": "b",
        "prompt": "Calculate the intensity I of the beam emerging from the analyzer.",
        "marks": 2,
        "dependsOnPartIds": [
          "a"
        ],
        "targetQuantityKey": "transmittedIntensityWm2",
        "expectedAnswer": "60.0 W m⁻²",
        "workingSteps": [
          "Use I = I₀ cos²θ.",
          "I = 240 × cos²(60°) = 60.0 W m⁻²."
        ]
      },
      {
        "partId": "c",
        "prompt": "Determine the intensity removed (absorbed or rejected) from the beam by the analyzer.",
        "marks": 2,
        "dependsOnPartIds": [
          "b"
        ],
        "targetQuantityKey": "absorbedIntensityAtAnalyzerWm2",
        "expectedAnswer": "180 W m⁻²",
        "workingSteps": [
          "I_abs = I₀ − I.",
          "I_abs = 240 − 60.0 = 180 W m⁻²."
        ]
      }
    ]
  },
  {
    "id": "sp-optics-shm-mcq-0111",
    "syllabi": [
      {
        "syllabus": "ib",
        "level": "HL",
        "topicId": "ib-theme-c",
        "subtopicId": "ib-c1-shm"
      },
      {
        "syllabus": "alevel",
        "level": "Y13",
        "topicId": "alevel-sec6-further-mechanics-thermal",
        "subtopicId": "alevel-3-6-1-periodic-motion-shm"
      },
      {
        "syllabus": "ncuk",
        "level": "IFY",
        "topicId": "ncuk-ac6",
        "subtopicId": "ncuk-ac6-1"
      }
    ],
    "format": "mcq",
    "difficulty": "standard",
    "visualFamily": "optics-shm",
    "stem": "A harmonic oscillator in a dynamic mechanical thermal-analyzer probe moves with amplitude x₀ = 0.1 m and angular frequency ω = 8 rad s⁻¹. Calculate its speed when passing through displacement x = 0.036 m.",
    "workedSolution": "Using v = ω√(x₀² − x²) gives v = 8 × √(0.1² − 0.036²) = 0.746 m s⁻¹.",
    "markScheme": [
      {
        "code": "A1",
        "criterion": "Substitutes into v = ω√(x₀² − x²) to obtain 0.746 m s⁻¹ (A).",
        "marks": 1
      }
    ],
    "totalMarks": 1,
    "conceptId": "simple-harmonic-motion",
    "familyGroupKey": "simple-harmonic-motion::shm-velocity-displacement-phase-ellipse",
    "svgMarkup": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"680\" height=\"400\" viewBox=\"0 0 680 400\" role=\"img\" aria-label=\"Simple harmonic motion graph\"><title>Simple harmonic motion graph</title><desc>Simple harmonic motion kinematic and energy curves</desc><rect width=\"680\" height=\"400\" fill=\"#ffffff\"/><g font-family=\"Arial, Helvetica, sans-serif\"><rect x=\"80\" y=\"46\" width=\"550\" height=\"296\" fill=\"#ffffff\" stroke=\"#cbd5e1\" stroke-width=\"1.2\"/><line x1=\"88\" y1=\"194\" x2=\"622\" y2=\"194\" stroke=\"#64748b\" stroke-width=\"1.3\"/><line x1=\"355\" y1=\"54\" x2=\"355\" y2=\"334\" stroke=\"#64748b\" stroke-width=\"1.3\"/><text x=\"575\" y=\"210\" text-anchor=\"middle\" font-size=\"10.5\" fill=\"#475569\">+0.1</text><text x=\"135\" y=\"210\" text-anchor=\"middle\" font-size=\"10.5\" fill=\"#475569\">−0.1</text><text x=\"620\" y=\"188\" text-anchor=\"end\" font-size=\"11.5\" font-weight=\"600\" fill=\"#1e293b\">x / m</text><ellipse cx=\"355\" cy=\"194\" rx=\"220\" ry=\"115.44\" fill=\"none\" stroke=\"#0f172a\" stroke-width=\"2.3\"/><polygon points=\"360,78.56 351,74.56 351,82.56\" fill=\"#0f172a\"/><polygon points=\"350,309.44 359,305.44 359,313.44\" fill=\"#0f172a\"/><text x=\"363\" y=\"72.56\" font-size=\"10.5\" fill=\"#475569\">+v_max</text><text x=\"363\" y=\"323.44\" font-size=\"10.5\" fill=\"#475569\">−v_max</text><text x=\"363\" y=\"64\" font-size=\"11.5\" font-weight=\"600\" fill=\"#0f172a\">v</text></g></svg>",
    "options": [
      {
        "label": "A",
        "text": "0.746 m s⁻¹",
        "isCorrect": true
      },
      {
        "label": "B",
        "text": "0.288 m s⁻¹",
        "isCorrect": false,
        "distractorRationale": "Uses ωx instead of ω√(x₀² − x²), mistakenly assuming speed is directly proportional to displacement."
      },
      {
        "label": "C",
        "text": "0.512 m s⁻¹",
        "isCorrect": false,
        "distractorRationale": "Evaluates ω(x₀ − x) linearly instead of taking √(x₀² − x²)."
      },
      {
        "label": "D",
        "text": "0.800 m s⁻¹",
        "isCorrect": false,
        "distractorRationale": "Calculates the maximum speed ωx₀ at equilibrium (x = 0) instead of the speed at x."
      }
    ],
    "correctOptionIndex": 0
  },
  {
    "id": "sp-thermal-struct-0094",
    "syllabi": [
      {
        "syllabus": "ib",
        "level": "HL",
        "topicId": "ib-theme-b",
        "subtopicId": "ib-b1-thermal-energy-transfers"
      },
      {
        "syllabus": "alevel",
        "level": "Y13",
        "topicId": "alevel-sec6-further-mechanics-thermal",
        "subtopicId": "alevel-3-6-2-thermal-physics"
      },
      {
        "syllabus": "ncuk",
        "level": "IFY",
        "topicId": "ncuk-ac3",
        "subtopicId": "ncuk-ac3-3"
      }
    ],
    "format": "structured",
    "difficulty": "standard",
    "visualFamily": "thermal",
    "stem": "An insulated run in a thermally isolated materials-testing bath combines 0.3 kg of pure ice at 273.15 K with 0.18 kg of tepid water at 289.15 K. Adopt c_w = 4180 J kg⁻¹ K⁻¹ and fusion enthalpy L_f = 3.34 × 10⁵ J kg⁻¹.",
    "workedSolution": "(a) Q_water = m_water c_water (289.15 − 273.15) = 1.20 × 10⁴ J, which is below m_ice L_f. (b) Melted mass Δm = Q_water / L_f = 0.0360 kg. (c) Melted fraction f = Δm / m_ice = 0.120.",
    "markScheme": [
      {
        "code": "M1",
        "partId": "a",
        "criterion": "Computes m_water c_water (T_water − 273.15).",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "a",
        "criterion": "Obtains 1.20 × 10⁴ J.",
        "marks": 1
      },
      {
        "code": "M1",
        "partId": "b",
        "criterion": "Divides Q_water by L_f.",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "b",
        "criterion": "Obtains 0.0360 kg.",
        "marks": 1
      },
      {
        "code": "M1",
        "partId": "c",
        "criterion": "Divides Δm by initial ice mass m_ice.",
        "marks": 1
      },
      {
        "code": "A1",
        "partId": "c",
        "criterion": "Obtains 0.120.",
        "marks": 1
      }
    ],
    "totalMarks": 6,
    "conceptId": "specific-heat-latent-heat",
    "familyGroupKey": "specific-heat-latent-heat::ice-water-latent-mixing-and-coexistence",
    "svgMarkup": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"720\" height=\"500\" viewBox=\"0 0 720 500\" role=\"img\" aria-label=\"Insulated calorimeter thermal equilibrium diagram\"><title>Insulated calorimeter thermal equilibrium diagram</title><desc>Insulated calorimeter thermal equilibrium diagram</desc><rect width=\"720\" height=\"500\" fill=\"white\"/><rect x=\"104\" y=\"92\" width=\"210\" height=\"290\" rx=\"6\" fill=\"#eceff2\" stroke=\"#202429\" stroke-width=\"2\"/><rect x=\"96\" y=\"78\" width=\"226\" height=\"14\" rx=\"3\" fill=\"#d9dfe5\" stroke=\"#202429\" stroke-width=\"1.8\"/><rect x=\"118\" y=\"106\" width=\"182\" height=\"262\" fill=\"white\" stroke=\"#202429\" stroke-width=\"1.6\"/><rect x=\"119\" y=\"174\" width=\"180\" height=\"193\" fill=\"#e3eef8\"/><line x1=\"119\" y1=\"174\" x2=\"299\" y2=\"174\" stroke=\"#3b5b78\" stroke-width=\"1.6\" stroke-dasharray=\"6 3\"/><rect x=\"169\" y=\"42\" width=\"8\" height=\"250\" rx=\"3\" fill=\"white\" stroke=\"#202429\" stroke-width=\"1.6\"/><circle cx=\"173\" cy=\"296\" r=\"7.5\" fill=\"#4f5962\" stroke=\"#202429\" stroke-width=\"1.6\"/><line x1=\"173\" y1=\"98\" x2=\"173\" y2=\"292\" stroke=\"#4f5962\" stroke-width=\"2.4\"/><line x1=\"253\" y1=\"48\" x2=\"253\" y2=\"309\" stroke=\"#202429\" stroke-width=\"2\"/><ellipse cx=\"253\" cy=\"312\" rx=\"14\" ry=\"4.5\" fill=\"none\" stroke=\"#202429\" stroke-width=\"2\"/><rect x=\"169\" y=\"304\" width=\"56\" height=\"42\" rx=\"4\" fill=\"#cfd6dd\" stroke=\"#202429\" stroke-width=\"1.8\"/><line x1=\"197\" y1=\"300\" x2=\"197\" y2=\"272\" stroke=\"#202429\" stroke-width=\"1.6\"/><polygon points=\"197,267 200.4,276.25 193.6,276.25\" fill=\"#202429\"/><text x=\"209\" y=\"408\" text-anchor=\"middle\" font-size=\"14\" font-family=\"Arial, sans-serif\" fill=\"#343c44\">insulated calorimeter</text><rect x=\"389\" y=\"66\" width=\"299\" height=\"64\" rx=\"6\" fill=\"#f8fafc\" stroke=\"#c5cdd5\" stroke-width=\"1.3\"/><text x=\"403\" y=\"90\" font-size=\"14.5\" font-weight=\"bold\" font-family=\"Arial, sans-serif\" fill=\"#15191d\">Melting ice</text><text x=\"403\" y=\"113\" font-size=\"13\" font-family=\"Arial, sans-serif\" fill=\"#343c44\">m = 0.3 kg  |  T_i = 273 K</text><rect x=\"389\" y=\"144\" width=\"299\" height=\"64\" rx=\"6\" fill=\"#f8fafc\" stroke=\"#c5cdd5\" stroke-width=\"1.3\"/><text x=\"403\" y=\"168\" font-size=\"14.5\" font-weight=\"bold\" font-family=\"Arial, sans-serif\" fill=\"#15191d\">Water bath</text><text x=\"403\" y=\"191\" font-size=\"13\" font-family=\"Arial, sans-serif\" fill=\"#343c44\">m = 0.18 kg  |  T_i = 289 K  |  c = 4180 J kg⁻¹ K⁻¹</text><rect x=\"389\" y=\"228\" width=\"299\" height=\"48\" rx=\"6\" fill=\"#eef3f8\" stroke=\"#8a99a8\" stroke-width=\"1.4\"/><text x=\"403\" y=\"257\" font-size=\"14\" font-weight=\"bold\" font-family=\"Arial, sans-serif\" fill=\"#15191d\">Thermal equilibrium: T_eq</text></svg>",
    "parts": [
      {
        "partId": "a",
        "prompt": "Show that not all the ice melts by calculating the thermal energy released when the warm water cools to 273.15 K.",
        "marks": 2,
        "targetQuantityKey": "heatLostByHotJ",
        "expectedAnswer": "1.20 × 10⁴ J",
        "workingSteps": [
          "Q_water = m_water c_water (289.15 − 273.15) = 1.20 × 10⁴ J (< m_ice L_f = 1.00 × 10⁵ J)."
        ]
      },
      {
        "partId": "b",
        "prompt": "Calculate the mass of ice that melts by the time thermal equilibrium is reached.",
        "marks": 2,
        "dependsOnPartIds": [
          "a"
        ],
        "targetQuantityKey": "meltedMassKg",
        "expectedAnswer": "0.0360 kg",
        "workingSteps": [
          "Δm = Q_water / L_f = 1.204 × 10⁴ / (3.34 × 10⁵) = 0.0360 kg."
        ]
      },
      {
        "partId": "c",
        "prompt": "Determine the fraction of the initial ice sample that has melted at equilibrium.",
        "marks": 2,
        "dependsOnPartIds": [
          "b"
        ],
        "targetQuantityKey": "meltedFraction",
        "expectedAnswer": "0.120",
        "workingSteps": [
          "f = Δm / m_ice = 0.03604 / 0.3 = 0.120."
        ]
      }
    ]
  },
  {
    "id": "sp-pure-calc-0001",
    "syllabi": [
      {
        "syllabus": "ib",
        "level": "SL",
        "topicId": "ib-tools",
        "subtopicId": "ib-tools-measurement-uncertainties"
      },
      {
        "syllabus": "alevel",
        "level": "Y12",
        "topicId": "alevel-sec1-measurements-errors",
        "subtopicId": "alevel-3-1-si-uncertainties-estimation"
      },
      {
        "syllabus": "ncuk",
        "level": "IFY",
        "topicId": "ncuk-ac1",
        "subtopicId": "ncuk-ac1-1"
      }
    ],
    "format": "mcq",
    "difficulty": "foundation",
    "visualFamily": "none",
    "stem": "In a materials metrology audit, a machined titanium-aluminide reference cube records a mass of 59.4 g ± 1.2 g on a digital balance and an edge length of 3 cm ± 0.04 cm using vernier callipers. What is the bulk density of the cube expressed in coherent SI base units (kg m⁻³)?",
    "workedSolution": "Convert to SI base units: m = 59.4 × 10⁻³ = 0.0594 kg and L = 3 × 10⁻² = 0.03 m. Volume V = L³ = (0.03)³ m³. Bulk density ρ = m / L³ = 2.20 × 10³ kg m⁻³.",
    "markScheme": [
      {
        "code": "A1",
        "criterion": "Converts mass to kg and cubed edge length to m³ to obtain ρ = 2.20 × 10³ kg m⁻³.",
        "marks": 1
      }
    ],
    "totalMarks": 1,
    "conceptId": "si-units-dimensional-analysis",
    "familyGroupKey": "si-units-dimensional-analysis::si-cubed-prefix-bulk-density",
    "options": [
      {
        "label": "A",
        "text": "2.20 × 10³ kg m⁻³",
        "isCorrect": true
      },
      {
        "label": "B",
        "text": "2.20 kg m⁻³",
        "isCorrect": false,
        "distractorRationale": "Evaluates density in g cm⁻³ without applying the factor of 1000 needed to convert g cm⁻³ into kg m⁻³."
      },
      {
        "label": "C",
        "text": "1.98 kg m⁻³",
        "isCorrect": false,
        "distractorRationale": "Divides mass in kilograms by a single edge length in metres instead of cubing the converted length."
      },
      {
        "label": "D",
        "text": "0.220 kg m⁻³",
        "isCorrect": false,
        "distractorRationale": "Applies the centimetre prefix 10⁻² once rather than cubing it to (10⁻²)³ = 10⁻⁶ when converting cm³ to m³."
      }
    ],
    "correctOptionIndex": 0
  }
];

export const SEED_FALLBACK_CHUNK_BY_ID: Readonly<Record<string, PhysicsDomainId>> = {
  "sp-graphs-0277-mcq": "graphs",
  "sp-circuits-11-structured-234": "circuits",
  "sp-fields-mcq-0064": "fields",
  "sp-mech-structured-0199": "mechanics",
  "sp-v2-waves-mcq-0125": "waves",
  "sp-optics-shm-struct-0270": "optics-shm",
  "sp-thermal-mcq-0220": "thermal",
  "ga-circular-orbit-energy-str-008": "grav-astro",
  "sp-v2-em-induction-mcq-0100": "em-induction",
  "sp-qn-structured-245": "quantum-nuclear",
  "sp-graphs-0193-struct": "graphs",
  "sp-circuits-09-mcq-176": "circuits",
  "sp-fields-struct-0330": "fields",
  "sp-mech-mcq-0329": "mechanics",
  "waves-malus-polarization-structured-303": "waves",
  "sp-optics-shm-mcq-0111": "optics-shm",
  "sp-thermal-struct-0094": "thermal",
  "sp-pure-calc-0001": "pure-calculation"
};

export const SEED_FALLBACK_MANIFEST: PublicBankManifest = {
  "schemaVersion": "sixthphysics-public-manifest/1.0.0",
  "generatedAt": "2026-11-17T23:21:18.834Z",
  "totalItems": 18,
  "syllabi": {
    "ib": {
      "syllabus": "ib",
      "title": "IB Diploma Programme Physics (SL & HL)",
      "shortLabel": "IB Physics",
      "specificationCode": "IB-DP-PHYSICS-2025",
      "levels": [
        "SL",
        "HL"
      ],
      "gravityConvention": "g = 9.8 m s⁻²",
      "questionCount": 17,
      "mcqCount": 9,
      "structuredCount": 8,
      "countsByLevel": {
        "SL": 11,
        "HL": 6
      },
      "topics": [
        {
          "id": "ib-tools",
          "code": "Tools",
          "title": "Tools for Physics: Measurement, Uncertainties and Graphical Analysis",
          "syllabus": "ib",
          "levelsCovered": [
            "SL",
            "HL"
          ],
          "questionCount": 1,
          "mcqCount": 1,
          "structuredCount": 0,
          "countsByLevel": {
            "SL": 1,
            "HL": 0
          },
          "subtopics": [
            {
              "id": "ib-tools-measurement-uncertainties",
              "code": "T.1-T.3",
              "title": "SI Units, Uncertainties, Error Bars and Linearization",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 1,
              "mcqCount": 1,
              "structuredCount": 0,
              "countsByLevel": {
                "SL": 1,
                "HL": 0
              }
            }
          ]
        },
        {
          "id": "ib-theme-a",
          "code": "Theme A",
          "title": "Space, time and motion",
          "syllabus": "ib",
          "levelsCovered": [
            "SL",
            "HL"
          ],
          "questionCount": 4,
          "mcqCount": 2,
          "structuredCount": 2,
          "countsByLevel": {
            "SL": 3,
            "HL": 1
          },
          "subtopics": [
            {
              "id": "ib-a1-kinematics",
              "code": "A.1",
              "title": "Kinematics",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 1,
              "mcqCount": 0,
              "structuredCount": 1,
              "countsByLevel": {
                "SL": 1,
                "HL": 0
              }
            },
            {
              "id": "ib-a2-forces-momentum",
              "code": "A.2",
              "title": "Forces and momentum",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 3,
              "mcqCount": 2,
              "structuredCount": 1,
              "countsByLevel": {
                "SL": 2,
                "HL": 1
              }
            },
            {
              "id": "ib-a3-work-energy-power",
              "code": "A.3",
              "title": "Work, energy and power",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "SL": 0,
                "HL": 0
              }
            },
            {
              "id": "ib-a4-rigid-body-mechanics",
              "code": "A.4",
              "title": "Rigid body mechanics (HL only)",
              "level": "HL",
              "levelsCovered": [
                "HL"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "SL": 0,
                "HL": 0
              }
            },
            {
              "id": "ib-a5-galilean-special-relativity",
              "code": "A.5",
              "title": "Galilean and special relativity (HL only)",
              "level": "HL",
              "levelsCovered": [
                "HL"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "SL": 0,
                "HL": 0
              }
            }
          ]
        },
        {
          "id": "ib-theme-b",
          "code": "Theme B",
          "title": "The particulate nature of matter",
          "syllabus": "ib",
          "levelsCovered": [
            "SL",
            "HL"
          ],
          "questionCount": 4,
          "mcqCount": 2,
          "structuredCount": 2,
          "countsByLevel": {
            "SL": 3,
            "HL": 1
          },
          "subtopics": [
            {
              "id": "ib-b1-thermal-energy-transfers",
              "code": "B.1",
              "title": "Thermal energy transfers",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 2,
              "mcqCount": 1,
              "structuredCount": 1,
              "countsByLevel": {
                "SL": 1,
                "HL": 1
              }
            },
            {
              "id": "ib-b2-greenhouse-effect",
              "code": "B.2",
              "title": "Greenhouse effect",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "SL": 0,
                "HL": 0
              }
            },
            {
              "id": "ib-b3-gas-laws",
              "code": "B.3",
              "title": "Gas laws",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "SL": 0,
                "HL": 0
              }
            },
            {
              "id": "ib-b4-thermodynamics",
              "code": "B.4",
              "title": "Thermodynamics (HL only)",
              "level": "HL",
              "levelsCovered": [
                "HL"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "SL": 0,
                "HL": 0
              }
            },
            {
              "id": "ib-b5-current-circuits",
              "code": "B.5",
              "title": "Current and circuits",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 2,
              "mcqCount": 1,
              "structuredCount": 1,
              "countsByLevel": {
                "SL": 2,
                "HL": 0
              }
            }
          ]
        },
        {
          "id": "ib-theme-c",
          "code": "Theme C",
          "title": "Wave behaviour",
          "syllabus": "ib",
          "levelsCovered": [
            "SL",
            "HL"
          ],
          "questionCount": 3,
          "mcqCount": 2,
          "structuredCount": 1,
          "countsByLevel": {
            "SL": 1,
            "HL": 2
          },
          "subtopics": [
            {
              "id": "ib-c1-shm",
              "code": "C.1",
              "title": "Simple harmonic motion",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 2,
              "mcqCount": 1,
              "structuredCount": 1,
              "countsByLevel": {
                "SL": 1,
                "HL": 1
              }
            },
            {
              "id": "ib-c2-wave-model",
              "code": "C.2",
              "title": "Wave model",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "SL": 0,
                "HL": 0
              }
            },
            {
              "id": "ib-c3-wave-phenomena",
              "code": "C.3",
              "title": "Wave phenomena",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 1,
              "mcqCount": 1,
              "structuredCount": 0,
              "countsByLevel": {
                "SL": 0,
                "HL": 1
              }
            },
            {
              "id": "ib-c4-standing-waves-resonance",
              "code": "C.4",
              "title": "Standing waves and resonance",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "SL": 0,
                "HL": 0
              }
            },
            {
              "id": "ib-c5-doppler-effect",
              "code": "C.5",
              "title": "Doppler effect",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "SL": 0,
                "HL": 0
              }
            }
          ]
        },
        {
          "id": "ib-theme-d",
          "code": "Theme D",
          "title": "Fields",
          "syllabus": "ib",
          "levelsCovered": [
            "SL",
            "HL"
          ],
          "questionCount": 4,
          "mcqCount": 2,
          "structuredCount": 2,
          "countsByLevel": {
            "SL": 2,
            "HL": 2
          },
          "subtopics": [
            {
              "id": "ib-d1-gravitational-fields",
              "code": "D.1",
              "title": "Gravitational fields",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 1,
              "mcqCount": 0,
              "structuredCount": 1,
              "countsByLevel": {
                "SL": 1,
                "HL": 0
              }
            },
            {
              "id": "ib-d2-electric-magnetic-fields",
              "code": "D.2",
              "title": "Electric and magnetic fields",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 2,
              "mcqCount": 1,
              "structuredCount": 1,
              "countsByLevel": {
                "SL": 1,
                "HL": 1
              }
            },
            {
              "id": "ib-d3-motion-em-fields",
              "code": "D.3",
              "title": "Motion in electromagnetic fields",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "SL": 0,
                "HL": 0
              }
            },
            {
              "id": "ib-d4-induction",
              "code": "D.4",
              "title": "Induction (HL only)",
              "level": "HL",
              "levelsCovered": [
                "HL"
              ],
              "questionCount": 1,
              "mcqCount": 1,
              "structuredCount": 0,
              "countsByLevel": {
                "SL": 0,
                "HL": 1
              }
            }
          ]
        },
        {
          "id": "ib-theme-e",
          "code": "Theme E",
          "title": "Nuclear and quantum physics",
          "syllabus": "ib",
          "levelsCovered": [
            "SL",
            "HL"
          ],
          "questionCount": 1,
          "mcqCount": 0,
          "structuredCount": 1,
          "countsByLevel": {
            "SL": 1,
            "HL": 0
          },
          "subtopics": [
            {
              "id": "ib-e1-structure-atom",
              "code": "E.1",
              "title": "Structure of the atom",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "SL": 0,
                "HL": 0
              }
            },
            {
              "id": "ib-e2-quantum-physics",
              "code": "E.2",
              "title": "Quantum physics (HL only)",
              "level": "HL",
              "levelsCovered": [
                "HL"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "SL": 0,
                "HL": 0
              }
            },
            {
              "id": "ib-e3-radioactive-decay",
              "code": "E.3",
              "title": "Radioactive decay",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "SL": 0,
                "HL": 0
              }
            },
            {
              "id": "ib-e4-fission",
              "code": "E.4",
              "title": "Fission",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 1,
              "mcqCount": 0,
              "structuredCount": 1,
              "countsByLevel": {
                "SL": 1,
                "HL": 0
              }
            },
            {
              "id": "ib-e5-fusion-stars",
              "code": "E.5",
              "title": "Fusion and stars",
              "level": "SL",
              "levelsCovered": [
                "SL",
                "HL"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "SL": 0,
                "HL": 0
              }
            }
          ]
        }
      ]
    },
    "alevel": {
      "syllabus": "alevel",
      "title": "UK GCE AS & A-Level Physics (DfE Core + AQA 7407/7408)",
      "shortLabel": "UK A-Level",
      "specificationCode": "AQA-7407-7408",
      "levels": [
        "Y12",
        "Y13"
      ],
      "gravityConvention": "g = 9.81 m s⁻²",
      "questionCount": 18,
      "mcqCount": 9,
      "structuredCount": 9,
      "countsByLevel": {
        "Y12": 4,
        "Y13": 14
      },
      "topics": [
        {
          "id": "alevel-sec1-measurements-errors",
          "code": "Section 1 (3.1)",
          "title": "Measurements and their errors",
          "syllabus": "alevel",
          "levelsCovered": [
            "Y12",
            "Y13"
          ],
          "questionCount": 1,
          "mcqCount": 1,
          "structuredCount": 0,
          "countsByLevel": {
            "Y12": 1,
            "Y13": 0
          },
          "subtopics": [
            {
              "id": "alevel-3-1-si-uncertainties-estimation",
              "code": "3.1.1-3.1.3",
              "title": "SI Units, Uncertainties and Order-of-Magnitude Estimation",
              "level": "Y12",
              "levelsCovered": [
                "Y12",
                "Y13"
              ],
              "questionCount": 1,
              "mcqCount": 1,
              "structuredCount": 0,
              "countsByLevel": {
                "Y12": 1,
                "Y13": 0
              }
            }
          ]
        },
        {
          "id": "alevel-sec2-particles-radiation",
          "code": "Section 2 (3.2)",
          "title": "Particles and radiation",
          "syllabus": "alevel",
          "levelsCovered": [
            "Y12",
            "Y13"
          ],
          "questionCount": 0,
          "mcqCount": 0,
          "structuredCount": 0,
          "countsByLevel": {
            "Y12": 0,
            "Y13": 0
          },
          "subtopics": [
            {
              "id": "alevel-3-2-1-particles-quarks",
              "code": "3.2.1",
              "title": "Constituents of the Atom, Antiparticles, Hadrons, Leptons and Quarks",
              "level": "Y12",
              "levelsCovered": [
                "Y12",
                "Y13"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "Y12": 0,
                "Y13": 0
              }
            },
            {
              "id": "alevel-3-2-2-quantum-phenomena",
              "code": "3.2.2",
              "title": "Photoelectric Effect, Atomic Energy Levels and Wave-Particle Duality",
              "level": "Y12",
              "levelsCovered": [
                "Y12",
                "Y13"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "Y12": 0,
                "Y13": 0
              }
            }
          ]
        },
        {
          "id": "alevel-sec3-waves",
          "code": "Section 3 (3.3)",
          "title": "Waves",
          "syllabus": "alevel",
          "levelsCovered": [
            "Y12",
            "Y13"
          ],
          "questionCount": 2,
          "mcqCount": 1,
          "structuredCount": 1,
          "countsByLevel": {
            "Y12": 1,
            "Y13": 1
          },
          "subtopics": [
            {
              "id": "alevel-3-3-1-progressive-stationary-waves",
              "code": "3.3.1",
              "title": "Progressive Waves, Polarisation and Stationary Waves",
              "level": "Y12",
              "levelsCovered": [
                "Y12",
                "Y13"
              ],
              "questionCount": 1,
              "mcqCount": 0,
              "structuredCount": 1,
              "countsByLevel": {
                "Y12": 1,
                "Y13": 0
              }
            },
            {
              "id": "alevel-3-3-2-refraction-diffraction-interference",
              "code": "3.3.2",
              "title": "Interference, Diffraction Gratings, Refraction and Optical Fibres",
              "level": "Y12",
              "levelsCovered": [
                "Y12",
                "Y13"
              ],
              "questionCount": 1,
              "mcqCount": 1,
              "structuredCount": 0,
              "countsByLevel": {
                "Y12": 0,
                "Y13": 1
              }
            }
          ]
        },
        {
          "id": "alevel-sec4-mechanics-materials",
          "code": "Section 4 (3.4)",
          "title": "Mechanics and materials",
          "syllabus": "alevel",
          "levelsCovered": [
            "Y12",
            "Y13"
          ],
          "questionCount": 4,
          "mcqCount": 2,
          "structuredCount": 2,
          "countsByLevel": {
            "Y12": 2,
            "Y13": 2
          },
          "subtopics": [
            {
              "id": "alevel-3-4-1-force-energy-momentum",
              "code": "3.4.1",
              "title": "Force, Moments, Kinematics, Projectile Motion, Momentum and Energy",
              "level": "Y12",
              "levelsCovered": [
                "Y12",
                "Y13"
              ],
              "questionCount": 4,
              "mcqCount": 2,
              "structuredCount": 2,
              "countsByLevel": {
                "Y12": 2,
                "Y13": 2
              }
            },
            {
              "id": "alevel-3-4-2-materials-young-modulus",
              "code": "3.4.2",
              "title": "Bulk Properties of Solids, Hooke Law and the Young Modulus",
              "level": "Y12",
              "levelsCovered": [
                "Y12",
                "Y13"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "Y12": 0,
                "Y13": 0
              }
            }
          ]
        },
        {
          "id": "alevel-sec5-electricity",
          "code": "Section 5 (3.5)",
          "title": "Electricity",
          "syllabus": "alevel",
          "levelsCovered": [
            "Y12",
            "Y13"
          ],
          "questionCount": 2,
          "mcqCount": 1,
          "structuredCount": 1,
          "countsByLevel": {
            "Y12": 0,
            "Y13": 2
          },
          "subtopics": [
            {
              "id": "alevel-3-5-1-current-electricity",
              "code": "3.5.1",
              "title": "Current Electricity, Resistivity, DC Networks, Potential Dividers & Internal Resistance",
              "level": "Y12",
              "levelsCovered": [
                "Y12",
                "Y13"
              ],
              "questionCount": 2,
              "mcqCount": 1,
              "structuredCount": 1,
              "countsByLevel": {
                "Y12": 0,
                "Y13": 2
              }
            }
          ]
        },
        {
          "id": "alevel-sec6-further-mechanics-thermal",
          "code": "Section 6 (3.6)",
          "title": "Further mechanics and thermal physics (A-Level / Year 13 only)",
          "syllabus": "alevel",
          "levelsCovered": [
            "Y13"
          ],
          "questionCount": 4,
          "mcqCount": 2,
          "structuredCount": 2,
          "countsByLevel": {
            "Y12": 0,
            "Y13": 4
          },
          "subtopics": [
            {
              "id": "alevel-3-6-1-periodic-motion-shm",
              "code": "3.6.1",
              "title": "Circular Motion, Simple Harmonic Motion, Resonance and Damping",
              "level": "Y13",
              "levelsCovered": [
                "Y13"
              ],
              "questionCount": 2,
              "mcqCount": 1,
              "structuredCount": 1,
              "countsByLevel": {
                "Y12": 0,
                "Y13": 2
              }
            },
            {
              "id": "alevel-3-6-2-thermal-physics",
              "code": "3.6.2",
              "title": "Thermal Energy Transfer, Ideal Gases and Kinetic Theory",
              "level": "Y13",
              "levelsCovered": [
                "Y13"
              ],
              "questionCount": 2,
              "mcqCount": 1,
              "structuredCount": 1,
              "countsByLevel": {
                "Y12": 0,
                "Y13": 2
              }
            }
          ]
        },
        {
          "id": "alevel-sec7-fields-consequences",
          "code": "Section 7 (3.7)",
          "title": "Fields and their consequences (A-Level / Year 13 only)",
          "syllabus": "alevel",
          "levelsCovered": [
            "Y13"
          ],
          "questionCount": 4,
          "mcqCount": 2,
          "structuredCount": 2,
          "countsByLevel": {
            "Y12": 0,
            "Y13": 4
          },
          "subtopics": [
            {
              "id": "alevel-3-7-2-gravitational-fields",
              "code": "3.7.1-3.7.2",
              "title": "Gravitational Fields, Potential and Satellite Orbits",
              "level": "Y13",
              "levelsCovered": [
                "Y13"
              ],
              "questionCount": 1,
              "mcqCount": 0,
              "structuredCount": 1,
              "countsByLevel": {
                "Y12": 0,
                "Y13": 1
              }
            },
            {
              "id": "alevel-3-7-3-electric-fields",
              "code": "3.7.3",
              "title": "Electric Fields, Coulomb Law and Electric Potential",
              "level": "Y13",
              "levelsCovered": [
                "Y13"
              ],
              "questionCount": 2,
              "mcqCount": 1,
              "structuredCount": 1,
              "countsByLevel": {
                "Y12": 0,
                "Y13": 2
              }
            },
            {
              "id": "alevel-3-7-4-capacitance",
              "code": "3.7.4",
              "title": "Capacitance, Dielectrics, Stored Energy and RC Exponential Circuits",
              "level": "Y13",
              "levelsCovered": [
                "Y13"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "Y12": 0,
                "Y13": 0
              }
            },
            {
              "id": "alevel-3-7-5-magnetic-fields-induction-ac",
              "code": "3.7.5",
              "title": "Magnetic Fields, Electromagnetic Induction, AC RMS and Transformers",
              "level": "Y13",
              "levelsCovered": [
                "Y13"
              ],
              "questionCount": 1,
              "mcqCount": 1,
              "structuredCount": 0,
              "countsByLevel": {
                "Y12": 0,
                "Y13": 1
              }
            }
          ]
        },
        {
          "id": "alevel-sec8-nuclear-physics",
          "code": "Section 8 (3.8)",
          "title": "Nuclear physics (A-Level / Year 13 only)",
          "syllabus": "alevel",
          "levelsCovered": [
            "Y13"
          ],
          "questionCount": 1,
          "mcqCount": 0,
          "structuredCount": 1,
          "countsByLevel": {
            "Y12": 0,
            "Y13": 1
          },
          "subtopics": [
            {
              "id": "alevel-3-8-nuclear-decay-energy",
              "code": "3.8.1-3.8.6",
              "title": "Nuclear Radius, Exponential Radioactive Decay, Mass Defect, Fission & Fusion",
              "level": "Y13",
              "levelsCovered": [
                "Y13"
              ],
              "questionCount": 1,
              "mcqCount": 0,
              "structuredCount": 1,
              "countsByLevel": {
                "Y12": 0,
                "Y13": 1
              }
            }
          ]
        },
        {
          "id": "alevel-options-9-13",
          "code": "Sections 9-13 (Options)",
          "title": "Year 13 Optional Modules (Astrophysics, Medical, Engineering, Turning Points, Electronics)",
          "syllabus": "alevel",
          "levelsCovered": [
            "Y13"
          ],
          "questionCount": 0,
          "mcqCount": 0,
          "structuredCount": 0,
          "countsByLevel": {
            "Y12": 0,
            "Y13": 0
          },
          "subtopics": [
            {
              "id": "alevel-3-9-astrophysics",
              "code": "3.9",
              "title": "Option: Astrophysics (Telescopes, Thin Lenses, Stars & Cosmology)",
              "level": "Y13",
              "levelsCovered": [
                "Y13"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "Y12": 0,
                "Y13": 0
              },
              "isOption": true
            },
            {
              "id": "alevel-3-10-medical-physics",
              "code": "3.10",
              "title": "Option: Medical Physics (Eye Optics, Ultrasound & X-Ray Attenuation)",
              "level": "Y13",
              "levelsCovered": [
                "Y13"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "Y12": 0,
                "Y13": 0
              },
              "isOption": true
            },
            {
              "id": "alevel-3-11-engineering-physics",
              "code": "3.11",
              "title": "Option: Engineering Physics (Rotational Dynamics & Thermodynamic Cycles)",
              "level": "Y13",
              "levelsCovered": [
                "Y13"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "Y12": 0,
                "Y13": 0
              },
              "isOption": true
            },
            {
              "id": "alevel-3-12-turning-points",
              "code": "3.12",
              "title": "Option: Turning Points in Physics (Electron Discovery & Special Relativity)",
              "level": "Y13",
              "levelsCovered": [
                "Y13"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "Y12": 0,
                "Y13": 0
              },
              "isOption": true
            },
            {
              "id": "alevel-3-13-electronics",
              "code": "3.13",
              "title": "Option: Electronics (Operational Amplifiers, Timing & Digital Logic)",
              "level": "Y13",
              "levelsCovered": [
                "Y13"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "Y12": 0,
                "Y13": 0
              },
              "isOption": true
            }
          ],
          "isOption": true
        }
      ]
    },
    "ncuk": {
      "syllabus": "ncuk",
      "title": "NCUK International Foundation Year (IFY) Physics",
      "shortLabel": "NCUK IFY",
      "specificationCode": "IFYPH005",
      "levels": [
        "IFY",
        "IFY-S1",
        "IFY-S2"
      ],
      "gravityConvention": "g = 9.81 m s⁻²",
      "questionCount": 18,
      "mcqCount": 9,
      "structuredCount": 9,
      "countsByLevel": {
        "IFY": 7,
        "IFY-S1": 5,
        "IFY-S2": 6
      },
      "topics": [
        {
          "id": "ncuk-ac1",
          "code": "AC1 / LO1",
          "title": "Units, Uncertainties, Graphical Analysis and Vectors",
          "syllabus": "ncuk",
          "levelsCovered": [
            "IFY-S1",
            "IFY"
          ],
          "questionCount": 1,
          "mcqCount": 1,
          "structuredCount": 0,
          "countsByLevel": {
            "IFY": 1,
            "IFY-S1": 0,
            "IFY-S2": 0
          },
          "subtopics": [
            {
              "id": "ncuk-ac1-1",
              "code": "AC1.1",
              "title": "Quantities, SI Units, Precision and Uncertainty Propagation",
              "level": "IFY-S1",
              "levelsCovered": [
                "IFY-S1",
                "IFY"
              ],
              "questionCount": 1,
              "mcqCount": 1,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 1,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac1-2",
              "code": "AC1.2",
              "title": "Data Tables, Graph Plotting and Line of Worst Fit",
              "level": "IFY-S1",
              "levelsCovered": [
                "IFY-S1",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac1-3",
              "code": "AC1.3",
              "title": "Scalars and Vectors",
              "level": "IFY-S1",
              "levelsCovered": [
                "IFY-S1",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            }
          ]
        },
        {
          "id": "ncuk-ac2",
          "code": "AC2 / LO2",
          "title": "Mechanics",
          "syllabus": "ncuk",
          "levelsCovered": [
            "IFY-S1",
            "IFY"
          ],
          "questionCount": 4,
          "mcqCount": 2,
          "structuredCount": 2,
          "countsByLevel": {
            "IFY": 1,
            "IFY-S1": 3,
            "IFY-S2": 0
          },
          "subtopics": [
            {
              "id": "ncuk-ac2-1",
              "code": "AC2.1",
              "title": "Kinematics and Projectile Motion",
              "level": "IFY-S1",
              "levelsCovered": [
                "IFY-S1",
                "IFY"
              ],
              "questionCount": 1,
              "mcqCount": 0,
              "structuredCount": 1,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 1,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac2-2",
              "code": "AC2.2",
              "title": "Dynamics, Newton's Laws and Terminal Velocity",
              "level": "IFY-S1",
              "levelsCovered": [
                "IFY-S1",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac2-3",
              "code": "AC2.3",
              "title": "Statics, Moments, Couples and Torque",
              "level": "IFY-S1",
              "levelsCovered": [
                "IFY-S1",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac2-4",
              "code": "AC2.4",
              "title": "Circular Motion",
              "level": "IFY-S1",
              "levelsCovered": [
                "IFY-S1",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac2-5",
              "code": "AC2.5",
              "title": "Energy, Work Done, Power and Efficiency",
              "level": "IFY-S1",
              "levelsCovered": [
                "IFY-S1",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac2-6",
              "code": "AC2.6",
              "title": "Linear Momentum, Impulse and Collisions",
              "level": "IFY-S1",
              "levelsCovered": [
                "IFY-S1",
                "IFY"
              ],
              "questionCount": 3,
              "mcqCount": 2,
              "structuredCount": 1,
              "countsByLevel": {
                "IFY": 1,
                "IFY-S1": 2,
                "IFY-S2": 0
              }
            }
          ]
        },
        {
          "id": "ncuk-ac3",
          "code": "AC3 / LO3",
          "title": "Materials and Thermal Physics",
          "syllabus": "ncuk",
          "levelsCovered": [
            "IFY-S1",
            "IFY"
          ],
          "questionCount": 2,
          "mcqCount": 1,
          "structuredCount": 1,
          "countsByLevel": {
            "IFY": 2,
            "IFY-S1": 0,
            "IFY-S2": 0
          },
          "subtopics": [
            {
              "id": "ncuk-ac3-1",
              "code": "AC3.1",
              "title": "Solids, Liquids, Gases, Density and Hydrostatics",
              "level": "IFY-S1",
              "levelsCovered": [
                "IFY-S1",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac3-2",
              "code": "AC3.2",
              "title": "Elasticity, Hooke's Law and Young's Modulus",
              "level": "IFY-S1",
              "levelsCovered": [
                "IFY-S1",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac3-3",
              "code": "AC3.3",
              "title": "Specific Heat Capacity, Latent Heat and Internal Energy",
              "level": "IFY-S1",
              "levelsCovered": [
                "IFY-S1",
                "IFY"
              ],
              "questionCount": 2,
              "mcqCount": 1,
              "structuredCount": 1,
              "countsByLevel": {
                "IFY": 2,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac3-4",
              "code": "AC3.4",
              "title": "Ideal Gases and Kinetic Theory",
              "level": "IFY-S1",
              "levelsCovered": [
                "IFY-S1",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            }
          ]
        },
        {
          "id": "ncuk-ac4",
          "code": "AC4 / LO4",
          "title": "Electricity, Capacitance, Fields and Electromagnetism",
          "syllabus": "ncuk",
          "levelsCovered": [
            "IFY-S1",
            "IFY-S2",
            "IFY"
          ],
          "questionCount": 5,
          "mcqCount": 3,
          "structuredCount": 2,
          "countsByLevel": {
            "IFY": 0,
            "IFY-S1": 2,
            "IFY-S2": 3
          },
          "subtopics": [
            {
              "id": "ncuk-ac4-1",
              "code": "AC4.1",
              "title": "Current, Potential Difference, Drift Velocity and Kirchhoff's Laws",
              "level": "IFY-S1",
              "levelsCovered": [
                "IFY-S1",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac4-2",
              "code": "AC4.2",
              "title": "Resistance, Ohm's Law, Resistivity and Potential Dividers",
              "level": "IFY-S1",
              "levelsCovered": [
                "IFY-S1",
                "IFY"
              ],
              "questionCount": 1,
              "mcqCount": 0,
              "structuredCount": 1,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 1,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac4-3",
              "code": "AC4.3",
              "title": "EMF, Internal Resistance and Electrical Power",
              "level": "IFY-S1",
              "levelsCovered": [
                "IFY-S1",
                "IFY"
              ],
              "questionCount": 1,
              "mcqCount": 1,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 1,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac4-4",
              "code": "AC4.4",
              "title": "Capacitance and Exponential RC Circuits",
              "level": "IFY-S1",
              "levelsCovered": [
                "IFY-S1",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac4-5",
              "code": "AC4.5",
              "title": "Electric and Magnetic Fields",
              "level": "IFY-S2",
              "levelsCovered": [
                "IFY-S2",
                "IFY"
              ],
              "questionCount": 2,
              "mcqCount": 1,
              "structuredCount": 1,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 2
              }
            },
            {
              "id": "ncuk-ac4-6",
              "code": "AC4.6",
              "title": "Electromagnetic Induction, Motors, Generators and Transformers",
              "level": "IFY-S2",
              "levelsCovered": [
                "IFY-S2",
                "IFY"
              ],
              "questionCount": 1,
              "mcqCount": 1,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 1
              }
            }
          ]
        },
        {
          "id": "ncuk-ac5",
          "code": "AC5 / LO5",
          "title": "Gravitation, Astronomy and Cosmology",
          "syllabus": "ncuk",
          "levelsCovered": [
            "IFY-S2",
            "IFY"
          ],
          "questionCount": 1,
          "mcqCount": 0,
          "structuredCount": 1,
          "countsByLevel": {
            "IFY": 0,
            "IFY-S1": 0,
            "IFY-S2": 1
          },
          "subtopics": [
            {
              "id": "ncuk-ac5-1",
              "code": "AC5.1",
              "title": "Gravitational Fields, Orbits and Kepler's Laws",
              "level": "IFY-S2",
              "levelsCovered": [
                "IFY-S2",
                "IFY"
              ],
              "questionCount": 1,
              "mcqCount": 0,
              "structuredCount": 1,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 1
              }
            },
            {
              "id": "ncuk-ac5-2",
              "code": "AC5.2",
              "title": "Astronomy, Stellar Evolution and Blackbody Radiation",
              "level": "IFY-S2",
              "levelsCovered": [
                "IFY-S2",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac5-3",
              "code": "AC5.3",
              "title": "Cosmology, Redshift and the Big Bang",
              "level": "IFY-S2",
              "levelsCovered": [
                "IFY-S2",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            }
          ]
        },
        {
          "id": "ncuk-ac6",
          "code": "AC6 / LO6",
          "title": "Oscillations and Waves",
          "syllabus": "ncuk",
          "levelsCovered": [
            "IFY-S2",
            "IFY"
          ],
          "questionCount": 4,
          "mcqCount": 2,
          "structuredCount": 2,
          "countsByLevel": {
            "IFY": 3,
            "IFY-S1": 0,
            "IFY-S2": 1
          },
          "subtopics": [
            {
              "id": "ncuk-ac6-1",
              "code": "AC6.1",
              "title": "Simple Harmonic Motion, Damping and Resonance",
              "level": "IFY-S2",
              "levelsCovered": [
                "IFY-S2",
                "IFY"
              ],
              "questionCount": 2,
              "mcqCount": 1,
              "structuredCount": 1,
              "countsByLevel": {
                "IFY": 1,
                "IFY-S1": 0,
                "IFY-S2": 1
              }
            },
            {
              "id": "ncuk-ac6-2",
              "code": "AC6.2",
              "title": "Wave Properties, Electromagnetic Spectrum and Malus's Law",
              "level": "IFY-S2",
              "levelsCovered": [
                "IFY-S2",
                "IFY"
              ],
              "questionCount": 1,
              "mcqCount": 0,
              "structuredCount": 1,
              "countsByLevel": {
                "IFY": 1,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac6-3",
              "code": "AC6.3",
              "title": "Reflection, Refraction, Dispersion and Total Internal Reflection",
              "level": "IFY-S2",
              "levelsCovered": [
                "IFY-S2",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac6-4",
              "code": "AC6.4",
              "title": "Superposition, Interference and Diffraction Gratings",
              "level": "IFY-S2",
              "levelsCovered": [
                "IFY-S2",
                "IFY"
              ],
              "questionCount": 1,
              "mcqCount": 1,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 1,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac6-5",
              "code": "AC6.5",
              "title": "Stationary Waves in Strings and Air Pipes",
              "level": "IFY-S2",
              "levelsCovered": [
                "IFY-S2",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            }
          ]
        },
        {
          "id": "ncuk-ac7",
          "code": "AC7 / LO7",
          "title": "Atomic Nucleus, Radioactivity, Fission and Fusion",
          "syllabus": "ncuk",
          "levelsCovered": [
            "IFY-S2",
            "IFY"
          ],
          "questionCount": 1,
          "mcqCount": 0,
          "structuredCount": 1,
          "countsByLevel": {
            "IFY": 0,
            "IFY-S1": 0,
            "IFY-S2": 1
          },
          "subtopics": [
            {
              "id": "ncuk-ac7-1",
              "code": "AC7.1",
              "title": "Atomic Nucleus, Alpha Scattering and Nuclear Density",
              "level": "IFY-S2",
              "levelsCovered": [
                "IFY-S2",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac7-2",
              "code": "AC7.2",
              "title": "Radioactivity, Exponential Decay and Half-Life",
              "level": "IFY-S2",
              "levelsCovered": [
                "IFY-S2",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac7-3",
              "code": "AC7.3",
              "title": "Mass Defect, Binding Energy, Fission and Fusion",
              "level": "IFY-S2",
              "levelsCovered": [
                "IFY-S2",
                "IFY"
              ],
              "questionCount": 1,
              "mcqCount": 0,
              "structuredCount": 1,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 1
              }
            }
          ]
        },
        {
          "id": "ncuk-ac8",
          "code": "AC8 / LO8",
          "title": "Quantum and Particle Physics",
          "syllabus": "ncuk",
          "levelsCovered": [
            "IFY-S2",
            "IFY"
          ],
          "questionCount": 0,
          "mcqCount": 0,
          "structuredCount": 0,
          "countsByLevel": {
            "IFY": 0,
            "IFY-S1": 0,
            "IFY-S2": 0
          },
          "subtopics": [
            {
              "id": "ncuk-ac8-1",
              "code": "AC8.1",
              "title": "Photons, Line Spectra and the Photoelectric Effect",
              "level": "IFY-S2",
              "levelsCovered": [
                "IFY-S2",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac8-2",
              "code": "AC8.2",
              "title": "Wave-Particle Duality and Heisenberg's Uncertainty Principle",
              "level": "IFY-S2",
              "levelsCovered": [
                "IFY-S2",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            },
            {
              "id": "ncuk-ac8-3",
              "code": "AC8.3",
              "title": "The Standard Model, Quarks, Antimatter and Beta Decay",
              "level": "IFY-S2",
              "levelsCovered": [
                "IFY-S2",
                "IFY"
              ],
              "questionCount": 0,
              "mcqCount": 0,
              "structuredCount": 0,
              "countsByLevel": {
                "IFY": 0,
                "IFY-S1": 0,
                "IFY-S2": 0
              }
            }
          ]
        }
      ]
    }
  },
  "items": [
    {
      "id": "sp-graphs-0277-mcq",
      "syllabi": [
        {
          "syllabus": "ib",
          "level": "HL",
          "topicId": "ib-theme-a",
          "subtopicId": "ib-a2-forces-momentum"
        },
        {
          "syllabus": "alevel",
          "level": "Y13",
          "topicId": "alevel-sec4-mechanics-materials",
          "subtopicId": "alevel-3-4-1-force-energy-momentum"
        },
        {
          "syllabus": "ncuk",
          "level": "IFY",
          "topicId": "ncuk-ac2",
          "subtopicId": "ncuk-ac2-6"
        }
      ],
      "format": "mcq",
      "difficulty": "foundation",
      "visualFamily": "cartesian_plot",
      "totalMarks": 1,
      "hasSvg": true,
      "chunkKey": "graphs",
      "conceptId": "linear-momentum-impulse",
      "familyGroupKey": "linear-momentum-impulse::pt-momentum-gradient-kinetic-work"
    },
    {
      "id": "sp-circuits-11-structured-234",
      "syllabi": [
        {
          "syllabus": "ib",
          "level": "SL",
          "topicId": "ib-theme-b",
          "subtopicId": "ib-b5-current-circuits"
        },
        {
          "syllabus": "alevel",
          "level": "Y13",
          "topicId": "alevel-sec5-electricity",
          "subtopicId": "alevel-3-5-1-current-electricity"
        },
        {
          "syllabus": "ncuk",
          "level": "IFY-S1",
          "topicId": "ncuk-ac4",
          "subtopicId": "ncuk-ac4-2"
        }
      ],
      "format": "structured",
      "difficulty": "higher",
      "visualFamily": "circuit_network",
      "totalMarks": 6,
      "hasSvg": true,
      "chunkKey": "circuits",
      "conceptId": "resistivity-ohmic-conductors",
      "familyGroupKey": "resistivity-ohmic-conductors::cylindrical-wire-resistivity-circuit"
    },
    {
      "id": "sp-fields-mcq-0064",
      "syllabi": [
        {
          "syllabus": "ib",
          "level": "SL",
          "topicId": "ib-theme-d",
          "subtopicId": "ib-d2-electric-magnetic-fields"
        },
        {
          "syllabus": "alevel",
          "level": "Y13",
          "topicId": "alevel-sec7-fields-consequences",
          "subtopicId": "alevel-3-7-3-electric-fields"
        },
        {
          "syllabus": "ncuk",
          "level": "IFY-S2",
          "topicId": "ncuk-ac4",
          "subtopicId": "ncuk-ac4-5"
        }
      ],
      "format": "mcq",
      "difficulty": "higher",
      "visualFamily": "field_map",
      "totalMarks": 1,
      "hasSvg": true,
      "chunkKey": "fields",
      "conceptId": "electrostatic-coulomb-uniform-fields",
      "familyGroupKey": "electrostatic-coulomb-uniform-fields::symbolic-superposition-field-multiple"
    },
    {
      "id": "sp-mech-structured-0199",
      "syllabi": [
        {
          "syllabus": "ib",
          "level": "SL",
          "topicId": "ib-theme-a",
          "subtopicId": "ib-a2-forces-momentum"
        },
        {
          "syllabus": "alevel",
          "level": "Y12",
          "topicId": "alevel-sec4-mechanics-materials",
          "subtopicId": "alevel-3-4-1-force-energy-momentum"
        },
        {
          "syllabus": "ncuk",
          "level": "IFY-S1",
          "topicId": "ncuk-ac2",
          "subtopicId": "ncuk-ac2-6"
        }
      ],
      "format": "structured",
      "difficulty": "standard",
      "visualFamily": "mechanics_scene",
      "totalMarks": 6,
      "hasSvg": true,
      "chunkKey": "mechanics",
      "conceptId": "linear-momentum-impulse",
      "familyGroupKey": "linear-momentum-impulse::inelastic-cart-collision-energy-loss"
    },
    {
      "id": "sp-v2-waves-mcq-0125",
      "syllabi": [
        {
          "syllabus": "ib",
          "level": "HL",
          "topicId": "ib-theme-c",
          "subtopicId": "ib-c3-wave-phenomena"
        },
        {
          "syllabus": "alevel",
          "level": "Y13",
          "topicId": "alevel-sec3-waves",
          "subtopicId": "alevel-3-3-2-refraction-diffraction-interference"
        },
        {
          "syllabus": "ncuk",
          "level": "IFY",
          "topicId": "ncuk-ac6",
          "subtopicId": "ncuk-ac6-4"
        }
      ],
      "format": "mcq",
      "difficulty": "standard",
      "visualFamily": "waves",
      "totalMarks": 1,
      "hasSvg": true,
      "chunkKey": "waves",
      "conceptId": "single-slit-diffraction-gratings",
      "familyGroupKey": "single-slit-diffraction-gratings::grating-lines-per-mm-diffraction-angle"
    },
    {
      "id": "sp-optics-shm-struct-0270",
      "syllabi": [
        {
          "syllabus": "ib",
          "level": "SL",
          "topicId": "ib-theme-c",
          "subtopicId": "ib-c1-shm"
        },
        {
          "syllabus": "alevel",
          "level": "Y13",
          "topicId": "alevel-sec6-further-mechanics-thermal",
          "subtopicId": "alevel-3-6-1-periodic-motion-shm"
        },
        {
          "syllabus": "ncuk",
          "level": "IFY-S2",
          "topicId": "ncuk-ac6",
          "subtopicId": "ncuk-ac6-1"
        }
      ],
      "format": "structured",
      "difficulty": "standard",
      "visualFamily": "optics-shm",
      "totalMarks": 6,
      "hasSvg": true,
      "chunkKey": "optics-shm",
      "conceptId": "simple-harmonic-motion",
      "familyGroupKey": "simple-harmonic-motion::shm-defining-acceleration-phase-portrait"
    },
    {
      "id": "sp-thermal-mcq-0220",
      "syllabi": [
        {
          "syllabus": "ib",
          "level": "SL",
          "topicId": "ib-theme-b",
          "subtopicId": "ib-b1-thermal-energy-transfers"
        },
        {
          "syllabus": "alevel",
          "level": "Y13",
          "topicId": "alevel-sec6-further-mechanics-thermal",
          "subtopicId": "alevel-3-6-2-thermal-physics"
        },
        {
          "syllabus": "ncuk",
          "level": "IFY",
          "topicId": "ncuk-ac3",
          "subtopicId": "ncuk-ac3-3"
        }
      ],
      "format": "mcq",
      "difficulty": "standard",
      "visualFamily": "thermal",
      "totalMarks": 1,
      "hasSvg": true,
      "chunkKey": "thermal",
      "conceptId": "specific-heat-latent-heat",
      "familyGroupKey": "specific-heat-latent-heat::electrical-heater-phase-change-power-time"
    },
    {
      "id": "ga-circular-orbit-energy-str-008",
      "syllabi": [
        {
          "syllabus": "ib",
          "level": "SL",
          "topicId": "ib-theme-d",
          "subtopicId": "ib-d1-gravitational-fields"
        },
        {
          "syllabus": "alevel",
          "level": "Y13",
          "topicId": "alevel-sec7-fields-consequences",
          "subtopicId": "alevel-3-7-2-gravitational-fields"
        },
        {
          "syllabus": "ncuk",
          "level": "IFY-S2",
          "topicId": "ncuk-ac5",
          "subtopicId": "ncuk-ac5-1"
        }
      ],
      "format": "structured",
      "difficulty": "foundation",
      "visualFamily": "grav-astro",
      "totalMarks": 6,
      "hasSvg": true,
      "chunkKey": "grav-astro",
      "conceptId": "gravitational-force-field",
      "familyGroupKey": "gravitational-force-field::circular-orbit-velocity-and-kepler"
    },
    {
      "id": "sp-v2-em-induction-mcq-0100",
      "syllabi": [
        {
          "syllabus": "ib",
          "level": "HL",
          "topicId": "ib-theme-d",
          "subtopicId": "ib-d4-induction"
        },
        {
          "syllabus": "alevel",
          "level": "Y13",
          "topicId": "alevel-sec7-fields-consequences",
          "subtopicId": "alevel-3-7-5-magnetic-fields-induction-ac"
        },
        {
          "syllabus": "ncuk",
          "level": "IFY-S2",
          "topicId": "ncuk-ac4",
          "subtopicId": "ncuk-ac4-6"
        }
      ],
      "format": "mcq",
      "difficulty": "standard",
      "visualFamily": "em-induction",
      "totalMarks": 1,
      "hasSvg": true,
      "chunkKey": "em-induction",
      "conceptId": "electromagnetic-induction-faraday-lenz",
      "familyGroupKey": "electromagnetic-induction-faraday-lenz::faraday-field-reversal-induced-charge"
    },
    {
      "id": "sp-qn-structured-245",
      "syllabi": [
        {
          "syllabus": "ib",
          "level": "SL",
          "topicId": "ib-theme-e",
          "subtopicId": "ib-e4-fission"
        },
        {
          "syllabus": "alevel",
          "level": "Y13",
          "topicId": "alevel-sec8-nuclear-physics",
          "subtopicId": "alevel-3-8-nuclear-decay-energy"
        },
        {
          "syllabus": "ncuk",
          "level": "IFY-S2",
          "topicId": "ncuk-ac7",
          "subtopicId": "ncuk-ac7-3"
        }
      ],
      "format": "structured",
      "difficulty": "foundation",
      "visualFamily": "quantum-nuclear",
      "totalMarks": 5,
      "hasSvg": true,
      "chunkKey": "quantum-nuclear",
      "conceptId": "nuclear-fission-fusion",
      "familyGroupKey": "nuclear-fission-fusion::fission-fusion-reaction-q-value"
    },
    {
      "id": "sp-graphs-0193-struct",
      "syllabi": [
        {
          "syllabus": "ib",
          "level": "SL",
          "topicId": "ib-theme-a",
          "subtopicId": "ib-a1-kinematics"
        },
        {
          "syllabus": "alevel",
          "level": "Y12",
          "topicId": "alevel-sec4-mechanics-materials",
          "subtopicId": "alevel-3-4-1-force-energy-momentum"
        },
        {
          "syllabus": "ncuk",
          "level": "IFY-S1",
          "topicId": "ncuk-ac2",
          "subtopicId": "ncuk-ac2-1"
        }
      ],
      "format": "structured",
      "difficulty": "foundation",
      "visualFamily": "cartesian_plot",
      "totalMarks": 5,
      "hasSvg": true,
      "chunkKey": "graphs",
      "conceptId": "motion-graphs",
      "familyGroupKey": "motion-graphs::vt-signed-rebound-distance"
    },
    {
      "id": "sp-circuits-09-mcq-176",
      "syllabi": [
        {
          "syllabus": "ib",
          "level": "SL",
          "topicId": "ib-theme-b",
          "subtopicId": "ib-b5-current-circuits"
        },
        {
          "syllabus": "alevel",
          "level": "Y13",
          "topicId": "alevel-sec5-electricity",
          "subtopicId": "alevel-3-5-1-current-electricity"
        },
        {
          "syllabus": "ncuk",
          "level": "IFY-S1",
          "topicId": "ncuk-ac4",
          "subtopicId": "ncuk-ac4-3"
        }
      ],
      "format": "mcq",
      "difficulty": "foundation",
      "visualFamily": "circuit_network",
      "totalMarks": 1,
      "hasSvg": true,
      "chunkKey": "circuits",
      "conceptId": "emf-internal-resistance",
      "familyGroupKey": "emf-internal-resistance::two-point-vi-emf-internal-resistance"
    },
    {
      "id": "sp-fields-struct-0330",
      "syllabi": [
        {
          "syllabus": "ib",
          "level": "HL",
          "topicId": "ib-theme-d",
          "subtopicId": "ib-d2-electric-magnetic-fields"
        },
        {
          "syllabus": "alevel",
          "level": "Y13",
          "topicId": "alevel-sec7-fields-consequences",
          "subtopicId": "alevel-3-7-3-electric-fields"
        },
        {
          "syllabus": "ncuk",
          "level": "IFY-S2",
          "topicId": "ncuk-ac4",
          "subtopicId": "ncuk-ac4-5"
        }
      ],
      "format": "structured",
      "difficulty": "higher",
      "visualFamily": "field_map",
      "totalMarks": 6,
      "hasSvg": true,
      "chunkKey": "fields",
      "conceptId": "electric-potential-equipotentials",
      "familyGroupKey": "electric-potential-equipotentials::coulomb-nuclear-potential-barrier"
    },
    {
      "id": "sp-mech-mcq-0329",
      "syllabi": [
        {
          "syllabus": "ib",
          "level": "SL",
          "topicId": "ib-theme-a",
          "subtopicId": "ib-a2-forces-momentum"
        },
        {
          "syllabus": "alevel",
          "level": "Y13",
          "topicId": "alevel-sec4-mechanics-materials",
          "subtopicId": "alevel-3-4-1-force-energy-momentum"
        },
        {
          "syllabus": "ncuk",
          "level": "IFY-S1",
          "topicId": "ncuk-ac2",
          "subtopicId": "ncuk-ac2-6"
        }
      ],
      "format": "mcq",
      "difficulty": "foundation",
      "visualFamily": "mechanics_scene",
      "totalMarks": 1,
      "hasSvg": true,
      "chunkKey": "mechanics",
      "conceptId": "linear-momentum-impulse",
      "familyGroupKey": "linear-momentum-impulse::head-on-signed-momentum-conservation"
    },
    {
      "id": "waves-malus-polarization-structured-303",
      "syllabi": [
        {
          "syllabus": "alevel",
          "level": "Y12",
          "topicId": "alevel-sec3-waves",
          "subtopicId": "alevel-3-3-1-progressive-stationary-waves"
        },
        {
          "syllabus": "ncuk",
          "level": "IFY",
          "topicId": "ncuk-ac6",
          "subtopicId": "ncuk-ac6-2"
        }
      ],
      "format": "structured",
      "difficulty": "foundation",
      "visualFamily": "waves",
      "totalMarks": 6,
      "hasSvg": true,
      "chunkKey": "waves",
      "conceptId": "progressive-waves-polarization",
      "familyGroupKey": "progressive-waves-polarization::malus-polarized-analyzer-transmission"
    },
    {
      "id": "sp-optics-shm-mcq-0111",
      "syllabi": [
        {
          "syllabus": "ib",
          "level": "HL",
          "topicId": "ib-theme-c",
          "subtopicId": "ib-c1-shm"
        },
        {
          "syllabus": "alevel",
          "level": "Y13",
          "topicId": "alevel-sec6-further-mechanics-thermal",
          "subtopicId": "alevel-3-6-1-periodic-motion-shm"
        },
        {
          "syllabus": "ncuk",
          "level": "IFY",
          "topicId": "ncuk-ac6",
          "subtopicId": "ncuk-ac6-1"
        }
      ],
      "format": "mcq",
      "difficulty": "standard",
      "visualFamily": "optics-shm",
      "totalMarks": 1,
      "hasSvg": true,
      "chunkKey": "optics-shm",
      "conceptId": "simple-harmonic-motion",
      "familyGroupKey": "simple-harmonic-motion::shm-velocity-displacement-phase-ellipse"
    },
    {
      "id": "sp-thermal-struct-0094",
      "syllabi": [
        {
          "syllabus": "ib",
          "level": "HL",
          "topicId": "ib-theme-b",
          "subtopicId": "ib-b1-thermal-energy-transfers"
        },
        {
          "syllabus": "alevel",
          "level": "Y13",
          "topicId": "alevel-sec6-further-mechanics-thermal",
          "subtopicId": "alevel-3-6-2-thermal-physics"
        },
        {
          "syllabus": "ncuk",
          "level": "IFY",
          "topicId": "ncuk-ac3",
          "subtopicId": "ncuk-ac3-3"
        }
      ],
      "format": "structured",
      "difficulty": "standard",
      "visualFamily": "thermal",
      "totalMarks": 6,
      "hasSvg": true,
      "chunkKey": "thermal",
      "conceptId": "specific-heat-latent-heat",
      "familyGroupKey": "specific-heat-latent-heat::ice-water-latent-mixing-and-coexistence"
    },
    {
      "id": "sp-pure-calc-0001",
      "syllabi": [
        {
          "syllabus": "ib",
          "level": "SL",
          "topicId": "ib-tools",
          "subtopicId": "ib-tools-measurement-uncertainties"
        },
        {
          "syllabus": "alevel",
          "level": "Y12",
          "topicId": "alevel-sec1-measurements-errors",
          "subtopicId": "alevel-3-1-si-uncertainties-estimation"
        },
        {
          "syllabus": "ncuk",
          "level": "IFY",
          "topicId": "ncuk-ac1",
          "subtopicId": "ncuk-ac1-1"
        }
      ],
      "format": "mcq",
      "difficulty": "foundation",
      "visualFamily": "none",
      "totalMarks": 1,
      "hasSvg": false,
      "chunkKey": "pure-calculation",
      "conceptId": "si-units-dimensional-analysis",
      "familyGroupKey": "si-units-dimensional-analysis::si-cubed-prefix-bulk-density"
    }
  ],
  "chunks": {
    "graphs": {
      "chunkKey": "graphs",
      "itemCount": 2
    },
    "circuits": {
      "chunkKey": "circuits",
      "itemCount": 2
    },
    "fields": {
      "chunkKey": "fields",
      "itemCount": 2
    },
    "mechanics": {
      "chunkKey": "mechanics",
      "itemCount": 2
    },
    "waves": {
      "chunkKey": "waves",
      "itemCount": 2
    },
    "optics-shm": {
      "chunkKey": "optics-shm",
      "itemCount": 2
    },
    "thermal": {
      "chunkKey": "thermal",
      "itemCount": 2
    },
    "grav-astro": {
      "chunkKey": "grav-astro",
      "itemCount": 1
    },
    "em-induction": {
      "chunkKey": "em-induction",
      "itemCount": 1
    },
    "quantum-nuclear": {
      "chunkKey": "quantum-nuclear",
      "itemCount": 1
    },
    "pure-calculation": {
      "chunkKey": "pure-calculation",
      "itemCount": 1
    }
  }
};
