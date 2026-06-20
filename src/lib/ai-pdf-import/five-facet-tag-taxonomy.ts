export type AIFiveFacetTagTaxonomyPlanVersion =
  "five_facet_tag_taxonomy_plan_v1";

export type AIFiveFacetTagTaxonomyPlanStatus =
  | "completed"
  | "completed_with_warnings"
  | "skipped"
  | "failed";

export type AIFiveFacetTagCategory =
  | "curriculum"
  | "concept"
  | "method"
  | "task"
  | "form";

export interface AIFiveFacetTagTaxonomyPlan {
  aliasIndex: AIFiveFacetAliasIndex;
  attemptDiagnosisContract: AIAttemptDiagnosisContract;
  generatedAt: string;
  mode: "planning_only";
  questionTagBundleContract: AIQuestionTagBundleContract;
  stats: AIFiveFacetTagTaxonomyStats;
  status: AIFiveFacetTagTaxonomyPlanStatus;
  taxonomy: AIFiveFacetTagTaxonomy;
  validation: AIFiveFacetTagTaxonomyValidation;
  version: AIFiveFacetTagTaxonomyPlanVersion;
  warnings: string[];
}

export interface AIFiveFacetTagTaxonomy {
  curriculum: AITagTree;
  concept: AITagTree;
  method: AITagTree;
  task: AITagTree;
  form: AITagTree;
}

export interface AITagTree {
  category: AIFiveFacetTagCategory;
  edges: AITagEdge[];
  label: string;
  nodes: AITagNode[];
  notes: string[];
  rootId: string;
}

export interface AITagNode {
  aliases: string[];
  category: AIFiveFacetTagCategory;
  description: string;
  exampleSignals: string[];
  label: string;
  parentTagIds: string[];
  source: "built_in_seed" | "future_ai_bootstrap" | "teacher_reviewed";
  status: "seed" | "draft" | "pending_review" | "approved";
  tagId: string;
}

export interface AITagEdge {
  edgeId: string;
  edgeKind:
    | "parent_child"
    | "prerequisite"
    | "related"
    | "maps_to"
    | "close_match"
    | "exact_match";
  fromTagId: string;
  toTagId: string;
}

export interface AIQuestionTagBundleContract {
  difficultyField: {
    max: 1;
    min: 0;
    taxonomyCategory: false;
    type: "number";
  };
  example: {
    difficulty: number;
    item_id: string;
    tags: Record<AIFiveFacetTagCategory, string[]>;
  };
  itemIdExample: string;
  recommendedTagLimits: {
    concept: { max: 4; min: 1 };
    curriculum: { max: 3; min: 1 };
    form: { max: 3; min: 1 };
    method: { max: 3; min: 0 };
    task: { max: 3; min: 1 };
    totalSuggestedMax: 12;
  };
  tags: Record<AIFiveFacetTagCategory, string[]>;
}

export interface AIAttemptDiagnosisContract {
  errorPatternLivesOnAttemptRecord: true;
  exampleAttemptDiagnosis: {
    attemptId: string;
    diagnosis: {
      confidence: number;
      errorPattern: string[];
      evidence: string;
    };
    isCorrect: boolean;
    itemId: string;
    studentAnswer: string;
  };
  futureQuestionMetadata: {
    diagnosticAffordance?: string[];
  };
  questionTaxonomyIncludesErrorPattern: false;
}

export interface AIFiveFacetAliasIndex {
  aliases: AIFiveFacetAliasMapping[];
  collisions: AIFiveFacetAliasCollision[];
}

export interface AIFiveFacetAliasMapping {
  alias: string;
  tagIds: string[];
}

export interface AIFiveFacetAliasCollision {
  alias: string;
  candidateTagIds: string[];
  warning: string;
}

export interface AIFiveFacetTagTaxonomyValidation {
  aliasCollisionsDetected: boolean;
  conceptIdsAvoidCoursePrefixes: boolean;
  curriculumMapsToConceptOnly: boolean;
  difficultyIsNumericFieldOnly: boolean;
  errors: string[];
  errorPatternIsAttemptOnly: boolean;
  exactlyFiveCategories: boolean;
  formTagsRepresentPresentation: boolean;
  methodTagsRepresentSolvingApproach: boolean;
  noDbMutation: true;
  noOfficialTagWrite: true;
  noProviderCall: true;
  noReviewDraftTagWrite: true;
  parentTagIdsExist: boolean;
  perQuestionTagLimitsDefined: boolean;
  planIsPlanningOnly: true;
  tagIdsMatchCategoryPrefixes: boolean;
  taskTagsRepresentQuestionDemand: boolean;
  valid: boolean;
  warnings: string[];
}

