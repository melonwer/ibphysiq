import {
  ALEVEL_PHYSICS_SYLLABUS,
  CROSSWALK_BY_CONCEPT_ID,
  getCompatibleSyllabiForConcept,
  getCrosswalkEntriesByVisualFamily,
  getCrosswalkEntry,
  getGeneratableSlices,
  getSubtopicById,
  getSyllabusCatalogue,
  getTopicById,
  getTopicsBySyllabus,
  IB_PHYSICS_SYLLABUS,
  NCUK_DATA_BOOKLET_CONSTANTS,
  NCUK_PHYSICS_SYLLABUS,
  QUESTION_FORMATS,
  SYLLABUS_CATALOGUES,
  SYLLABUS_CROSSWALK,
  SYLLABUS_IDS,
  VISUAL_FAMILY_HINTS,
} from '@/lib/constants/syllabi';

describe('SixthPhysics Multi-Syllabus Catalogues & Unified Crosswalk', () => {
  describe('Barrel exports and global identifier uniqueness', () => {
    it('exposes all three syllabi, 10 deterministic visual families, and 2 question formats', () => {
      expect(SYLLABUS_IDS).toEqual(['ib', 'alevel', 'ncuk']);
      expect(VISUAL_FAMILY_HINTS).toEqual([
        'graphs',
        'circuits',
        'fields',
        'mechanics',
        'waves',
        'optics-shm',
        'thermal',
        'grav-astro',
        'em-induction',
        'quantum-nuclear',
      ]);
      expect(QUESTION_FORMATS).toEqual(['mcq', 'structured']);

      expect(getSyllabusCatalogue('ib')).toBe(IB_PHYSICS_SYLLABUS);
      expect(getSyllabusCatalogue('alevel')).toBe(ALEVEL_PHYSICS_SYLLABUS);
      expect(getSyllabusCatalogue('ncuk')).toBe(NCUK_PHYSICS_SYLLABUS);
    });

    it('guarantees globally unique paper, topic, subtopic, equation, and concept IDs', () => {
      const paperIds = new Set<string>();
      const topicIds = new Set<string>();
      const subtopicIds = new Set<string>();
      const equationIds = new Set<string>();

      for (const syllabusId of SYLLABUS_IDS) {
        const catalogue = SYLLABUS_CATALOGUES[syllabusId];
        expect(catalogue.syllabus).toBe(syllabusId);

        for (const paper of catalogue.papers) {
          expect(paperIds.has(paper.paperId)).toBe(false);
          paperIds.add(paper.paperId);
        }

        for (const topic of catalogue.topics) {
          expect(topic.syllabus).toBe(syllabusId);
          expect(topicIds.has(topic.id)).toBe(false);
          topicIds.add(topic.id);
          expect(getTopicById(topic.id)).toBe(topic);

          for (const subtopic of topic.subtopics) {
            expect(subtopic.syllabus).toBe(syllabusId);
            expect(subtopicIds.has(subtopic.id)).toBe(false);
            subtopicIds.add(subtopic.id);
            expect(getSubtopicById(subtopic.id)).toBe(subtopic);
            expect(subtopic.levelsCovered).toContain(subtopic.level);
            expect(subtopic.visualFamilies.length).toBeGreaterThan(0);
            expect(subtopic.questionFormats.length).toBeGreaterThan(0);
            expect(subtopic.quantitativeSkills.length).toBeGreaterThan(0);
            expect(subtopic.qualitativeSkills.length).toBeGreaterThan(0);

            for (const eq of subtopic.equations) {
              expect(equationIds.has(eq.id)).toBe(false);
              equationIds.add(eq.id);
              expect(eq.latex.trim().length).toBeGreaterThan(0);
              expect(eq.plainText.trim().length).toBeGreaterThan(0);
            }
          }
        }
      }

      const conceptIds = new Set<string>();
      for (const entry of SYLLABUS_CROSSWALK) {
        expect(conceptIds.has(entry.conceptId)).toBe(false);
        conceptIds.add(entry.conceptId);
        expect(CROSSWALK_BY_CONCEPT_ID[entry.conceptId]).toBe(entry);
        expect(getCrosswalkEntry(entry.conceptId)).toBe(entry);
      }

      expect(getTopicById('non-existent-topic')).toBeUndefined();
      expect(getSubtopicById('non-existent-subtopic')).toBeUndefined();
      expect(getCrosswalkEntry('non-existent-concept')).toBeUndefined();
    });
  });

  describe('IB Physics (First Assessment May 2025) catalogue accuracy', () => {
    it('encodes Themes A-E + Tools, 110 SL / 180 HL hours, and 80% external paper weightings', () => {
      expect(IB_PHYSICS_SYLLABUS.specificationCode).toBe('IB-DP-PHYSICS-2025');
      expect(IB_PHYSICS_SYLLABUS.levels).toEqual(['SL', 'HL']);
      expect(IB_PHYSICS_SYLLABUS.topics).toHaveLength(6);

      const allSubtopics = IB_PHYSICS_SYLLABUS.topics.flatMap((t) => t.subtopics);
      expect(allSubtopics).toHaveLength(25);

      const slHours = IB_PHYSICS_SYLLABUS.topics.reduce(
        (sum, t) => sum + (t.teachingHours?.sl ?? 0),
        0,
      );
      const hlHours = IB_PHYSICS_SYLLABUS.topics.reduce(
        (sum, t) => sum + (t.teachingHours?.hl ?? 0),
        0,
      );
      expect(slHours).toBe(110);
      expect(hlHours).toBe(180);

      const slPaperWeight = IB_PHYSICS_SYLLABUS.papers
        .filter((p) => p.levels.includes('SL'))
        .reduce((sum, p) => sum + p.weightingPercent, 0);
      const hlPaperWeight = IB_PHYSICS_SYLLABUS.papers
        .filter((p) => p.levels.includes('HL'))
        .reduce((sum, p) => sum + p.weightingPercent, 0);
      expect(slPaperWeight).toBe(80);
      expect(hlPaperWeight).toBe(80);
      expect(
        IB_PHYSICS_SYLLABUS.papers.every(
          (p) => p.calculatorAllowed && p.dataBookletProvided,
        ),
      ).toBe(true);
    });

    it('identifies the exact 5 HL-only subtopics and excludes retired 2016 Option Topics', () => {
      const hlOnlyCodes = IB_PHYSICS_SYLLABUS.topics
        .flatMap((t) => t.subtopics)
        .filter((st) => st.level === 'HL')
        .map((st) => st.code);

      expect(hlOnlyCodes).toEqual(['A.4', 'A.5', 'B.4', 'D.4', 'E.2']);

      for (const topic of IB_PHYSICS_SYLLABUS.topics) {
        expect(topic.isOption).toBeFalsy();
        for (const subtopic of topic.subtopics) {
          expect(subtopic.isOption).toBeFalsy();
          if (subtopic.level === 'HL') {
            expect(subtopic.levelsCovered).toEqual(['HL']);
          } else {
            expect(subtopic.levelsCovered).toEqual(['SL', 'HL']);
          }
        }
      }

      expect(IB_PHYSICS_SYLLABUS.conventions.gravitationalAccelerationStandard).toContain(
        '9.8 m s^-2',
      );
    });
  });

  describe('UK GCE A-Level Physics (DfE Core + AQA 7407/7408) catalogue accuracy', () => {
    it('separates Year 12 (Sections 1-5), Year 13 Core (Sections 6-8), and Options (Sections 9-13)', () => {
      expect(ALEVEL_PHYSICS_SYLLABUS.levels).toEqual(['Y12', 'Y13']);
      expect(ALEVEL_PHYSICS_SYLLABUS.topics).toHaveLength(9);

      const allSubtopics = ALEVEL_PHYSICS_SYLLABUS.topics.flatMap((t) => t.subtopics);
      expect(allSubtopics).toHaveLength(20);

      const y12Subtopics = allSubtopics.filter((st) =>
        st.levelsCovered.includes('Y12'),
      );
      expect(y12Subtopics).toHaveLength(8);
      expect(y12Subtopics.every((st) => st.levelsCovered.includes('Y13'))).toBe(true);

      const optionSubtopics = allSubtopics.filter((st) => st.isOption);
      expect(optionSubtopics.map((st) => st.code)).toEqual([
        '3.9',
        '3.10',
        '3.11',
        '3.12',
        '3.13',
      ]);
      expect(
        optionSubtopics.every(
          (st) =>
            st.levelsCovered.length === 1 &&
            st.levelsCovered[0] === 'Y13' &&
            st.questionFormats.length === 1 &&
            st.questionFormats[0] === 'structured',
        ),
      ).toBe(true);

      const asWeight = ALEVEL_PHYSICS_SYLLABUS.papers
        .filter((p) => p.levels.includes('Y12'))
        .reduce((sum, p) => sum + p.weightingPercent, 0);
      const a2Weight = ALEVEL_PHYSICS_SYLLABUS.papers
        .filter((p) => p.levels.includes('Y13'))
        .reduce((sum, p) => sum + p.weightingPercent, 0);
      expect(asWeight).toBe(100);
      expect(a2Weight).toBe(100);
      expect(
        ALEVEL_PHYSICS_SYLLABUS.conventions.gravitationalAccelerationStandard,
      ).toContain('9.81 m s^-2');
    });
  });

  describe('NCUK IFY Physics (IFYPH005) catalogue and Data Booklet accuracy', () => {
    it('encodes AC1-AC8 (33 subtopics), 150h guided / 120h independent hours, and 20/30/50% assessments', () => {
      expect(NCUK_PHYSICS_SYLLABUS.specificationCode).toBe('IFYPH005');
      expect(NCUK_PHYSICS_SYLLABUS.levels).toEqual(['IFY-S1', 'IFY-S2', 'IFY']);
      expect(NCUK_PHYSICS_SYLLABUS.topics).toHaveLength(8);

      const allSubtopics = NCUK_PHYSICS_SYLLABUS.topics.flatMap((t) => t.subtopics);
      expect(allSubtopics).toHaveLength(33);

      const guidedHours = NCUK_PHYSICS_SYLLABUS.topics.reduce(
        (sum, t) => sum + (t.teachingHours?.guided ?? 0),
        0,
      );
      const independentHours = NCUK_PHYSICS_SYLLABUS.topics.reduce(
        (sum, t) => sum + (t.teachingHours?.independent ?? 0),
        0,
      );
      expect(guidedHours).toBe(150);
      expect(independentHours).toBe(120);

      const totalWeight = NCUK_PHYSICS_SYLLABUS.papers.reduce(
        (sum, p) => sum + p.weightingPercent,
        0,
      );
      expect(totalWeight).toBe(100);
      expect(NCUK_PHYSICS_SYLLABUS.papers.map((p) => p.weightingPercent)).toEqual([
        20, 30, 50,
      ]);
    });

    it('preserves NCUK Data Booklet constants and marking/sign conventions', () => {
      const bySymbol = Object.fromEntries(
        NCUK_DATA_BOOKLET_CONSTANTS.map((c) => [c.symbol, c]),
      );

      expect(bySymbol['g']?.numericValue).toBe(9.81);
      expect(bySymbol['e']?.numericValue).toBe(-1.6e-19);
      expect(bySymbol['h']?.numericValue).toBe(6.63e-34);
      expect(bySymbol['u']?.numericValue).toBe(1.66e-27);
      expect(bySymbol['b']?.numericValue).toBe(2.9e-3);
      expect(bySymbol['σ']?.numericValue).toBe(5.67e-8);

      expect(NCUK_PHYSICS_SYLLABUS.conventions.significantFiguresRule).toContain(
        '4 significant figures',
      );
      expect(NCUK_PHYSICS_SYLLABUS.conventions.significantFiguresRule).toContain(
        '3 significant figures',
      );
      expect(
        NCUK_PHYSICS_SYLLABUS.conventions.uncertaintyAndGraphConventions.some((s) =>
          s.includes('273.2'),
        ),
      ).toBe(true);
      expect(
        NCUK_PHYSICS_SYLLABUS.conventions.signConventions.some((s) =>
          s.includes('ΔU = ΔQ + ΔW'),
        ),
      ).toBe(true);
    });
  });

  describe('Unified 3-syllabus crosswalk integrity and physics boundaries', () => {
    it('maps all 56 canonical concepts and covers 100% of subtopics across all 3 catalogues', () => {
      expect(SYLLABUS_CROSSWALK).toHaveLength(56);

      for (const entry of SYLLABUS_CROSSWALK) {
        expect(entry.title.trim().length).toBeGreaterThan(0);
        expect(entry.summary.trim().length).toBeGreaterThan(0);
        expect(entry.sharedCoreSummary.trim().length).toBeGreaterThan(0);
        expect(entry.divergenceNotes.length).toBeGreaterThan(0);
        expect(VISUAL_FAMILY_HINTS).toContain(entry.primaryVisualFamily);

        const includedCount = SYLLABUS_IDS.filter(
          (sid) => entry.mappings[sid].included,
        ).length;
        expect(includedCount).toBeGreaterThanOrEqual(1);

        for (const sid of SYLLABUS_IDS) {
          const mapping = entry.mappings[sid];
          expect(mapping.syllabus).toBe(sid);
          expect(mapping.assumptionAndSignNotes.trim().length).toBeGreaterThan(0);

          if (!mapping.included) {
            expect(mapping.levels).toEqual([]);
            expect(mapping.topicIds).toEqual([]);
            expect(mapping.subtopicIds).toEqual([]);
            expect(mapping.questionFormats).toEqual([]);
            expect(mapping.equationsUsed).toEqual([]);
          } else {
            expect(mapping.levels.length).toBeGreaterThan(0);
            expect(mapping.topicIds.length).toBeGreaterThan(0);
            expect(mapping.subtopicIds.length).toBeGreaterThan(0);
            expect(mapping.questionFormats.length).toBeGreaterThan(0);
            expect(mapping.equationsUsed.length).toBeGreaterThan(0);

            const derivedParentTopicIds = Array.from(
              new Set(
                mapping.subtopicIds.map((subId) => {
                  const parentTopic = SYLLABUS_CATALOGUES[sid].topics.find((t) =>
                    t.subtopics.some((st) => st.id === subId),
                  );
                  expect(parentTopic).toBeDefined();
                  return parentTopic!.id;
                }),
              ),
            );
            expect([...mapping.topicIds].sort()).toEqual(
              [...derivedParentTopicIds].sort(),
            );

            for (const lvl of mapping.levels) {
              const coveredByMappedSubtopic = mapping.subtopicIds.some((subId) =>
                getSubtopicById(subId)?.levelsCovered.includes(lvl),
              );
              expect(coveredByMappedSubtopic).toBe(true);
            }
          }
        }
      }

      for (const sid of SYLLABUS_IDS) {
        const catalogue = SYLLABUS_CATALOGUES[sid];
        const referencedSubtopicIds = new Set(
          SYLLABUS_CROSSWALK.flatMap((c) =>
            c.mappings[sid].included ? c.mappings[sid].subtopicIds : [],
          ),
        );
        for (const topic of catalogue.topics) {
          for (const subtopic of topic.subtopics) {
            expect(referencedSubtopicIds.has(subtopic.id)).toBe(true);
            for (const conceptId of subtopic.canonicalConcepts) {
              const cwEntry = getCrosswalkEntry(conceptId);
              expect(cwEntry).toBeDefined();
              expect(cwEntry!.mappings[sid].included).toBe(true);
              expect(cwEntry!.mappings[sid].subtopicIds).toContain(subtopic.id);
            }
          }
        }
      }
    });

    it('enforces syllabus-exclusive exclusions, level inversions, and convention warnings', () => {
      // Excluded from IB 2025, included in A-Level + NCUK
      for (const cid of [
        'capacitor-networks-energy',
        'capacitor-rc-decay',
        'fundamental-particles-quarks-leptons',
      ]) {
        const entry = getCrosswalkEntry(cid)!;
        expect(entry.mappings.ib.included).toBe(false);
        expect(entry.mappings.alevel.included).toBe(true);
        expect(entry.mappings.ncuk.included).toBe(true);
      }

      // IB-exclusive environmental physics
      const greenhouse = getCrosswalkEntry('greenhouse-albedo-energy-balance')!;
      expect(greenhouse.mappings.ib.included).toBe(true);
      expect(greenhouse.mappings.alevel.included).toBe(false);
      expect(greenhouse.mappings.ncuk.included).toBe(false);

      // A-Level-exclusive geometric thin lenses
      const lenses = getCrosswalkEntry('thin-lenses-geometric-optics')!;
      expect(lenses.mappings.ib.included).toBe(false);
      expect(lenses.mappings.alevel.included).toBe(true);
      expect(lenses.mappings.ncuk.included).toBe(false);

      // IB HL + AQA Option (excluded from NCUK)
      for (const cid of [
        'rigid-body-rotational-dynamics',
        'thermodynamics-entropy-engines',
        'special-relativity-spacetime',
      ]) {
        const entry = getCrosswalkEntry(cid)!;
        expect(entry.mappings.ib.levels).toEqual(['HL']);
        expect(entry.mappings.alevel.levels).toEqual(['Y13']);
        expect(entry.mappings.ncuk.included).toBe(false);
      }

      // Heisenberg / Compton: IB HL + NCUK S2, excluded from A-Level
      const heisenberg = getCrosswalkEntry(
        'compton-scattering-heisenberg-uncertainty',
      )!;
      expect(heisenberg.mappings.ib.levels).toEqual(['HL']);
      expect(heisenberg.mappings.alevel.included).toBe(false);
      expect(heisenberg.mappings.ncuk.levels).toEqual(['IFY-S2', 'IFY']);

      // Level inversions: Photoelectric effect is HL in IB, Y12 in A-Level, IFY-S2 in NCUK
      const photoelectric = getCrosswalkEntry('photoelectric-effect')!;
      expect(photoelectric.mappings.ib.levels).toEqual(['HL']);
      expect(photoelectric.mappings.alevel.levels).toEqual(['Y12', 'Y13']);
      expect(photoelectric.mappings.ncuk.levels).toEqual(['IFY-S2', 'IFY']);

      // Convention notes: g = 9.8 vs 9.81, First Law work sign, Young's slits symbol s
      const suvat = getCrosswalkEntry('kinematics-suvat')!;
      expect(suvat.mappings.ib.assumptionAndSignNotes).toContain('9.8');
      expect(suvat.mappings.alevel.assumptionAndSignNotes).toContain('9.81');
      expect(suvat.mappings.ncuk.assumptionAndSignNotes).toContain('9.81');

      const pvCycles = getCrosswalkEntry('ideal-gas-pv-cycles')!;
      expect(pvCycles.mappings.ib.assumptionAndSignNotes).toContain('Q = ΔU + W');
      expect(pvCycles.mappings.ncuk.assumptionAndSignNotes).toContain(
        'ΔU = ΔQ + ΔW',
      );

      const doubleSlit = getCrosswalkEntry('double-slit-interference')!;
      expect(doubleSlit.divergenceNotes.join(' ')).toContain('s = λD/d');
      expect(doubleSlit.divergenceNotes.join(' ')).toContain('w = λD/s');
    });

    it('covers all 10 deterministic visual/solver families as primary domains', () => {
      let totalPrimary = 0;
      for (const vf of VISUAL_FAMILY_HINTS) {
        const primaryEntries = getCrosswalkEntriesByVisualFamily(vf);
        const withSupporting = getCrosswalkEntriesByVisualFamily(vf, {
          includeSupporting: true,
        });
        expect(primaryEntries.length).toBeGreaterThanOrEqual(2);
        expect(withSupporting.length).toBeGreaterThanOrEqual(
          primaryEntries.length,
        );
        totalPrimary += primaryEntries.length;
      }
      expect(totalPrimary).toBe(SYLLABUS_CROSSWALK.length);
    });
  });

  describe('Deterministic query helpers', () => {
    it('filters topics and subtopics accurately via getTopicsBySyllabus', () => {
      const ibSlTopics = getTopicsBySyllabus('ib', { level: 'SL' });
      const ibSlSubtopics = ibSlTopics.flatMap((t) => t.subtopics);
      expect(ibSlSubtopics).toHaveLength(20);
      expect(ibSlSubtopics.every((st) => st.levelsCovered.includes('SL'))).toBe(
        true,
      );

      const alevelY12 = getTopicsBySyllabus('alevel', { level: 'Y12' });
      expect(alevelY12).toHaveLength(5);
      expect(alevelY12.flatMap((t) => t.subtopics)).toHaveLength(8);

      const alevelCoreOnly = getTopicsBySyllabus('alevel', {
        includeOptions: false,
      });
      expect(alevelCoreOnly).toHaveLength(8);
      expect(alevelCoreOnly.flatMap((t) => t.subtopics)).toHaveLength(15);

      // NCUK AC4 splits cleanly between Semester 1 (AC4.1-4.4) and Semester 2 (AC4.5-4.6)
      const ncukS1 = getTopicsBySyllabus('ncuk', { level: 'IFY-S1' });
      const ncukS2 = getTopicsBySyllabus('ncuk', { level: 'IFY-S2' });
      const ncukFull = getTopicsBySyllabus('ncuk', { level: 'IFY' });

      expect(ncukS1.flatMap((t) => t.subtopics)).toHaveLength(17);
      expect(ncukS2.flatMap((t) => t.subtopics)).toHaveLength(16);
      expect(ncukFull.flatMap((t) => t.subtopics)).toHaveLength(33);
    });

    it('narrows syllabus compatibility via getCompatibleSyllabiForConcept', () => {
      expect(getCompatibleSyllabiForConcept('unknown-concept')).toEqual([]);

      // Option-topic filtering removes AQA Option 3.11 while keeping IB HL
      const rotWithOpt = getCompatibleSyllabiForConcept(
        'rigid-body-rotational-dynamics',
      );
      expect(rotWithOpt.map((m) => m.syllabus)).toEqual(['ib', 'alevel']);
      const rotCoreOnly = getCompatibleSyllabiForConcept(
        'rigid-body-rotational-dynamics',
        { excludeOptionTopics: true },
      );
      expect(rotCoreOnly.map((m) => m.syllabus)).toEqual(['ib']);

      // Mixed core + option trims option subtopic while retaining core subtopic
      const dcCore = getCompatibleSyllabiForConcept('kirchhoff-dc-circuits', {
        excludeOptionTopics: true,
      });
      const alevelDc = dcCore.find((m) => m.syllabus === 'alevel')!;
      expect(alevelDc.subtopicIds).toEqual(['alevel-3-5-1-current-electricity']);

      // Format filtering removes structured-only Option 3.9 and trims structured-only secondary subtopics
      const stellarMcq = getCompatibleSyllabiForConcept(
        'stellar-radiation-hr-diagram',
        { format: 'mcq' },
      );
      expect(stellarMcq.map((m) => m.syllabus)).toEqual(['ib', 'ncuk']);

      const dragMcq = getCompatibleSyllabiForConcept('fluid-drag-buoyancy', {
        format: 'mcq',
      });
      const alevelDragMcq = dragMcq.find((m) => m.syllabus === 'alevel')!;
      expect(alevelDragMcq.subtopicIds).not.toContain('alevel-3-12-turning-points');
      expect(alevelDragMcq.questionFormats).toEqual(['mcq']);

      // Level filtering narrows IB vectors/moments to SL A.2 (excluding HL-only A.4)
      const vectorsSl = getCompatibleSyllabiForConcept(
        'vectors-equilibrium-moments',
        { level: 'SL' },
      );
      expect(vectorsSl).toHaveLength(1);
      expect(vectorsSl[0]?.syllabus).toBe('ib');
      expect(vectorsSl[0]?.levels).toEqual(['SL']);
      expect(vectorsSl[0]?.subtopicIds).toEqual(['ib-a2-forces-momentum']);

      // Non-calculus and non-relativistic guards
      expect(
        getCompatibleSyllabiForConcept('capacitor-rc-decay', {
          requireNonCalculus: true,
        }),
      ).toEqual([]);
      expect(
        getCompatibleSyllabiForConcept('special-relativity-spacetime', {
          requireNonRelativistic: true,
        }),
      ).toEqual([]);
    });

    it('enumerates deduplicated, valid generation slices via getGeneratableSlices', () => {
      const defaultSlices = getGeneratableSlices();
      expect(defaultSlices).toHaveLength(539);

      const seenTuples = new Set<string>();
      for (const slice of defaultSlices) {
        const tupleKey = `${slice.conceptId}::${slice.syllabus}::${slice.level}::${slice.format}`;
        expect(seenTuples.has(tupleKey)).toBe(false);
        seenTuples.add(tupleKey);

        const topic = getTopicById(slice.topicId);
        const subtopic = getSubtopicById(slice.subtopicId);
        expect(topic).toBeDefined();
        expect(subtopic).toBeDefined();
        expect(topic!.syllabus).toBe(slice.syllabus);
        expect(subtopic!.syllabus).toBe(slice.syllabus);
        expect(subtopic!.levelsCovered).toContain(slice.level);
        expect(subtopic!.questionFormats).toContain(slice.format);
        expect(slice.assumptionNotes.trim().length).toBeGreaterThan(0);
      }

      const coreOnlySlices = getGeneratableSlices({ includeOptionTopics: false });
      expect(coreOnlySlices).toHaveLength(532);
      expect(
        coreOnlySlices.every((sl) => !getSubtopicById(sl.subtopicId)?.isOption),
      ).toBe(true);

      const withSecondary = getGeneratableSlices({
        includeSecondarySubtopics: true,
      });
      expect(withSecondary.length).toBeGreaterThan(defaultSlices.length);

      const multiFilter = getGeneratableSlices({
        syllabus: ['ib', 'ncuk'],
        visualFamily: ['circuits', 'em-induction'],
        format: 'mcq',
      });
      expect(multiFilter.length).toBeGreaterThan(0);
      expect(
        multiFilter.every(
          (sl) =>
            (sl.syllabus === 'ib' || sl.syllabus === 'ncuk') &&
            (sl.visualFamily === 'circuits' ||
              sl.visualFamily === 'em-induction') &&
            sl.format === 'mcq',
        ),
      ).toBe(true);

      const singleConceptS1 = getGeneratableSlices({
        conceptId: 'kinematics-suvat',
        syllabus: 'ncuk',
        level: 'IFY-S1',
      });
      expect(singleConceptS1).toHaveLength(2);
      expect(singleConceptS1.map((sl) => sl.format)).toEqual([
        'mcq',
        'structured',
      ]);
    });
  });
});
