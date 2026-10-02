export interface MechanicsSourceFixture {
  id: string;
  questionId: string;
  questionLabel: string;
  paper: "1A" | "2";
  level: "SL" | "HL";
  sourceId: string;
  sourcePdf: string;
  sourceSha256: string;
  sourcePages: number[];
  crops: string[];
  markscheme: {
    sourceId: string;
    pdf: string;
    sha256: string;
    pages: number[];
  };
  scope: string;
  sourceDiagramNotes: string[];
  expectedOption?: "A" | "B" | "C" | "D";
  evidence: string;
}
export const MECHANICS_SOURCE_FIXTURES: readonly MechanicsSourceFixture[] = [
  {
    id: "nov25-tz1-hl-1a-q1-projectile",
    questionId: "q_9626453c80cd6c0590de",
    questionLabel: "November 2025 TZ1 HL Paper 1A Q1",
    paper: "1A",
    level: "HL",
    sourceId: "src_f74642bf578e0fbc29cc",
    sourcePdf:
      "dataset/2025 Examination Session/November 2025 Examination Session/files and resources/Experimental sciences/Physics_paper_1A_TZ1_HL.pdf",
    sourceSha256:
      "eff0715e4fcaefaf0d20d8d4c14cd8b2e929449223f6d8742d50319810cd7e91",
    sourcePages: [2],
    crops: [
      "dataset/_derived/paper-mining-v0.1/assets/src_f74642bf578e0fbc29cc/p002_v01.png",
    ],
    markscheme: {
      sourceId: "src_dd0c97c7c32ad03f4c3b",
      pdf: "dataset/2025 Examination Session/November 2025 Examination Session/files and resources/Experimental sciences/Physics_paper_1A_TZ1_HL_markscheme.pdf",
      sha256:
        "554aa4059764c77d941ffb56ec18ec8abb1351b5439b0baf147b24e95b3d6fbd",
      pages: [1],
    },
    scope:
      "Complete source MCQ, reworded with the same givens and assessed deduction.",
    sourceDiagramNotes: [
      "horizontal baseline",
      "launch at left and landing at equal height to right",
      "dashed parabolic flight path",
      "launch-velocity arrow tangent up/right labelled v",
      "angle arc θ between initial velocity and horizontal",
      "no labelled range/height/time or answer-bearing annotation",
    ],
    expectedOption: "B",
    evidence:
      "Source diagram and linked scheme visually compared on 2026-10-01.",
  },
  {
    id: "nov25-tz1-hl-1a-q4-cart-collision",
    questionId: "q_33e39a79a74c1b762506",
    questionLabel: "November 2025 TZ1 HL Paper 1A Q4",
    paper: "1A",
    level: "HL",
    sourceId: "src_f74642bf578e0fbc29cc",
    sourcePdf:
      "dataset/2025 Examination Session/November 2025 Examination Session/files and resources/Experimental sciences/Physics_paper_1A_TZ1_HL.pdf",
    sourceSha256:
      "eff0715e4fcaefaf0d20d8d4c14cd8b2e929449223f6d8742d50319810cd7e91",
    sourcePages: [3],
    crops: [
      "dataset/_derived/paper-mining-v0.1/assets/src_f74642bf578e0fbc29cc/p003_v01.png",
    ],
    markscheme: {
      sourceId: "src_dd0c97c7c32ad03f4c3b",
      pdf: "dataset/2025 Examination Session/November 2025 Examination Session/files and resources/Experimental sciences/Physics_paper_1A_TZ1_HL_markscheme.pdf",
      sha256:
        "554aa4059764c77d941ffb56ec18ec8abb1351b5439b0baf147b24e95b3d6fbd",
      pages: [1],
    },
    scope:
      "Complete source MCQ, reworded with the same givens and assessed deduction.",
    sourceDiagramNotes: [
      "horizontal track",
      "two carts X(left) and Y(right)",
      "X mass label 2 kg",
      "Y mass label 1 kg",
      "rightward initial velocity arrow on X labelled 3 m s⁻¹",
      "stationary Y has no velocity arrow",
      "source figure represents pre-collision state only",
      "final unknown X velocity must not appear in student diagram",
    ],
    expectedOption: "A",
    evidence:
      "Source diagram and linked scheme visually compared on 2026-10-01.",
  },
  {
    id: "may25-tz3-hl-1a-q6-vertical-circle",
    questionId: "q_312eb4e33a6e1b404004",
    questionLabel: "May 2025 TZ3 HL Paper 1A Q6",
    paper: "1A",
    level: "HL",
    sourceId: "src_111ea8ab4a35db2436ae",
    sourcePdf:
      "dataset/2025 Examination Session/May 2025 Examination Session/files and resources/Experimental sciences/Physics_paper_1A_TZ3_HL.pdf",
    sourceSha256:
      "23ffdba02a00675f700b4a4571dbae09bdc0596fa13a13fb1ba9546123008c52",
    sourcePages: [4],
    crops: [
      "dataset/_derived/paper-mining-v0.1/assets/src_111ea8ab4a35db2436ae/p004_v01.png",
    ],
    markscheme: {
      sourceId: "src_3e77beb175aefbd3cb58",
      pdf: "dataset/2025 Examination Session/May 2025 Examination Session/files and resources/Experimental sciences/Physics_paper_1A_TZ3_HL_markscheme.pdf",
      sha256:
        "3f2f546c67c4ea458775808d1161df42089b83e0786141f857d39803d179773b",
      pages: [1],
    },
    scope:
      "Complete source MCQ, reworded with the same givens and assessed deduction.",
    sourceDiagramNotes: [
      "dashed vertical circle",
      "ball at lowest point",
      "string from circle centre vertically downward to ball",
      "radial dimension labelled 0.8 m",
      "no force arrows in original student source figure",
      "do not label computed tension in student visual",
    ],
    expectedOption: "D",
    evidence:
      "Source diagram and linked scheme visually compared on 2026-10-01.",
  },
  {
    id: "may26-tz3-hl-1a-q5-ramp-resistance",
    questionId: "q_e19a569fc0c232a2e13a",
    questionLabel: "May 2026 TZ3 HL Paper 1A Q5",
    paper: "1A",
    level: "HL",
    sourceId: "src_8a148b6249e004472daa",
    sourcePdf:
      "dataset/2026 Examination Session/May 2026 Examination Session/files and resources/Experimental sciences/Physics_paper_1A_TZ3_HL.pdf",
    sourceSha256:
      "7b42160467fd3c25940d94b8c09bfe9d8cb12a208d261ed8cf9e99149eb2860b",
    sourcePages: [3],
    crops: [
      "dataset/_derived/paper-mining-v0.1/assets/src_8a148b6249e004472daa/p003_v01.png",
    ],
    markscheme: {
      sourceId: "src_19c5e4bcd021a370c8f3",
      pdf: "dataset/2026 Examination Session/May 2026 Examination Session/files and resources/Experimental sciences/Physics_paper_1A_TZ3_HL_markscheme.pdf",
      sha256:
        "5e08000da4cd0055f7dfae337392ea39eb9d1808a4d401199d9e4cbb2ba1643f",
      pages: [1],
    },
    scope:
      "Complete source MCQ, reworded with the same givens and assessed deduction.",
    sourceDiagramNotes: [
      "ramp descends left to right",
      "crate at upper-left initial position and lower-right final position",
      "30 m dimension parallel to ramp covering displacement",
      "14 m vertical dimension spans corresponding height drop",
      "horizontal base/reference",
      "source explicitly says diagram not to scale",
      "no force arrow or computed force label in source figure",
    ],
    expectedOption: "D",
    evidence:
      "Source diagram and linked scheme visually compared on 2026-10-01.",
  },
  {
    id: "may26-tz2-sl-2-q1-incline-friction",
    questionId: "q_ebad008d7f9f76f2608c",
    questionLabel: "May 2026 TZ2 SL Paper 2 Q1",
    paper: "2",
    level: "SL",
    sourceId: "src_9fc970b2371569631f07",
    sourcePdf:
      "dataset/2026 Examination Session/May 2026 Examination Session/files and resources/Experimental sciences/Physics_paper_2_TZ2_SL.pdf",
    sourceSha256:
      "aec013029c80343d0c2fefebe63f76bf6c16b260999bab3db6bd6b8ae6312da9",
    sourcePages: [2],
    crops: [
      "dataset/_derived/paper-mining-v0.1/assets/src_9fc970b2371569631f07/p002_v01.png",
    ],
    markscheme: {
      sourceId: "src_4ac035c5d32632c0464e",
      pdf: "dataset/2026 Examination Session/May 2026 Examination Session/files and resources/Experimental sciences/Physics_paper_2_TZ2_SL_markscheme.pdf",
      sha256:
        "50ddbea35121110be932125412348d5acf4bfa215c3c258f8b8e0eee6300f9e1",
      pages: [2],
    },
    scope: "Complete original Q1: a, b(i), b(ii), c.",
    sourceDiagramNotes: [
      "Box on top of left-high/right-low inclined ramp",
      "Distance dimension is ALONG ramp (1.6 m), angle at bottom measured to horizontal (25 degrees)",
      "Mass label 1.3 kg belongs to box",
      "Student diagram need not show force answers for any FBD task",
    ],
    evidence:
      "Source diagrams and linked scheme visually compared on 2026-10-01.",
  },
  {
    id: "may26-tz3-hl-2-q2-pendulum-collision",
    questionId: "q_b694f14e53eb995d3a7c",
    questionLabel: "May 2026 TZ3 HL Paper 2 Q2",
    paper: "2",
    level: "HL",
    sourceId: "src_88b42b05ad36a23a42bf",
    sourcePdf:
      "dataset/2026 Examination Session/May 2026 Examination Session/files and resources/Experimental sciences/Physics_paper_2_TZ3_HL.pdf",
    sourceSha256:
      "1dc41de7dc67e6b4d1aeb0eb8c9d5a88086b84cbafd936ef3c47f7f71f69f22c",
    sourcePages: [4, 5],
    crops: [
      "dataset/_derived/paper-mining-v0.1/assets/src_88b42b05ad36a23a42bf/p004_v01.png",
      "dataset/_derived/paper-mining-v0.1/assets/src_88b42b05ad36a23a42bf/p005_v01.png",
    ],
    markscheme: {
      sourceId: "src_94e3aa19e98b0839139a",
      pdf: "dataset/2026 Examination Session/May 2026 Examination Session/files and resources/Experimental sciences/Physics_paper_2_TZ3_HL_markscheme.pdf",
      sha256:
        "b5dbcc8a3be10a3a7afdf163ac1fb358efd8beed318e54dce0057c79c2d55136",
      pages: [3],
    },
    scope: "Complete original Q2: a(i), a(ii), b.",
    sourceDiagramNotes: [
      "Initial horizontal string extends LEFT from fixed pivot S to moving ball; downward curved path to bottom",
      "Bottom tangential velocity rightwards; vertical string path can be dashed",
      "Second panel: moving ball hits identical stationary ball at bottom; combined pair swings upwards right",
      "Height h is measured VERTICALLY from lowest COM position to raised COM, not string displacement",
    ],
    evidence:
      "Source diagrams and linked scheme visually compared on 2026-10-01.",
  },
  {
    id: "may26-tz3-sl-2-q5-elastic-rope",
    questionId: "q_098d4a71baf2508c1784",
    questionLabel: "May 2026 TZ3 SL Paper 2 Q5",
    paper: "2",
    level: "SL",
    sourceId: "src_b6384f6b5207c4a4ace4",
    sourcePdf:
      "dataset/2026 Examination Session/May 2026 Examination Session/files and resources/Experimental sciences/Physics_paper_2_TZ3_SL.pdf",
    sourceSha256:
      "1d756e21ef057ac443c098cca4258f9fb13b6d6ab8ad04d5ddbd6d5f25585761",
    sourcePages: [10, 11],
    crops: [
      "dataset/_derived/paper-mining-v0.1/assets/src_b6384f6b5207c4a4ace4/p010_v01.png",
      "dataset/_derived/paper-mining-v0.1/assets/src_b6384f6b5207c4a4ace4/p010_v02.png",
    ],
    markscheme: {
      sourceId: "src_1bd7d3281341b5a5a35d",
      pdf: "dataset/2026 Examination Session/May 2026 Examination Session/files and resources/Experimental sciences/Physics_paper_2_TZ3_SL_markscheme.pdf",
      sha256:
        "b0b4832c771854d489a3a10bc5e43375b4f9963272c16e444b9dd1130e99361c",
      pages: [7, 8, 9],
    },
    scope:
      "Mechanics-only derivative of original Q5: retain a and all b(i–iv); explicitly omit c and d (water-wave interference).",
    sourceDiagramNotes: [
      "Three snapshot panels with identical pivot S at same height",
      "Panel 1 ball at S with slack rope",
      "Panel A ball directly below pivot, rope just taut of length 2.2 m",
      "Panel B ball directly below pivot at length 2.2+0.58 m; 0.58 m dimension between A and B, not full length",
      "Diagrams not to scale; source has same geometry in two extraction crops",
    ],
    evidence:
      "Source diagrams and linked scheme visually compared on 2026-10-01.",
  },
  {
    id: "nov25-tz3-sl-2-q2-truck-pendulum-circular-road",
    questionId: "q_cd524fa29e91446d7c24",
    questionLabel: "November 2025 TZ3 SL Paper 2 Q2",
    paper: "2",
    level: "SL",
    sourceId: "src_a8e0518f50610843217e",
    sourcePdf:
      "dataset/2025 Examination Session/November 2025 Examination Session/files and resources/Experimental sciences/Physics_paper_2_TZ3_SL.pdf",
    sourceSha256:
      "65932a0ee0975397dac6e61d0e818b0f5a5e138c1ffd0f8abb9df55bf3ee8c64",
    sourcePages: [4, 5, 7],
    crops: [
      "dataset/_derived/paper-mining-v0.1/assets/src_a8e0518f50610843217e/p004_v01.png",
      "dataset/_derived/paper-mining-v0.1/assets/src_a8e0518f50610843217e/p007_v01.png",
    ],
    markscheme: {
      sourceId: "src_d374c7ec82deb8af2d39",
      pdf: "dataset/2025 Examination Session/November 2025 Examination Session/files and resources/Experimental sciences/Physics_paper_2_TZ3_SL_markscheme.pdf",
      sha256:
        "e251e711377e51b8fbb04ebcc103ec60cffb53738ed67ea3dff160d0a43f7e6a",
      pages: [3, 4],
    },
    scope:
      "Complete original Q2: a(i), a(ii), b, c, d. Original PDF p6 is a blank answer-warning page.",
    sourceDiagramNotes: [
      "Scene 1 truck accelerates RIGHT; ball trails LEFT of pivot, string 30 deg from dashed true vertical",
      "Source FBD answer space is NOT a physical scene crop; do not count it as an additional source diagram",
      "Scene 2 top-down semicircular road: truck enters at upper-left tangent right; path sweeps rightward to lower-left station",
      "75 m is RADIUS from circle center to rightmost arc, not diameter",
      "Student scene must not display derived force vectors, speed limit, stopping distance, or arrival speed",
    ],
    evidence:
      "Source diagrams and linked scheme visually compared on 2026-10-01.",
  },
];