export interface AIFiveFacetTagTaxonomyStats {
  aliasCollisionCount: number;
  categoryCount: number;
  edgeCount: number;
  mappingEdgeCount: number;
  nodeCount: number;
  warningCount: number;
}

type SeedNode = Omit<
  AITagNode,
  "aliases" | "description" | "exampleSignals" | "source" | "status"
> & {
  aliases?: string[];
  description?: string;
  exampleSignals?: string[];
};

const CATEGORIES: AIFiveFacetTagCategory[] = [
  "curriculum",
  "concept",
  "method",
  "task",
  "form",
];

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function node(seed: SeedNode): AITagNode {
  return {
    aliases: seed.aliases ?? [],
    category: seed.category,
    description:
      seed.description ??
      `${seed.label} seed tag for the ${seed.category} facet.`,
    exampleSignals: seed.exampleSignals ?? [],
    label: seed.label,
    parentTagIds: seed.parentTagIds,
    source: "built_in_seed",
    status: "seed",
    tagId: seed.tagId,
  };
}

function parentEdge(fromTagId: string, toTagId: string): AITagEdge {
  return {
    edgeId: `edge.${fromTagId}.parent_child.${toTagId}`,
    edgeKind: "parent_child",
    fromTagId,
    toTagId,
  };
}

function mapEdge(fromTagId: string, toTagId: string): AITagEdge {
  return {
    edgeId: `edge.${fromTagId}.maps_to.${toTagId}`,
    edgeKind: "maps_to",
    fromTagId,
    toTagId,
  };
}

function buildTree({
  category,
  label,
  nodes,
  notes,
  rootId,
  mappingEdges = [],
}: {
  category: AIFiveFacetTagCategory;
  label: string;
  mappingEdges?: AITagEdge[];
  nodes: SeedNode[];
  notes: string[];
  rootId: string;
}): AITagTree {
  const builtNodes = nodes.map(node);
  const parentEdges = builtNodes.flatMap((tag) =>
    tag.parentTagIds.map((parentTagId) => parentEdge(parentTagId, tag.tagId)),
  );

  return {
    category,
    edges: [...parentEdges, ...mappingEdges],
    label,
    nodes: builtNodes,
    notes,
    rootId,
  };
}

export function buildCurriculumTagTree(): AITagTree {
  return buildTree({
    category: "curriculum",
    label: "Curriculum / exam overlays",
    mappingEdges: [
      mapEdge(
        "curriculum.bc.precalculus_11.quadratic_functions",
        "concept.algebra.functions.quadratic",
      ),
      mapEdge(
        "curriculum.ap.ap_precalculus",
        "concept.algebra.functions.polynomial",
      ),
      mapEdge(
        "curriculum.ap.ap_precalculus",
        "concept.algebra.functions.rational",
      ),
      mapEdge(
        "curriculum.ap.ap_precalculus",
        "concept.algebra.functions.exponential",
      ),
      mapEdge(
        "curriculum.ap.ap_precalculus",
        "concept.algebra.functions.logarithmic",
      ),
      mapEdge("curriculum.ap.ap_calculus_ab", "concept.calculus.limits"),
      mapEdge(
        "curriculum.ap.ap_calculus_ab",
        "concept.calculus.derivatives",
      ),
      mapEdge("curriculum.ap.ap_calculus_ab", "concept.calculus.integrals"),
      mapEdge("curriculum.ap.ap_calculus_bc", "concept.calculus.series"),
    ],
    nodes: [
      { category: "curriculum", label: "Curriculum", parentTagIds: [], tagId: "curriculum" },
      { category: "curriculum", label: "BC curriculum", parentTagIds: ["curriculum"], tagId: "curriculum.bc" },
      { category: "curriculum", label: "BC Precalculus 11", parentTagIds: ["curriculum.bc"], tagId: "curriculum.bc.precalculus_11" },
      { category: "curriculum", label: "Linear relations", parentTagIds: ["curriculum.bc.precalculus_11"], tagId: "curriculum.bc.precalculus_11.linear_relations" },
      { category: "curriculum", label: "Quadratic functions", parentTagIds: ["curriculum.bc.precalculus_11"], tagId: "curriculum.bc.precalculus_11.quadratic_functions" },
      { category: "curriculum", label: "Rational expressions", parentTagIds: ["curriculum.bc.precalculus_11"], tagId: "curriculum.bc.precalculus_11.rational_expressions" },
      { category: "curriculum", label: "Trigonometry", parentTagIds: ["curriculum.bc.precalculus_11"], tagId: "curriculum.bc.precalculus_11.trigonometry" },
      { category: "curriculum", label: "BC Precalculus 12", parentTagIds: ["curriculum.bc"], tagId: "curriculum.bc.precalculus_12" },
      { category: "curriculum", label: "Transformations", parentTagIds: ["curriculum.bc.precalculus_12"], tagId: "curriculum.bc.precalculus_12.transformations" },
      { category: "curriculum", label: "Polynomial functions", parentTagIds: ["curriculum.bc.precalculus_12"], tagId: "curriculum.bc.precalculus_12.polynomial_functions" },
      { category: "curriculum", label: "Rational functions", parentTagIds: ["curriculum.bc.precalculus_12"], tagId: "curriculum.bc.precalculus_12.rational_functions" },
      { category: "curriculum", label: "Logarithms", parentTagIds: ["curriculum.bc.precalculus_12"], tagId: "curriculum.bc.precalculus_12.logarithms" },
      { category: "curriculum", label: "AP curriculum", parentTagIds: ["curriculum"], tagId: "curriculum.ap" },
      { category: "curriculum", label: "AP Precalculus", parentTagIds: ["curriculum.ap"], tagId: "curriculum.ap.ap_precalculus" },
      { category: "curriculum", label: "AP Calculus AB", parentTagIds: ["curriculum.ap"], tagId: "curriculum.ap.ap_calculus_ab" },
      { category: "curriculum", label: "AP Calculus BC", parentTagIds: ["curriculum.ap"], tagId: "curriculum.ap.ap_calculus_bc" },
      { category: "curriculum", label: "SAT Math Advanced Math", parentTagIds: ["curriculum"], tagId: "curriculum.sat.math.advanced_math" },
      { category: "curriculum", label: "IB AA HL Calculus", parentTagIds: ["curriculum"], tagId: "curriculum.ib.aa_hl.calculus" },
      { category: "curriculum", label: "A-Level Pure Math", parentTagIds: ["curriculum"], tagId: "curriculum.a_level.pure_math" },
    ],
    notes: [
      "Curriculum is an overlay for course/exam/syllabus placement.",
      "Curriculum mapping to concept uses maps_to edges only.",
      "Curriculum tags must not become concept parents.",
    ],
    rootId: "curriculum",
  });
}

export function buildConceptTagTree(): AITagTree {
  return buildTree({
    category: "concept",
    label: "Canonical cross-course concepts",
    nodes: [
      { category: "concept", label: "Concept", parentTagIds: [], tagId: "concept" },
      { category: "concept", label: "Algebra expressions", parentTagIds: ["concept"], tagId: "concept.algebra.expressions" },
      { category: "concept", label: "Algebra equations", parentTagIds: ["concept"], tagId: "concept.algebra.equations" },
      { category: "concept", label: "Functions", parentTagIds: ["concept"], tagId: "concept.algebra.functions" },
      { category: "concept", label: "Linear functions", parentTagIds: ["concept.algebra.functions"], tagId: "concept.algebra.functions.linear" },
      { category: "concept", label: "Quadratic functions", parentTagIds: ["concept.algebra.functions"], tagId: "concept.algebra.functions.quadratic" },
      { category: "concept", label: "Quadratic vertex", parentTagIds: ["concept.algebra.functions.quadratic"], tagId: "concept.algebra.functions.quadratic.vertex" },
      { category: "concept", label: "Axis of symmetry", parentTagIds: ["concept.algebra.functions.quadratic"], tagId: "concept.algebra.functions.quadratic.axis_of_symmetry" },
      { category: "concept", label: "Opening direction", parentTagIds: ["concept.algebra.functions.quadratic"], tagId: "concept.algebra.functions.quadratic.opening_direction" },
      { category: "concept", label: "Extreme value", parentTagIds: ["concept.algebra.functions.quadratic"], tagId: "concept.algebra.functions.quadratic.extreme_value" },
      { category: "concept", label: "Where extreme occurs", parentTagIds: ["concept.algebra.functions.quadratic"], tagId: "concept.algebra.functions.quadratic.where_extreme_occurs" },
      { category: "concept", label: "Quadratic roots", parentTagIds: ["concept.algebra.functions.quadratic"], tagId: "concept.algebra.functions.quadratic.roots" },
      { category: "concept", label: "Quadratic transformations", parentTagIds: ["concept.algebra.functions.quadratic"], tagId: "concept.algebra.functions.quadratic.transformations" },
      { category: "concept", label: "Polynomial functions", parentTagIds: ["concept.algebra.functions"], tagId: "concept.algebra.functions.polynomial" },
      { category: "concept", label: "Rational functions", parentTagIds: ["concept.algebra.functions"], tagId: "concept.algebra.functions.rational" },
      { category: "concept", label: "Exponential functions", parentTagIds: ["concept.algebra.functions"], tagId: "concept.algebra.functions.exponential" },
      { category: "concept", label: "Logarithmic functions", parentTagIds: ["concept.algebra.functions"], tagId: "concept.algebra.functions.logarithmic" },
      { category: "concept", label: "Sequences", parentTagIds: ["concept"], tagId: "concept.algebra.sequences" },
      { category: "concept", label: "Limits", parentTagIds: ["concept"], tagId: "concept.calculus.limits" },
      { category: "concept", label: "Derivatives", parentTagIds: ["concept"], tagId: "concept.calculus.derivatives" },
      { category: "concept", label: "Chain rule", parentTagIds: ["concept.calculus.derivatives"], tagId: "concept.calculus.derivatives.chain_rule" },
      { category: "concept", label: "Product rule", parentTagIds: ["concept.calculus.derivatives"], tagId: "concept.calculus.derivatives.product_rule" },
      { category: "concept", label: "Quotient rule", parentTagIds: ["concept.calculus.derivatives"], tagId: "concept.calculus.derivatives.quotient_rule" },
      { category: "concept", label: "Integrals", parentTagIds: ["concept"], tagId: "concept.calculus.integrals" },
      { category: "concept", label: "Series", parentTagIds: ["concept"], tagId: "concept.calculus.series" },
      { category: "concept", label: "Right triangle trig", parentTagIds: ["concept"], tagId: "concept.trigonometry.right_triangle_trig" },
      { category: "concept", label: "Unit circle", parentTagIds: ["concept"], tagId: "concept.trigonometry.unit_circle" },
      { category: "concept", label: "Mean and median", parentTagIds: ["concept"], tagId: "concept.statistics.mean_median" },
      { category: "concept", label: "Standard deviation", parentTagIds: ["concept"], tagId: "concept.statistics.standard_deviation" },
      { category: "concept", label: "Conditional probability", parentTagIds: ["concept"], tagId: "concept.probability.conditional_probability" },
      { category: "concept", label: "Forces", parentTagIds: ["concept"], tagId: "concept.physics.mechanics.forces" },
      { category: "concept", label: "Conservation of energy", parentTagIds: ["concept"], tagId: "concept.physics.mechanics.energy.conservation_of_energy" },
      { category: "concept", label: "Momentum", parentTagIds: ["concept"], tagId: "concept.physics.mechanics.momentum" },
      { category: "concept", label: "Torque", parentTagIds: ["concept"], tagId: "concept.physics.mechanics.rotation.torque" },
    ],
    notes: [
      "Concept is the canonical cross-course knowledge graph.",
      "Concept IDs must not include curriculum prefixes such as AP, IB, SAT, A-Level, or BC.",
      "Concepts support future mastery graph relationships.",
    ],
    rootId: "concept",
  });
}

export function buildMethodTagTree(): AITagTree {
  return buildTree({
    category: "method",
    label: "Solving methods",
    nodes: [
      { category: "method", label: "Method", parentTagIds: [], tagId: "method" },
      { category: "method", label: "Expand", parentTagIds: ["method"], tagId: "method.algebraic_manipulation.expand" },
      { category: "method", label: "Factor", parentTagIds: ["method"], tagId: "method.algebraic_manipulation.factor" },
      { category: "method", label: "Complete the square", parentTagIds: ["method"], tagId: "method.algebraic_manipulation.complete_the_square" },
      { category: "method", label: "Isolate variable", parentTagIds: ["method"], tagId: "method.algebraic_manipulation.isolate_variable" },
      { category: "method", label: "Substitute", parentTagIds: ["method"], tagId: "method.algebraic_manipulation.substitute" },
      { category: "method", label: "Read from graph", parentTagIds: ["method"], tagId: "method.graph_reasoning.read_from_graph" },
      { category: "method", label: "Use intercepts", parentTagIds: ["method"], tagId: "method.graph_reasoning.use_intercepts" },
      { category: "method", label: "Use slope", parentTagIds: ["method"], tagId: "method.graph_reasoning.use_slope" },
      { category: "method", label: "Compare graph features", parentTagIds: ["method"], tagId: "method.graph_reasoning.compare_graph_features" },
      { category: "method", label: "Use axis of symmetry formula", parentTagIds: ["method"], tagId: "method.formula_based.use_axis_of_symmetry_formula" },
      { category: "method", label: "Use quadratic formula", parentTagIds: ["method"], tagId: "method.formula_based.use_quadratic_formula" },
      { category: "method", label: "Use derivative rule", parentTagIds: ["method"], tagId: "method.formula_based.use_derivative_rule" },
      { category: "method", label: "Define variable", parentTagIds: ["method"], tagId: "method.modeling.define_variable" },
      { category: "method", label: "Build equation", parentTagIds: ["method"], tagId: "method.modeling.build_equation" },
      { category: "method", label: "Interpret result", parentTagIds: ["method"], tagId: "method.modeling.interpret_result" },
      { category: "method", label: "Read from vertex form", parentTagIds: ["method"], tagId: "method.read_from_vertex_form" },
      { category: "method", label: "Interpret result in context", parentTagIds: ["method"], tagId: "method.interpret_result_in_context" },
    ],
    notes: [
      "Method describes how the student usually solves the problem.",
      "Method is not the tested knowledge concept.",
    ],
    rootId: "method",
  });
}

export function buildTaskTagTree(): AITagTree {
  return buildTree({
    category: "task",
    label: "Student task demands",
    nodes: [
      { category: "task", label: "Task", parentTagIds: [], tagId: "task" },
      { category: "task", label: "Identify vertex", parentTagIds: ["task"], tagId: "task.identify.identify_vertex" },
      { category: "task", label: "Identify intercepts", parentTagIds: ["task"], tagId: "task.identify.identify_intercepts" },
      { category: "task", label: "Identify graph feature", parentTagIds: ["task"], tagId: "task.identify.identify_graph_feature" },
      { category: "task", label: "Determine value", parentTagIds: ["task"], tagId: "task.determine.determine_value" },
      { category: "task", label: "Determine extreme value", parentTagIds: ["task"], tagId: "task.determine.determine_extreme_value" },
      { category: "task", label: "Determine where extreme occurs", parentTagIds: ["task"], tagId: "task.determine.determine_where_extreme_occurs" },
      { category: "task", label: "Determine roots", parentTagIds: ["task"], tagId: "task.determine.determine_roots" },
      { category: "task", label: "Determine equation", parentTagIds: ["task"], tagId: "task.determine.determine_equation" },
      { category: "task", label: "Rewrite to vertex form", parentTagIds: ["task"], tagId: "task.rewrite.rewrite_to_vertex_form" },
      { category: "task", label: "Rewrite to standard form", parentTagIds: ["task"], tagId: "task.rewrite.rewrite_to_standard_form" },
      { category: "task", label: "Simplify expression", parentTagIds: ["task"], tagId: "task.rewrite.simplify_expression" },
      { category: "task", label: "Explain reasoning", parentTagIds: ["task"], tagId: "task.explain.explain_reasoning" },
      { category: "task", label: "Explain error", parentTagIds: ["task"], tagId: "task.explain.explain_error" },
      { category: "task", label: "Justify answer", parentTagIds: ["task"], tagId: "task.explain.justify_answer" },
      { category: "task", label: "Build model", parentTagIds: ["task"], tagId: "task.model.build_model" },
      { category: "task", label: "Optimize quantity", parentTagIds: ["task"], tagId: "task.model.optimize_quantity" },
      { category: "task", label: "Interpret context", parentTagIds: ["task"], tagId: "task.model.interpret_context" },
    ],
    notes: [
      "Task represents what the question asks the student to do.",
      "Determine extreme value and determine where extreme occurs stay separate.",
    ],
    rootId: "task",
  });
}

export function buildFormTagTree(): AITagTree {
  return buildTree({
    category: "form",
    label: "Presentation, representation, and context",
    nodes: [
      { category: "form", label: "Form", parentTagIds: [], tagId: "form" },
      { category: "form", label: "Standard form", parentTagIds: ["form"], tagId: "form.symbolic.standard_form" },
      { category: "form", label: "Vertex form", parentTagIds: ["form"], tagId: "form.symbolic.vertex_form" },
      { category: "form", label: "Factored form", parentTagIds: ["form"], tagId: "form.symbolic.factored_form" },
      { category: "form", label: "Equation system", parentTagIds: ["form"], tagId: "form.symbolic.equation_system" },
      { category: "form", label: "Coordinate graph", parentTagIds: ["form"], tagId: "form.graph.coordinate_graph" },
      { category: "form", label: "Diagram", parentTagIds: ["form"], tagId: "form.visual.diagram" },
      { category: "form", label: "Geometric figure", parentTagIds: ["form"], tagId: "form.visual.geometric_figure" },
      { category: "form", label: "Input-output table", parentTagIds: ["form"], tagId: "form.table.input_output_table" },
      { category: "form", label: "Data table", parentTagIds: ["form"], tagId: "form.table.data_table" },
      { category: "form", label: "Word problem", parentTagIds: ["form"], tagId: "form.verbal.word_problem" },
      { category: "form", label: "Multi-sentence context", parentTagIds: ["form"], tagId: "form.verbal.multi_sentence_context" },
      { category: "form", label: "Pure math", parentTagIds: ["form"], tagId: "form.context.pure_math" },
      { category: "form", label: "Projectile motion", parentTagIds: ["form"], tagId: "form.context.projectile_motion" },
      { category: "form", label: "Area optimization", parentTagIds: ["form"], tagId: "form.context.area_optimization" },
      { category: "form", label: "Revenue/profit", parentTagIds: ["form"], tagId: "form.context.revenue_profit" },
      { category: "form", label: "Rate/motion", parentTagIds: ["form"], tagId: "form.context.rate_motion" },
      { category: "form", label: "Equation and graph", parentTagIds: ["form"], tagId: "form.mixed.equation_and_graph" },
    ],
    notes: [
      "Form covers symbolic, graph, table, visual, verbal, context, and mixed presentation.",
      "Form supports same-concept different-representation search.",
    ],
    rootId: "form",
  });
}

export function buildFiveFacetTagTaxonomy(): AIFiveFacetTagTaxonomy {
  return {
    concept: buildConceptTagTree(),
    curriculum: buildCurriculumTagTree(),
    form: buildFormTagTree(),
    method: buildMethodTagTree(),
    task: buildTaskTagTree(),
  };
}

export function buildFiveFacetAliasIndex(
  taxonomy: AIFiveFacetTagTaxonomy,
): AIFiveFacetAliasIndex {
  const aliases: AIFiveFacetAliasMapping[] = [
    { alias: "quadratic max", tagIds: ["concept.algebra.functions.quadratic.extreme_value"] },
    { alias: "maximum value", tagIds: ["concept.algebra.functions.quadratic.extreme_value"] },
    { alias: "where maximum occurs", tagIds: ["concept.algebra.functions.quadratic.where_extreme_occurs"] },
    { alias: "x value of vertex", tagIds: ["concept.algebra.functions.quadratic.where_extreme_occurs"] },
    { alias: "vertex form", tagIds: ["form.symbolic.vertex_form"] },
    { alias: "complete square", tagIds: ["method.algebraic_manipulation.complete_the_square"] },
    { alias: "read graph", tagIds: ["method.graph_reasoning.read_from_graph"] },
    { alias: "chain rule", tagIds: ["concept.calculus.derivatives.chain_rule"] },
    { alias: "composite derivative", tagIds: ["concept.calculus.derivatives.chain_rule"] },
    {
      alias: "vertex",
      tagIds: [
        "concept.algebra.functions.quadratic.vertex",
        "task.identify.identify_vertex",
      ],
    },
  ];
  const trees: AITagTree[] = Object.values(taxonomy);
  const tagIds = new Set(
    trees.flatMap((tree) => tree.nodes.map((tag) => tag.tagId)),
  );
  const normalized = aliases.map((mapping) => ({
    alias: mapping.alias,
    tagIds: mapping.tagIds.filter((tagId) => tagIds.has(tagId)),
  }));
  const collisions = normalized
    .filter((mapping) => mapping.tagIds.length > 1)
    .map((mapping) => ({
      alias: mapping.alias,
      candidateTagIds: mapping.tagIds,
      warning: `Alias "${mapping.alias}" maps to multiple facet tags and requires review.`,
    }));

  return {
    aliases: normalized,
    collisions,
  };
}

function buildQuestionTagBundleContract(): AIQuestionTagBundleContract {
  return {
    difficultyField: {
      max: 1,
      min: 0,
      taxonomyCategory: false,
      type: "number",
    },
    example: {
      difficulty: 0.48,
      item_id: "q_quad_001",
      tags: {
        concept: [
          "concept.algebra.functions.quadratic.vertex",
          "concept.algebra.functions.quadratic.extreme_value",
          "concept.algebra.functions.quadratic.where_extreme_occurs",
        ],
        curriculum: [
          "curriculum.bc.precalculus_11.quadratic_functions",
          "curriculum.ap.ap_precalculus",
        ],
        form: [
          "form.symbolic.vertex_form",
          "form.verbal.word_problem",
          "form.context.projectile_motion",
        ],
        method: [
          "method.read_from_vertex_form",
          "method.interpret_result_in_context",
        ],
        task: [
          "task.determine.determine_extreme_value",
          "task.determine.determine_where_extreme_occurs",
          "task.model.interpret_context",
        ],
      },
    },
    itemIdExample: "q_quad_001",
    recommendedTagLimits: {
      concept: { max: 4, min: 1 },
      curriculum: { max: 3, min: 1 },
      form: { max: 3, min: 1 },
      method: { max: 3, min: 0 },
      task: { max: 3, min: 1 },
      totalSuggestedMax: 12,
    },
    tags: {
      concept: [],
      curriculum: [],
      form: [],
      method: [],
      task: [],
    },
  };
}

function buildAttemptDiagnosisContract(): AIAttemptDiagnosisContract {
  return {
    errorPatternLivesOnAttemptRecord: true,
    exampleAttemptDiagnosis: {
      attemptId: "attempt_001",
      diagnosis: {
        confidence: 0.72,
        errorPattern: [
          "error.confuse_extreme_value_with_where_it_occurs",
          "error.confuse_input_output",
        ],
        evidence: "Student returned the x-value when the prompt asked for the maximum value.",
      },
      isCorrect: false,
      itemId: "q_quad_001",
      studentAnswer: "x = 3",
    },
    futureQuestionMetadata: {
      diagnosticAffordance: [
        "can_reveal_input_output_confusion",
        "can_reveal_graph_misread",
        "can_reveal_formula_selection_error",
      ],
    },
    questionTaxonomyIncludesErrorPattern: false,
  };
}

export function validateFiveFacetTagTaxonomyPlan({
  aliasIndex,
  planMode,
  taxonomy,
}: {
  aliasIndex: AIFiveFacetAliasIndex;
  planMode: AIFiveFacetTagTaxonomyPlan["mode"];
  taxonomy: AIFiveFacetTagTaxonomy;
}): AIFiveFacetTagTaxonomyValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const trees: AITagTree[] = Object.values(taxonomy);
  const categories = trees.map((tree) => tree.category);
  const exactlyFiveCategories =
    CATEGORIES.every((category) => categories.includes(category)) &&
    categories.length === CATEGORIES.length;
  const allNodes = trees.flatMap((tree) => tree.nodes);
  const allEdges = trees.flatMap((tree) => tree.edges);
  const allTagIds = new Set(allNodes.map((tag) => tag.tagId));
  const tagIdsMatchCategoryPrefixes = allNodes.every((tag) =>
    tag.tagId === tag.category || tag.tagId.startsWith(`${tag.category}.`),
  );
  const parentTagIdsExist = allNodes.every((tag) =>
    tag.parentTagIds.every((parentTagId) => allTagIds.has(parentTagId)),
  );
  const conceptIdsAvoidCoursePrefixes = taxonomy.concept.nodes.every(
    (tag) =>
      !/^concept\.(ap_|ib_|sat_|a_level_|bc\.)/.test(tag.tagId),
  );
  const curriculumMapsToConceptOnly = taxonomy.curriculum.edges
    .filter((edge) => edge.edgeKind === "maps_to")
    .every(
      (edge) =>
        edge.fromTagId.startsWith("curriculum.") &&
        edge.toTagId.startsWith("concept."),
    );
  const methodTagsRepresentSolvingApproach = taxonomy.method.notes.some((note) =>
    note.toLowerCase().includes("solve"),
  );
  const taskTagsRepresentQuestionDemand = taxonomy.task.notes.some((note) =>
    note.toLowerCase().includes("asks"),
  );
  const formTagsRepresentPresentation = taxonomy.form.notes.some((note) =>
    note.toLowerCase().includes("presentation"),
  );

  if (!exactlyFiveCategories) errors.push("exactly_five_categories_required");
  if (!tagIdsMatchCategoryPrefixes) errors.push("tag_id_prefix_mismatch");
  if (!parentTagIdsExist) errors.push("parent_tag_id_missing");
  if (!conceptIdsAvoidCoursePrefixes) errors.push("concept_course_prefix_detected");
  if (!curriculumMapsToConceptOnly) errors.push("invalid_curriculum_concept_mapping");
  if (planMode !== "planning_only") errors.push("plan_must_be_planning_only");
  if (aliasIndex.collisions.length) warnings.push("five_facet_taxonomy_alias_collision");

  return {
    aliasCollisionsDetected: aliasIndex.collisions.length > 0,
    conceptIdsAvoidCoursePrefixes,
    curriculumMapsToConceptOnly,
    difficultyIsNumericFieldOnly: true,
    errors,
    errorPatternIsAttemptOnly: true,
    exactlyFiveCategories,
    formTagsRepresentPresentation,
    methodTagsRepresentSolvingApproach,
    noDbMutation: true,
    noOfficialTagWrite: true,
    noProviderCall: true,
    noReviewDraftTagWrite: true,
    parentTagIdsExist,
    perQuestionTagLimitsDefined: true,
    planIsPlanningOnly: true,
    tagIdsMatchCategoryPrefixes,
    taskTagsRepresentQuestionDemand,
    valid: errors.length === 0,
    warnings,
  };
}

function stats({
  aliasIndex,
  taxonomy,
  warnings,
}: {
  aliasIndex: AIFiveFacetAliasIndex;
  taxonomy: AIFiveFacetTagTaxonomy;
  warnings: string[];
}): AIFiveFacetTagTaxonomyStats {
  const trees = Object.values(taxonomy);
  const edges = trees.flatMap((tree) => tree.edges);

  return {
    aliasCollisionCount: aliasIndex.collisions.length,
    categoryCount: trees.length,
    edgeCount: edges.length,
    mappingEdgeCount: edges.filter((edge) => edge.edgeKind === "maps_to").length,
    nodeCount: trees.flatMap((tree) => tree.nodes).length,
    warningCount: warnings.length,
  };
}

export function buildAIFiveFacetTagTaxonomyPlan({
  generatedAt = new Date().toISOString(),
}: {
  generatedAt?: string;
} = {}): AIFiveFacetTagTaxonomyPlan {
  const taxonomy = buildFiveFacetTagTaxonomy();
  const aliasIndex = buildFiveFacetAliasIndex(taxonomy);
  const validation = validateFiveFacetTagTaxonomyPlan({
    aliasIndex,
    planMode: "planning_only",
    taxonomy,
  });
  const warnings = uniqueStrings([
    "five_facet_taxonomy_planning_only",
    "five_facet_taxonomy_no_db_write",
    "five_facet_taxonomy_no_official_tag_write",
    "five_facet_taxonomy_no_review_draft_write",
    "five_facet_taxonomy_curriculum_overlay_only",
    "five_facet_taxonomy_concept_is_canonical",
    "five_facet_taxonomy_error_pattern_attempt_only",
    "five_facet_taxonomy_difficulty_numeric_only",
    ...validation.warnings,
    "five_facet_taxonomy_summary_limited",
  ]);

  return {
    aliasIndex,
    attemptDiagnosisContract: buildAttemptDiagnosisContract(),
    generatedAt,
    mode: "planning_only",
    questionTagBundleContract: buildQuestionTagBundleContract(),
    stats: stats({ aliasIndex, taxonomy, warnings }),
    status:
      validation.errors.length > 0
        ? "completed_with_warnings"
        : validation.warnings.length
          ? "completed_with_warnings"
          : "completed",
    taxonomy,
    validation: {
      ...validation,
      warnings,
    },
    version: "five_facet_tag_taxonomy_plan_v1",
    warnings,
  };
}

export function failedAIFiveFacetTagTaxonomyPlan({
  generatedAt = new Date().toISOString(),
  warnings,
}: {
  generatedAt?: string;
  warnings: string[];
}): AIFiveFacetTagTaxonomyPlan {
  const taxonomy = buildFiveFacetTagTaxonomy();
  const aliasIndex = buildFiveFacetAliasIndex(taxonomy);
  const finalWarnings = uniqueStrings([
    "five_facet_taxonomy_planning_only",
    "five_facet_taxonomy_no_db_write",
    "five_facet_taxonomy_no_official_tag_write",
    "five_facet_taxonomy_no_review_draft_write",
    ...warnings,
  ]);

  return {
    aliasIndex,
    attemptDiagnosisContract: buildAttemptDiagnosisContract(),
    generatedAt,
    mode: "planning_only",
    questionTagBundleContract: buildQuestionTagBundleContract(),
    stats: stats({ aliasIndex, taxonomy, warnings: finalWarnings }),
    status: "failed",
    taxonomy,
    validation: {
      ...validateFiveFacetTagTaxonomyPlan({
        aliasIndex,
        planMode: "planning_only",
        taxonomy,
      }),
      warnings: finalWarnings,
    },
    version: "five_facet_tag_taxonomy_plan_v1",
    warnings: finalWarnings,
  };
}

export function mergeAIFiveFacetTagTaxonomyPlanIntoSummary(
  existingAiPdfImport: Record<string, unknown>,
  fiveFacetTagTaxonomyPlan: AIFiveFacetTagTaxonomyPlan,
) {
  return {
    ...existingAiPdfImport,
    fiveFacetTagTaxonomyPlan,
  };
}
