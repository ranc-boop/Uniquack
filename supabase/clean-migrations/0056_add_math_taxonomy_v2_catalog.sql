-- Forward-only expansion of the canonical Math taxonomy catalog.
--
-- Source catalog: supabase/development/reset_math_taxonomy_seed_development_only.sql
-- Safety contract:
--   * never deletes taxonomy nodes, edges, aliases, question assignments, rubric links, or evidence;
--   * preserves existing labels, descriptions, sort orders, metadata, and historical assignments;
--   * inserts only missing catalog rows and aborts on structural identifier collisions;
--   * derives assignability from the final graph, so historical branch assignments remain readable
--     while new assignments must target active leaves;
--   * rebuilds only the derived taxonomy_node_closure cache inside this transaction.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local idle_in_transaction_session_timeout = '120s';
set constraints all deferred;

select pg_advisory_xact_lock(hashtextextended('edustruct:taxonomy:math_taxonomy_v2', 0));

lock table
  public.taxonomy_nodes,
  public.taxonomy_facets,
  public.taxonomy_edges,
  public.taxonomy_aliases
in share row exclusive mode;

create temporary table _math_taxonomy_v2_nodes (
  tag_id text primary key,
  node_kind text not null,
  subject_tag_id text,
  facet_key text,
  label text not null,
  description text,
  is_assignable boolean not null,
  sort_order integer not null,
  status text not null,
  metadata jsonb not null
) on commit drop;

insert into _math_taxonomy_v2_nodes (
  tag_id,
  node_kind,
  subject_tag_id,
  facet_key,
  label,
  description,
  is_assignable,
  sort_order,
  status,
  metadata
) values
  ('math', 'subject', null, null, 'Math', 'Root of the mathematics taxonomy.', false, 0, 'active', '{"seed":"math_taxonomy_v2","subject":"math","display":"id_only"}'::jsonb),
  ('math.curriculum', 'facet_root', 'math', 'curriculum', 'Curriculum', 'Root node for math curriculum.', false, 1, 'active', '{"seed":"math_taxonomy_v2","facet":"curriculum","display":"id_only"}'::jsonb),
  ('math.concept', 'facet_root', 'math', 'concept', 'Concept', 'Root node for math concept.', false, 2, 'active', '{"seed":"math_taxonomy_v2","facet":"concept","display":"id_only"}'::jsonb),
  ('math.method', 'facet_root', 'math', 'method', 'Method', 'Root node for math method.', false, 3, 'active', '{"seed":"math_taxonomy_v2","facet":"method","display":"id_only"}'::jsonb),
  ('math.task', 'facet_root', 'math', 'task', 'Task', 'Root node for math task.', false, 4, 'active', '{"seed":"math_taxonomy_v2","facet":"task","display":"id_only"}'::jsonb),
  ('math.form', 'facet_root', 'math', 'form', 'Form', 'Root node for math form.', false, 5, 'active', '{"seed":"math_taxonomy_v2","facet":"form","display":"id_only"}'::jsonb),
  ('math.concept.number_quantity', 'tag', 'math', 'concept', 'Number Quantity', 'math.concept.number_quantity taxonomy node.', true, 6, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.number_quantity.arithmetic_operations', 'tag', 'math', 'concept', 'Arithmetic Operations', 'math.concept.number_quantity.arithmetic_operations taxonomy node.', true, 7, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.number_quantity.fractions_decimals_percents', 'tag', 'math', 'concept', 'Fractions Decimals Percents', 'math.concept.number_quantity.fractions_decimals_percents taxonomy node.', true, 8, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.number_quantity.ratios_rates_proportions', 'tag', 'math', 'concept', 'Ratios Rates Proportions', 'math.concept.number_quantity.ratios_rates_proportions taxonomy node.', true, 9, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.number_quantity.exponents_roots', 'tag', 'math', 'concept', 'Exponents Roots', 'math.concept.number_quantity.exponents_roots taxonomy node.', true, 10, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.number_quantity.rational_exponents', 'tag', 'math', 'concept', 'Rational Exponents', 'math.concept.number_quantity.rational_exponents taxonomy node.', true, 11, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.number_quantity.radicals', 'tag', 'math', 'concept', 'Radicals', 'math.concept.number_quantity.radicals taxonomy node.', true, 12, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.number_quantity.complex_numbers', 'tag', 'math', 'concept', 'Complex Numbers', 'math.concept.number_quantity.complex_numbers taxonomy node.', true, 13, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.number_quantity.units_dimensional', 'tag', 'math', 'concept', 'Units Dimensional', 'math.concept.number_quantity.units_dimensional taxonomy node.', true, 14, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.algebra', 'tag', 'math', 'concept', 'Algebra', 'math.concept.algebra taxonomy node.', true, 15, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.algebra.expressions', 'tag', 'math', 'concept', 'Expressions', 'math.concept.algebra.expressions taxonomy node.', true, 16, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.algebra.expressions.variables_expressions', 'tag', 'math', 'concept', 'Variables Expressions', 'math.concept.algebra.expressions.variables_expressions taxonomy node.', true, 17, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.algebra.expressions.polynomial_expressions', 'tag', 'math', 'concept', 'Polynomial Expressions', 'math.concept.algebra.expressions.polynomial_expressions taxonomy node.', true, 18, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.algebra.expressions.rational_expressions', 'tag', 'math', 'concept', 'Rational Expressions', 'math.concept.algebra.expressions.rational_expressions taxonomy node.', true, 19, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.algebra.expressions.radical_expressions', 'tag', 'math', 'concept', 'Radical Expressions', 'math.concept.algebra.expressions.radical_expressions taxonomy node.', true, 20, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.algebra.expressions.exponent_rules', 'tag', 'math', 'concept', 'Exponent Rules', 'math.concept.algebra.expressions.exponent_rules taxonomy node.', true, 21, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.algebra.expressions.simplifying_expressions', 'tag', 'math', 'concept', 'Simplifying Expressions', 'math.concept.algebra.expressions.simplifying_expressions taxonomy node.', true, 22, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.algebra.equations', 'tag', 'math', 'concept', 'Equations', 'math.concept.algebra.equations taxonomy node.', true, 23, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.algebra.equations.linear_equations', 'tag', 'math', 'concept', 'Linear Equations', 'math.concept.algebra.equations.linear_equations taxonomy node.', true, 24, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.algebra.equations.absolute_value_equations', 'tag', 'math', 'concept', 'Absolute Value Equations', 'math.concept.algebra.equations.absolute_value_equations taxonomy node.', true, 25, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.algebra.equations.quadratic_equations', 'tag', 'math', 'concept', 'Quadratic Equations', 'math.concept.algebra.equations.quadratic_equations taxonomy node.', true, 26, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.algebra.equations.polynomial_equations', 'tag', 'math', 'concept', 'Polynomial Equations', 'math.concept.algebra.equations.polynomial_equations taxonomy node.', true, 27, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.algebra.equations.rational_equations', 'tag', 'math', 'concept', 'Rational Equations', 'math.concept.algebra.equations.rational_equations taxonomy node.', true, 28, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.algebra.equations.radical_equations', 'tag', 'math', 'concept', 'Radical Equations', 'math.concept.algebra.equations.radical_equations taxonomy node.', true, 29, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.algebra.equations.exponential_equations', 'tag', 'math', 'concept', 'Exponential Equations', 'math.concept.algebra.equations.exponential_equations taxonomy node.', true, 30, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.algebra.equations.logarithmic_equations', 'tag', 'math', 'concept', 'Logarithmic Equations', 'math.concept.algebra.equations.logarithmic_equations taxonomy node.', true, 31, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.algebra.equations.systems_linear', 'tag', 'math', 'concept', 'Systems Linear', 'math.concept.algebra.equations.systems_linear taxonomy node.', true, 32, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.algebra.equations.systems_nonlinear', 'tag', 'math', 'concept', 'Systems Nonlinear', 'math.concept.algebra.equations.systems_nonlinear taxonomy node.', true, 33, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.algebra.inequalities', 'tag', 'math', 'concept', 'Inequalities', 'math.concept.algebra.inequalities taxonomy node.', true, 34, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.algebra.inequalities.linear_inequalities', 'tag', 'math', 'concept', 'Linear Inequalities', 'math.concept.algebra.inequalities.linear_inequalities taxonomy node.', true, 35, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.algebra.inequalities.systems_inequalities', 'tag', 'math', 'concept', 'Systems Inequalities', 'math.concept.algebra.inequalities.systems_inequalities taxonomy node.', true, 36, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.algebra.sequences_series', 'tag', 'math', 'concept', 'Sequences Series', 'math.concept.algebra.sequences_series taxonomy node.', true, 37, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.algebra.sequences_series.arithmetic_sequences', 'tag', 'math', 'concept', 'Arithmetic Sequences', 'math.concept.algebra.sequences_series.arithmetic_sequences taxonomy node.', true, 38, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.algebra.sequences_series.geometric_sequences', 'tag', 'math', 'concept', 'Geometric Sequences', 'math.concept.algebra.sequences_series.geometric_sequences taxonomy node.', true, 39, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.algebra.sequences_series.recursive_sequences', 'tag', 'math', 'concept', 'Recursive Sequences', 'math.concept.algebra.sequences_series.recursive_sequences taxonomy node.', true, 40, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.algebra.sequences_series.finite_series', 'tag', 'math', 'concept', 'Finite Series', 'math.concept.algebra.sequences_series.finite_series taxonomy node.', true, 41, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.algebra.sequences_series.sigma_notation', 'tag', 'math', 'concept', 'Sigma Notation', 'math.concept.algebra.sequences_series.sigma_notation taxonomy node.', true, 42, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions', 'tag', 'math', 'concept', 'Functions', 'math.concept.functions taxonomy node.', true, 43, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.basics', 'tag', 'math', 'concept', 'Basics', 'math.concept.functions.basics taxonomy node.', true, 44, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.basics.function_notation', 'tag', 'math', 'concept', 'Function Notation', 'math.concept.functions.basics.function_notation taxonomy node.', true, 45, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.basics.domain_range', 'tag', 'math', 'concept', 'Domain Range', 'math.concept.functions.basics.domain_range taxonomy node.', true, 46, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.basics.intercepts', 'tag', 'math', 'concept', 'Intercepts', 'math.concept.functions.basics.intercepts taxonomy node.', true, 47, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.basics.average_rate_of_change', 'tag', 'math', 'concept', 'Average Rate Of Change', 'math.concept.functions.basics.average_rate_of_change taxonomy node.', true, 48, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.basics.composition', 'tag', 'math', 'concept', 'Composition', 'math.concept.functions.basics.composition taxonomy node.', true, 49, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.basics.inverse_functions', 'tag', 'math', 'concept', 'Inverse Functions', 'math.concept.functions.basics.inverse_functions taxonomy node.', true, 50, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.basics.transformations', 'tag', 'math', 'concept', 'Transformations', 'math.concept.functions.basics.transformations taxonomy node.', true, 51, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.linear', 'tag', 'math', 'concept', 'Linear', 'math.concept.functions.linear taxonomy node.', true, 52, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.linear.slope', 'tag', 'math', 'concept', 'Slope', 'math.concept.functions.linear.slope taxonomy node.', true, 53, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.linear.slope_intercept_form', 'tag', 'math', 'concept', 'Slope Intercept Form', 'math.concept.functions.linear.slope_intercept_form taxonomy node.', true, 54, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.linear.point_slope_form', 'tag', 'math', 'concept', 'Point Slope Form', 'math.concept.functions.linear.point_slope_form taxonomy node.', true, 55, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.linear.parallel_perpendicular', 'tag', 'math', 'concept', 'Parallel Perpendicular', 'math.concept.functions.linear.parallel_perpendicular taxonomy node.', true, 56, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.linear.linear_modeling', 'tag', 'math', 'concept', 'Linear Modeling', 'math.concept.functions.linear.linear_modeling taxonomy node.', true, 57, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.quadratic', 'tag', 'math', 'concept', 'Quadratic', 'math.concept.functions.quadratic taxonomy node.', true, 58, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.quadratic.standard_form', 'tag', 'math', 'concept', 'Standard Form', 'math.concept.functions.quadratic.standard_form taxonomy node.', true, 59, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.quadratic.vertex_form', 'tag', 'math', 'concept', 'Vertex Form', 'math.concept.functions.quadratic.vertex_form taxonomy node.', true, 60, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.quadratic.factored_form', 'tag', 'math', 'concept', 'Factored Form', 'math.concept.functions.quadratic.factored_form taxonomy node.', true, 61, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.quadratic.vertex', 'tag', 'math', 'concept', 'Vertex', 'math.concept.functions.quadratic.vertex taxonomy node.', true, 62, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.quadratic.axis_of_symmetry', 'tag', 'math', 'concept', 'Axis Of Symmetry', 'math.concept.functions.quadratic.axis_of_symmetry taxonomy node.', true, 63, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.quadratic.opening_direction', 'tag', 'math', 'concept', 'Opening Direction', 'math.concept.functions.quadratic.opening_direction taxonomy node.', true, 64, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.quadratic.roots_zeros', 'tag', 'math', 'concept', 'Roots Zeros', 'math.concept.functions.quadratic.roots_zeros taxonomy node.', true, 65, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.quadratic.discriminant', 'tag', 'math', 'concept', 'Discriminant', 'math.concept.functions.quadratic.discriminant taxonomy node.', true, 66, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.quadratic.extreme_value', 'tag', 'math', 'concept', 'Extreme Value', 'math.concept.functions.quadratic.extreme_value taxonomy node.', true, 67, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.quadratic.where_extreme_occurs', 'tag', 'math', 'concept', 'Where Extreme Occurs', 'math.concept.functions.quadratic.where_extreme_occurs taxonomy node.', true, 68, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.polynomial', 'tag', 'math', 'concept', 'Polynomial', 'math.concept.functions.polynomial taxonomy node.', true, 69, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.polynomial.end_behavior', 'tag', 'math', 'concept', 'End Behavior', 'math.concept.functions.polynomial.end_behavior taxonomy node.', true, 70, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.polynomial.zeros_multiplicity', 'tag', 'math', 'concept', 'Zeros Multiplicity', 'math.concept.functions.polynomial.zeros_multiplicity taxonomy node.', true, 71, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.polynomial.division', 'tag', 'math', 'concept', 'Division', 'math.concept.functions.polynomial.division taxonomy node.', true, 72, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.polynomial.remainder_factor_theorem', 'tag', 'math', 'concept', 'Remainder Factor Theorem', 'math.concept.functions.polynomial.remainder_factor_theorem taxonomy node.', true, 73, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.polynomial.graphs', 'tag', 'math', 'concept', 'Graphs', 'math.concept.functions.polynomial.graphs taxonomy node.', true, 74, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.rational', 'tag', 'math', 'concept', 'Rational', 'math.concept.functions.rational taxonomy node.', true, 75, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.rational.asymptotes', 'tag', 'math', 'concept', 'Asymptotes', 'math.concept.functions.rational.asymptotes taxonomy node.', true, 76, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.rational.holes', 'tag', 'math', 'concept', 'Holes', 'math.concept.functions.rational.holes taxonomy node.', true, 77, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.rational.transformations', 'tag', 'math', 'concept', 'Transformations', 'math.concept.functions.rational.transformations taxonomy node.', true, 78, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.rational.solving', 'tag', 'math', 'concept', 'Solving', 'math.concept.functions.rational.solving taxonomy node.', true, 79, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.exponential_logarithmic', 'tag', 'math', 'concept', 'Exponential Logarithmic', 'math.concept.functions.exponential_logarithmic taxonomy node.', true, 80, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.exponential_logarithmic.exponential_growth_decay', 'tag', 'math', 'concept', 'Exponential Growth Decay', 'math.concept.functions.exponential_logarithmic.exponential_growth_decay taxonomy node.', true, 81, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.exponential_logarithmic.exponential_functions', 'tag', 'math', 'concept', 'Exponential Functions', 'math.concept.functions.exponential_logarithmic.exponential_functions taxonomy node.', true, 82, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.exponential_logarithmic.logarithmic_functions', 'tag', 'math', 'concept', 'Logarithmic Functions', 'math.concept.functions.exponential_logarithmic.logarithmic_functions taxonomy node.', true, 83, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.exponential_logarithmic.exp_log_inverse_identity', 'tag', 'math', 'concept', 'Exp Log Inverse Identity', 'math.concept.functions.exponential_logarithmic.exp_log_inverse_identity taxonomy node.', true, 84, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.exponential_logarithmic.laws_of_logs', 'tag', 'math', 'concept', 'Laws Of Logs', 'math.concept.functions.exponential_logarithmic.laws_of_logs taxonomy node.', true, 85, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.exponential_logarithmic.exponential_models', 'tag', 'math', 'concept', 'Exponential Models', 'math.concept.functions.exponential_logarithmic.exponential_models taxonomy node.', true, 86, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.exponential_logarithmic.logarithmic_models', 'tag', 'math', 'concept', 'Logarithmic Models', 'math.concept.functions.exponential_logarithmic.logarithmic_models taxonomy node.', true, 87, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.piecewise_absolute', 'tag', 'math', 'concept', 'Piecewise Absolute', 'math.concept.functions.piecewise_absolute taxonomy node.', true, 88, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.piecewise_absolute.piecewise_functions', 'tag', 'math', 'concept', 'Piecewise Functions', 'math.concept.functions.piecewise_absolute.piecewise_functions taxonomy node.', true, 89, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.piecewise_absolute.absolute_value_functions', 'tag', 'math', 'concept', 'Absolute Value Functions', 'math.concept.functions.piecewise_absolute.absolute_value_functions taxonomy node.', true, 90, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.functions.piecewise_absolute.step_functions', 'tag', 'math', 'concept', 'Step Functions', 'math.concept.functions.piecewise_absolute.step_functions taxonomy node.', true, 91, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.geometry', 'tag', 'math', 'concept', 'Geometry', 'math.concept.geometry taxonomy node.', true, 92, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.geometry.lines_angles', 'tag', 'math', 'concept', 'Lines Angles', 'math.concept.geometry.lines_angles taxonomy node.', true, 93, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.geometry.triangles', 'tag', 'math', 'concept', 'Triangles', 'math.concept.geometry.triangles taxonomy node.', true, 94, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.geometry.right_triangle_trig', 'tag', 'math', 'concept', 'Right Triangle Trig', 'math.concept.geometry.right_triangle_trig taxonomy node.', true, 95, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.geometry.circles', 'tag', 'math', 'concept', 'Circles', 'math.concept.geometry.circles taxonomy node.', true, 96, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.geometry.polygons', 'tag', 'math', 'concept', 'Polygons', 'math.concept.geometry.polygons taxonomy node.', true, 97, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.geometry.area_perimeter', 'tag', 'math', 'concept', 'Area Perimeter', 'math.concept.geometry.area_perimeter taxonomy node.', true, 98, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.geometry.surface_area_volume', 'tag', 'math', 'concept', 'Surface Area Volume', 'math.concept.geometry.surface_area_volume taxonomy node.', true, 99, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.geometry.coordinate_geometry', 'tag', 'math', 'concept', 'Coordinate Geometry', 'math.concept.geometry.coordinate_geometry taxonomy node.', true, 100, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.geometry.transformations', 'tag', 'math', 'concept', 'Transformations', 'math.concept.geometry.transformations taxonomy node.', true, 101, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.geometry.similarity_congruence', 'tag', 'math', 'concept', 'Similarity Congruence', 'math.concept.geometry.similarity_congruence taxonomy node.', true, 102, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.geometry.vectors', 'tag', 'math', 'concept', 'Vectors', 'math.concept.geometry.vectors taxonomy node.', true, 103, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.geometry.conics', 'tag', 'math', 'concept', 'Conics', 'math.concept.geometry.conics taxonomy node.', true, 104, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.geometry.conics.parabola', 'tag', 'math', 'concept', 'Parabola', 'math.concept.geometry.conics.parabola taxonomy node.', true, 105, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.geometry.conics.circle', 'tag', 'math', 'concept', 'Circle', 'math.concept.geometry.conics.circle taxonomy node.', true, 106, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.geometry.conics.ellipse', 'tag', 'math', 'concept', 'Ellipse', 'math.concept.geometry.conics.ellipse taxonomy node.', true, 107, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.geometry.conics.hyperbola', 'tag', 'math', 'concept', 'Hyperbola', 'math.concept.geometry.conics.hyperbola taxonomy node.', true, 108, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.trigonometry', 'tag', 'math', 'concept', 'Trigonometry', 'math.concept.trigonometry taxonomy node.', true, 109, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.trigonometry.angle_measure', 'tag', 'math', 'concept', 'Angle Measure', 'math.concept.trigonometry.angle_measure taxonomy node.', true, 110, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.trigonometry.unit_circle', 'tag', 'math', 'concept', 'Unit Circle', 'math.concept.trigonometry.unit_circle taxonomy node.', true, 111, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.trigonometry.trig_ratios', 'tag', 'math', 'concept', 'Trig Ratios', 'math.concept.trigonometry.trig_ratios taxonomy node.', true, 112, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.trigonometry.trig_identities', 'tag', 'math', 'concept', 'Trig Identities', 'math.concept.trigonometry.trig_identities taxonomy node.', true, 113, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.trigonometry.trig_equations', 'tag', 'math', 'concept', 'Trig Equations', 'math.concept.trigonometry.trig_equations taxonomy node.', true, 114, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.trigonometry.trig_graphs', 'tag', 'math', 'concept', 'Trig Graphs', 'math.concept.trigonometry.trig_graphs taxonomy node.', true, 115, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.trigonometry.inverse_trig', 'tag', 'math', 'concept', 'Inverse Trig', 'math.concept.trigonometry.inverse_trig taxonomy node.', true, 116, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.trigonometry.law_sines_cosines', 'tag', 'math', 'concept', 'Law Sines Cosines', 'math.concept.trigonometry.law_sines_cosines taxonomy node.', true, 117, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.trigonometry.polar_coordinates', 'tag', 'math', 'concept', 'Polar Coordinates', 'math.concept.trigonometry.polar_coordinates taxonomy node.', true, 118, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus', 'tag', 'math', 'concept', 'Calculus', 'math.concept.calculus taxonomy node.', true, 119, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.limits', 'tag', 'math', 'concept', 'Limits', 'math.concept.calculus.limits taxonomy node.', true, 120, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.limits.one_sided_limits', 'tag', 'math', 'concept', 'One Sided Limits', 'math.concept.calculus.limits.one_sided_limits taxonomy node.', true, 121, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.limits.limit_laws', 'tag', 'math', 'concept', 'Limit Laws', 'math.concept.calculus.limits.limit_laws taxonomy node.', true, 122, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.limits.continuity', 'tag', 'math', 'concept', 'Continuity', 'math.concept.calculus.limits.continuity taxonomy node.', true, 123, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.limits.infinite_limits', 'tag', 'math', 'concept', 'Infinite Limits', 'math.concept.calculus.limits.infinite_limits taxonomy node.', true, 124, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.limits.limits_at_infinity', 'tag', 'math', 'concept', 'Limits At Infinity', 'math.concept.calculus.limits.limits_at_infinity taxonomy node.', true, 125, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.limits.squeeze_theorem', 'tag', 'math', 'concept', 'Squeeze Theorem', 'math.concept.calculus.limits.squeeze_theorem taxonomy node.', true, 126, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.derivatives', 'tag', 'math', 'concept', 'Derivatives', 'math.concept.calculus.derivatives taxonomy node.', true, 127, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.derivatives.derivative_definition', 'tag', 'math', 'concept', 'Derivative Definition', 'math.concept.calculus.derivatives.derivative_definition taxonomy node.', true, 128, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.derivatives.power_rule', 'tag', 'math', 'concept', 'Power Rule', 'math.concept.calculus.derivatives.power_rule taxonomy node.', true, 129, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.derivatives.product_rule', 'tag', 'math', 'concept', 'Product Rule', 'math.concept.calculus.derivatives.product_rule taxonomy node.', true, 130, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.derivatives.quotient_rule', 'tag', 'math', 'concept', 'Quotient Rule', 'math.concept.calculus.derivatives.quotient_rule taxonomy node.', true, 131, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.derivatives.chain_rule', 'tag', 'math', 'concept', 'Chain Rule', 'math.concept.calculus.derivatives.chain_rule taxonomy node.', true, 132, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.derivatives.implicit_differentiation', 'tag', 'math', 'concept', 'Implicit Differentiation', 'math.concept.calculus.derivatives.implicit_differentiation taxonomy node.', true, 133, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.derivatives.inverse_derivatives', 'tag', 'math', 'concept', 'Inverse Derivatives', 'math.concept.calculus.derivatives.inverse_derivatives taxonomy node.', true, 134, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.derivatives.exponential_derivatives', 'tag', 'math', 'concept', 'Exponential Derivatives', 'math.concept.calculus.derivatives.exponential_derivatives taxonomy node.', true, 135, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.derivatives.logarithmic_derivatives', 'tag', 'math', 'concept', 'Logarithmic Derivatives', 'math.concept.calculus.derivatives.logarithmic_derivatives taxonomy node.', true, 136, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.derivatives.trig_derivatives', 'tag', 'math', 'concept', 'Trig Derivatives', 'math.concept.calculus.derivatives.trig_derivatives taxonomy node.', true, 137, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.derivatives.inverse_trig_derivatives', 'tag', 'math', 'concept', 'Inverse Trig Derivatives', 'math.concept.calculus.derivatives.inverse_trig_derivatives taxonomy node.', true, 138, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.derivatives.higher_derivatives', 'tag', 'math', 'concept', 'Higher Derivatives', 'math.concept.calculus.derivatives.higher_derivatives taxonomy node.', true, 139, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.applications_derivatives', 'tag', 'math', 'concept', 'Applications Derivatives', 'math.concept.calculus.applications_derivatives taxonomy node.', true, 140, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.applications_derivatives.tangent_lines', 'tag', 'math', 'concept', 'Tangent Lines', 'math.concept.calculus.applications_derivatives.tangent_lines taxonomy node.', true, 141, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.applications_derivatives.related_rates', 'tag', 'math', 'concept', 'Related Rates', 'math.concept.calculus.applications_derivatives.related_rates taxonomy node.', true, 142, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.applications_derivatives.optimization', 'tag', 'math', 'concept', 'Optimization', 'math.concept.calculus.applications_derivatives.optimization taxonomy node.', true, 143, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.applications_derivatives.motion', 'tag', 'math', 'concept', 'Motion', 'math.concept.calculus.applications_derivatives.motion taxonomy node.', true, 144, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.applications_derivatives.mean_value_theorem', 'tag', 'math', 'concept', 'Mean Value Theorem', 'math.concept.calculus.applications_derivatives.mean_value_theorem taxonomy node.', true, 145, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.applications_derivatives.monotonicity_extrema', 'tag', 'math', 'concept', 'Monotonicity Extrema', 'math.concept.calculus.applications_derivatives.monotonicity_extrema taxonomy node.', true, 146, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.applications_derivatives.concavity_inflection', 'tag', 'math', 'concept', 'Concavity Inflection', 'math.concept.calculus.applications_derivatives.concavity_inflection taxonomy node.', true, 147, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.applications_derivatives.curve_sketching', 'tag', 'math', 'concept', 'Curve Sketching', 'math.concept.calculus.applications_derivatives.curve_sketching taxonomy node.', true, 148, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.integrals', 'tag', 'math', 'concept', 'Integrals', 'math.concept.calculus.integrals taxonomy node.', true, 149, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.integrals.antiderivatives', 'tag', 'math', 'concept', 'Antiderivatives', 'math.concept.calculus.integrals.antiderivatives taxonomy node.', true, 150, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.integrals.indefinite_integrals', 'tag', 'math', 'concept', 'Indefinite Integrals', 'math.concept.calculus.integrals.indefinite_integrals taxonomy node.', true, 151, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.integrals.definite_integrals', 'tag', 'math', 'concept', 'Definite Integrals', 'math.concept.calculus.integrals.definite_integrals taxonomy node.', true, 152, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.integrals.riemann_sums', 'tag', 'math', 'concept', 'Riemann Sums', 'math.concept.calculus.integrals.riemann_sums taxonomy node.', true, 153, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.integrals.fundamental_theorem', 'tag', 'math', 'concept', 'Fundamental Theorem', 'math.concept.calculus.integrals.fundamental_theorem taxonomy node.', true, 154, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.integrals.substitution', 'tag', 'math', 'concept', 'Substitution', 'math.concept.calculus.integrals.substitution taxonomy node.', true, 155, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.integrals.area_between_curves', 'tag', 'math', 'concept', 'Area Between Curves', 'math.concept.calculus.integrals.area_between_curves taxonomy node.', true, 156, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.integrals.volume', 'tag', 'math', 'concept', 'Volume', 'math.concept.calculus.integrals.volume taxonomy node.', true, 157, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.integrals.accumulation_functions', 'tag', 'math', 'concept', 'Accumulation Functions', 'math.concept.calculus.integrals.accumulation_functions taxonomy node.', true, 158, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.integrals.differential_equations', 'tag', 'math', 'concept', 'Differential Equations', 'math.concept.calculus.integrals.differential_equations taxonomy node.', true, 159, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.sequences_series', 'tag', 'math', 'concept', 'Sequences Series', 'math.concept.calculus.sequences_series taxonomy node.', true, 160, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.sequences_series.convergence', 'tag', 'math', 'concept', 'Convergence', 'math.concept.calculus.sequences_series.convergence taxonomy node.', true, 161, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.sequences_series.geometric_series', 'tag', 'math', 'concept', 'Geometric Series', 'math.concept.calculus.sequences_series.geometric_series taxonomy node.', true, 162, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.sequences_series.p_series', 'tag', 'math', 'concept', 'P Series', 'math.concept.calculus.sequences_series.p_series taxonomy node.', true, 163, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.sequences_series.ratio_test', 'tag', 'math', 'concept', 'Ratio Test', 'math.concept.calculus.sequences_series.ratio_test taxonomy node.', true, 164, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.sequences_series.power_series', 'tag', 'math', 'concept', 'Power Series', 'math.concept.calculus.sequences_series.power_series taxonomy node.', true, 165, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.calculus.sequences_series.taylor_series', 'tag', 'math', 'concept', 'Taylor Series', 'math.concept.calculus.sequences_series.taylor_series taxonomy node.', true, 166, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.statistics_probability', 'tag', 'math', 'concept', 'Statistics Probability', 'math.concept.statistics_probability taxonomy node.', true, 167, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.statistics_probability.data_displays', 'tag', 'math', 'concept', 'Data Displays', 'math.concept.statistics_probability.data_displays taxonomy node.', true, 168, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.statistics_probability.center_spread', 'tag', 'math', 'concept', 'Center Spread', 'math.concept.statistics_probability.center_spread taxonomy node.', true, 169, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.statistics_probability.distributions', 'tag', 'math', 'concept', 'Distributions', 'math.concept.statistics_probability.distributions taxonomy node.', true, 170, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.statistics_probability.normal_distribution', 'tag', 'math', 'concept', 'Normal Distribution', 'math.concept.statistics_probability.normal_distribution taxonomy node.', true, 171, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.statistics_probability.regression_correlation', 'tag', 'math', 'concept', 'Regression Correlation', 'math.concept.statistics_probability.regression_correlation taxonomy node.', true, 172, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.statistics_probability.two_way_tables', 'tag', 'math', 'concept', 'Two Way Tables', 'math.concept.statistics_probability.two_way_tables taxonomy node.', true, 173, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.statistics_probability.probability_basics', 'tag', 'math', 'concept', 'Probability Basics', 'math.concept.statistics_probability.probability_basics taxonomy node.', true, 174, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.statistics_probability.conditional_probability', 'tag', 'math', 'concept', 'Conditional Probability', 'math.concept.statistics_probability.conditional_probability taxonomy node.', true, 175, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.statistics_probability.independence', 'tag', 'math', 'concept', 'Independence', 'math.concept.statistics_probability.independence taxonomy node.', true, 176, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.statistics_probability.counting', 'tag', 'math', 'concept', 'Counting', 'math.concept.statistics_probability.counting taxonomy node.', true, 177, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.statistics_probability.random_variables', 'tag', 'math', 'concept', 'Random Variables', 'math.concept.statistics_probability.random_variables taxonomy node.', true, 178, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.statistics_probability.sampling', 'tag', 'math', 'concept', 'Sampling', 'math.concept.statistics_probability.sampling taxonomy node.', true, 179, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.statistics_probability.confidence_intervals', 'tag', 'math', 'concept', 'Confidence Intervals', 'math.concept.statistics_probability.confidence_intervals taxonomy node.', true, 180, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.statistics_probability.hypothesis_tests', 'tag', 'math', 'concept', 'Hypothesis Tests', 'math.concept.statistics_probability.hypothesis_tests taxonomy node.', true, 181, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.discrete_math', 'tag', 'math', 'concept', 'Discrete Math', 'math.concept.discrete_math taxonomy node.', true, 182, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.discrete_math.combinatorics', 'tag', 'math', 'concept', 'Combinatorics', 'math.concept.discrete_math.combinatorics taxonomy node.', true, 183, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.discrete_math.permutations_combinations', 'tag', 'math', 'concept', 'Permutations Combinations', 'math.concept.discrete_math.permutations_combinations taxonomy node.', true, 184, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.discrete_math.binomial_theorem', 'tag', 'math', 'concept', 'Binomial Theorem', 'math.concept.discrete_math.binomial_theorem taxonomy node.', true, 185, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.discrete_math.graph_theory_basics', 'tag', 'math', 'concept', 'Graph Theory Basics', 'math.concept.discrete_math.graph_theory_basics taxonomy node.', true, 186, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.concept.discrete_math.logic_sets', 'tag', 'math', 'concept', 'Logic Sets', 'math.concept.discrete_math.logic_sets taxonomy node.', true, 187, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.algebraic_manipulation', 'tag', 'math', 'method', 'Algebraic Manipulation', 'math.method.algebraic_manipulation taxonomy node.', true, 188, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.algebraic_manipulation.expand', 'tag', 'math', 'method', 'Expand', 'math.method.algebraic_manipulation.expand taxonomy node.', true, 189, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.algebraic_manipulation.factor', 'tag', 'math', 'method', 'Factor', 'math.method.algebraic_manipulation.factor taxonomy node.', true, 190, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.algebraic_manipulation.complete_the_square', 'tag', 'math', 'method', 'Complete The Square', 'math.method.algebraic_manipulation.complete_the_square taxonomy node.', true, 191, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.algebraic_manipulation.isolate_variable', 'tag', 'math', 'method', 'Isolate Variable', 'math.method.algebraic_manipulation.isolate_variable taxonomy node.', true, 192, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.algebraic_manipulation.substitute', 'tag', 'math', 'method', 'Substitute', 'math.method.algebraic_manipulation.substitute taxonomy node.', true, 193, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.algebraic_manipulation.combine_like_terms', 'tag', 'math', 'method', 'Combine Like Terms', 'math.method.algebraic_manipulation.combine_like_terms taxonomy node.', true, 194, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.algebraic_manipulation.rationalize', 'tag', 'math', 'method', 'Rationalize', 'math.method.algebraic_manipulation.rationalize taxonomy node.', true, 195, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.algebraic_manipulation.clear_denominators', 'tag', 'math', 'method', 'Clear Denominators', 'math.method.algebraic_manipulation.clear_denominators taxonomy node.', true, 196, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.algebraic_manipulation.use_properties_equality', 'tag', 'math', 'method', 'Use Properties Equality', 'math.method.algebraic_manipulation.use_properties_equality taxonomy node.', true, 197, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.algebraic_manipulation.rewrite_equivalent_form', 'tag', 'math', 'method', 'Rewrite Equivalent Form', 'math.method.algebraic_manipulation.rewrite_equivalent_form taxonomy node.', true, 198, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.algebraic_manipulation.long_synthetic_division', 'tag', 'math', 'method', 'Long Synthetic Division', 'math.method.algebraic_manipulation.long_synthetic_division taxonomy node.', true, 199, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.equation_solving', 'tag', 'math', 'method', 'Equation Solving', 'math.method.equation_solving taxonomy node.', true, 200, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.equation_solving.solve_by_factoring', 'tag', 'math', 'method', 'Solve By Factoring', 'math.method.equation_solving.solve_by_factoring taxonomy node.', true, 201, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.equation_solving.use_quadratic_formula', 'tag', 'math', 'method', 'Use Quadratic Formula', 'math.method.equation_solving.use_quadratic_formula taxonomy node.', true, 202, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.equation_solving.complete_square_solve', 'tag', 'math', 'method', 'Complete Square Solve', 'math.method.equation_solving.complete_square_solve taxonomy node.', true, 203, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.equation_solving.system_substitution', 'tag', 'math', 'method', 'System Substitution', 'math.method.equation_solving.system_substitution taxonomy node.', true, 204, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.equation_solving.system_elimination', 'tag', 'math', 'method', 'System Elimination', 'math.method.equation_solving.system_elimination taxonomy node.', true, 205, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.equation_solving.solve_graphically', 'tag', 'math', 'method', 'Solve Graphically', 'math.method.equation_solving.solve_graphically taxonomy node.', true, 206, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.equation_solving.check_extraneous_solutions', 'tag', 'math', 'method', 'Check Extraneous Solutions', 'math.method.equation_solving.check_extraneous_solutions taxonomy node.', true, 207, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.equation_solving.interval_testing', 'tag', 'math', 'method', 'Interval Testing', 'math.method.equation_solving.interval_testing taxonomy node.', true, 208, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.function_analysis', 'tag', 'math', 'method', 'Function Analysis', 'math.method.function_analysis taxonomy node.', true, 209, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.function_analysis.evaluate_function', 'tag', 'math', 'method', 'Evaluate Function', 'math.method.function_analysis.evaluate_function taxonomy node.', true, 210, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.function_analysis.find_domain', 'tag', 'math', 'method', 'Find Domain', 'math.method.function_analysis.find_domain taxonomy node.', true, 211, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.function_analysis.find_range', 'tag', 'math', 'method', 'Find Range', 'math.method.function_analysis.find_range taxonomy node.', true, 212, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.function_analysis.compose_functions', 'tag', 'math', 'method', 'Compose Functions', 'math.method.function_analysis.compose_functions taxonomy node.', true, 213, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.function_analysis.find_inverse_function', 'tag', 'math', 'method', 'Find Inverse Function', 'math.method.function_analysis.find_inverse_function taxonomy node.', true, 214, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.function_analysis.transform_parent_function', 'tag', 'math', 'method', 'Transform Parent Function', 'math.method.function_analysis.transform_parent_function taxonomy node.', true, 215, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.function_analysis.compare_function_values', 'tag', 'math', 'method', 'Compare Function Values', 'math.method.function_analysis.compare_function_values taxonomy node.', true, 216, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.function_analysis.use_symmetry', 'tag', 'math', 'method', 'Use Symmetry', 'math.method.function_analysis.use_symmetry taxonomy node.', true, 217, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.function_analysis.analyze_end_behavior', 'tag', 'math', 'method', 'Analyze End Behavior', 'math.method.function_analysis.analyze_end_behavior taxonomy node.', true, 218, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.graph_reasoning', 'tag', 'math', 'method', 'Graph Reasoning', 'math.method.graph_reasoning taxonomy node.', true, 219, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.graph_reasoning.read_from_graph', 'tag', 'math', 'method', 'Read From Graph', 'math.method.graph_reasoning.read_from_graph taxonomy node.', true, 220, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.graph_reasoning.sketch_graph', 'tag', 'math', 'method', 'Sketch Graph', 'math.method.graph_reasoning.sketch_graph taxonomy node.', true, 221, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.graph_reasoning.use_intercepts', 'tag', 'math', 'method', 'Use Intercepts', 'math.method.graph_reasoning.use_intercepts taxonomy node.', true, 222, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.graph_reasoning.use_slope', 'tag', 'math', 'method', 'Use Slope', 'math.method.graph_reasoning.use_slope taxonomy node.', true, 223, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.graph_reasoning.connect_graph_equation', 'tag', 'math', 'method', 'Connect Graph Equation', 'math.method.graph_reasoning.connect_graph_equation taxonomy node.', true, 224, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.graph_reasoning.interpret_area_under_curve', 'tag', 'math', 'method', 'Interpret Area Under Curve', 'math.method.graph_reasoning.interpret_area_under_curve taxonomy node.', true, 225, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.graph_reasoning.interpret_slope_rate', 'tag', 'math', 'method', 'Interpret Slope Rate', 'math.method.graph_reasoning.interpret_slope_rate taxonomy node.', true, 226, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.trigonometric_methods', 'tag', 'math', 'method', 'Trigonometric Methods', 'math.method.trigonometric_methods taxonomy node.', true, 227, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.trigonometric_methods.use_unit_circle', 'tag', 'math', 'method', 'Use Unit Circle', 'math.method.trigonometric_methods.use_unit_circle taxonomy node.', true, 228, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.trigonometric_methods.use_trig_identity', 'tag', 'math', 'method', 'Use Trig Identity', 'math.method.trigonometric_methods.use_trig_identity taxonomy node.', true, 229, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.trigonometric_methods.solve_trig_equation', 'tag', 'math', 'method', 'Solve Trig Equation', 'math.method.trigonometric_methods.solve_trig_equation taxonomy node.', true, 230, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.trigonometric_methods.convert_degrees_radians', 'tag', 'math', 'method', 'Convert Degrees Radians', 'math.method.trigonometric_methods.convert_degrees_radians taxonomy node.', true, 231, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.trigonometric_methods.use_law_sines_cosines', 'tag', 'math', 'method', 'Use Law Sines Cosines', 'math.method.trigonometric_methods.use_law_sines_cosines taxonomy node.', true, 232, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.trigonometric_methods.use_reference_angle', 'tag', 'math', 'method', 'Use Reference Angle', 'math.method.trigonometric_methods.use_reference_angle taxonomy node.', true, 233, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.calculus_procedure', 'tag', 'math', 'method', 'Calculus Procedure', 'math.method.calculus_procedure taxonomy node.', true, 234, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.calculus_procedure.simplify_before_differentiating', 'tag', 'math', 'method', 'Simplify Before Differentiating', 'math.method.calculus_procedure.simplify_before_differentiating taxonomy node.', true, 235, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.calculus_procedure.use_limit_definition', 'tag', 'math', 'method', 'Use Limit Definition', 'math.method.calculus_procedure.use_limit_definition taxonomy node.', true, 236, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.calculus_procedure.use_power_rule', 'tag', 'math', 'method', 'Use Power Rule', 'math.method.calculus_procedure.use_power_rule taxonomy node.', true, 237, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.calculus_procedure.use_product_rule', 'tag', 'math', 'method', 'Use Product Rule', 'math.method.calculus_procedure.use_product_rule taxonomy node.', true, 238, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.calculus_procedure.use_quotient_rule', 'tag', 'math', 'method', 'Use Quotient Rule', 'math.method.calculus_procedure.use_quotient_rule taxonomy node.', true, 239, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.calculus_procedure.use_chain_rule', 'tag', 'math', 'method', 'Use Chain Rule', 'math.method.calculus_procedure.use_chain_rule taxonomy node.', true, 240, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.calculus_procedure.use_implicit_differentiation', 'tag', 'math', 'method', 'Use Implicit Differentiation', 'math.method.calculus_procedure.use_implicit_differentiation taxonomy node.', true, 241, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.calculus_procedure.use_logarithmic_differentiation', 'tag', 'math', 'method', 'Use Logarithmic Differentiation', 'math.method.calculus_procedure.use_logarithmic_differentiation taxonomy node.', true, 242, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.calculus_procedure.use_exp_log_inverse_identity', 'tag', 'math', 'method', 'Use Exp Log Inverse Identity', 'math.method.calculus_procedure.use_exp_log_inverse_identity taxonomy node.', true, 243, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.calculus_procedure.use_u_substitution', 'tag', 'math', 'method', 'Use U Substitution', 'math.method.calculus_procedure.use_u_substitution taxonomy node.', true, 244, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.calculus_procedure.use_integration_by_parts', 'tag', 'math', 'method', 'Use Integration By Parts', 'math.method.calculus_procedure.use_integration_by_parts taxonomy node.', true, 245, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.calculus_procedure.use_fundamental_theorem', 'tag', 'math', 'method', 'Use Fundamental Theorem', 'math.method.calculus_procedure.use_fundamental_theorem taxonomy node.', true, 246, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.calculus_procedure.use_riemann_sum', 'tag', 'math', 'method', 'Use Riemann Sum', 'math.method.calculus_procedure.use_riemann_sum taxonomy node.', true, 247, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.calculus_procedure.separate_variables', 'tag', 'math', 'method', 'Separate Variables', 'math.method.calculus_procedure.separate_variables taxonomy node.', true, 248, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.calculus_procedure.linear_approximation', 'tag', 'math', 'method', 'Linear Approximation', 'math.method.calculus_procedure.linear_approximation taxonomy node.', true, 249, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.modeling', 'tag', 'math', 'method', 'Modeling', 'math.method.modeling taxonomy node.', true, 250, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.modeling.define_variables', 'tag', 'math', 'method', 'Define Variables', 'math.method.modeling.define_variables taxonomy node.', true, 251, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.modeling.choose_model', 'tag', 'math', 'method', 'Choose Model', 'math.method.modeling.choose_model taxonomy node.', true, 252, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.modeling.build_equation', 'tag', 'math', 'method', 'Build Equation', 'math.method.modeling.build_equation taxonomy node.', true, 253, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.modeling.fit_model', 'tag', 'math', 'method', 'Fit Model', 'math.method.modeling.fit_model taxonomy node.', true, 254, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.modeling.interpret_parameters', 'tag', 'math', 'method', 'Interpret Parameters', 'math.method.modeling.interpret_parameters taxonomy node.', true, 255, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.modeling.check_domain_constraints', 'tag', 'math', 'method', 'Check Domain Constraints', 'math.method.modeling.check_domain_constraints taxonomy node.', true, 256, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.modeling.validate_units', 'tag', 'math', 'method', 'Validate Units', 'math.method.modeling.validate_units taxonomy node.', true, 257, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.modeling.optimize_quantity', 'tag', 'math', 'method', 'Optimize Quantity', 'math.method.modeling.optimize_quantity taxonomy node.', true, 258, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.modeling.translate_words_to_expressions', 'tag', 'math', 'method', 'Translate Words To Expressions', 'math.method.modeling.translate_words_to_expressions taxonomy node.', true, 259, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.statistical_methods', 'tag', 'math', 'method', 'Statistical Methods', 'math.method.statistical_methods taxonomy node.', true, 260, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.statistical_methods.compute_summary_stat', 'tag', 'math', 'method', 'Compute Summary Stat', 'math.method.statistical_methods.compute_summary_stat taxonomy node.', true, 261, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.statistical_methods.standardize_z_score', 'tag', 'math', 'method', 'Standardize Z Score', 'math.method.statistical_methods.standardize_z_score taxonomy node.', true, 262, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.statistical_methods.calculate_probability', 'tag', 'math', 'method', 'Calculate Probability', 'math.method.statistical_methods.calculate_probability taxonomy node.', true, 263, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.statistical_methods.use_counting_rule', 'tag', 'math', 'method', 'Use Counting Rule', 'math.method.statistical_methods.use_counting_rule taxonomy node.', true, 264, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.statistical_methods.fit_regression_line', 'tag', 'math', 'method', 'Fit Regression Line', 'math.method.statistical_methods.fit_regression_line taxonomy node.', true, 265, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.statistical_methods.interpret_residuals', 'tag', 'math', 'method', 'Interpret Residuals', 'math.method.statistical_methods.interpret_residuals taxonomy node.', true, 266, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.statistical_methods.construct_confidence_interval', 'tag', 'math', 'method', 'Construct Confidence Interval', 'math.method.statistical_methods.construct_confidence_interval taxonomy node.', true, 267, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.statistical_methods.perform_hypothesis_test', 'tag', 'math', 'method', 'Perform Hypothesis Test', 'math.method.statistical_methods.perform_hypothesis_test taxonomy node.', true, 268, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.proof_reasoning', 'tag', 'math', 'method', 'Proof Reasoning', 'math.method.proof_reasoning taxonomy node.', true, 269, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.proof_reasoning.direct_reasoning', 'tag', 'math', 'method', 'Direct Reasoning', 'math.method.proof_reasoning.direct_reasoning taxonomy node.', true, 270, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.proof_reasoning.contradiction', 'tag', 'math', 'method', 'Contradiction', 'math.method.proof_reasoning.contradiction taxonomy node.', true, 271, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.proof_reasoning.induction', 'tag', 'math', 'method', 'Induction', 'math.method.proof_reasoning.induction taxonomy node.', true, 272, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.proof_reasoning.justify_steps', 'tag', 'math', 'method', 'Justify Steps', 'math.method.proof_reasoning.justify_steps taxonomy node.', true, 273, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.proof_reasoning.counterexample', 'tag', 'math', 'method', 'Counterexample', 'math.method.proof_reasoning.counterexample taxonomy node.', true, 274, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.method.proof_reasoning.dimensional_analysis', 'tag', 'math', 'method', 'Dimensional Analysis', 'math.method.proof_reasoning.dimensional_analysis taxonomy node.', true, 275, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.identify', 'tag', 'math', 'task', 'Identify', 'math.task.identify taxonomy node.', true, 276, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.identify.identify_concept', 'tag', 'math', 'task', 'Identify Concept', 'math.task.identify.identify_concept taxonomy node.', true, 277, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.identify.identify_form', 'tag', 'math', 'task', 'Identify Form', 'math.task.identify.identify_form taxonomy node.', true, 278, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.identify.identify_graph_feature', 'tag', 'math', 'task', 'Identify Graph Feature', 'math.task.identify.identify_graph_feature taxonomy node.', true, 279, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.identify.identify_error', 'tag', 'math', 'task', 'Identify Error', 'math.task.identify.identify_error taxonomy node.', true, 280, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.identify.identify_parameter', 'tag', 'math', 'task', 'Identify Parameter', 'math.task.identify.identify_parameter taxonomy node.', true, 281, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.determine', 'tag', 'math', 'task', 'Determine', 'math.task.determine taxonomy node.', true, 282, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.determine.determine_value', 'tag', 'math', 'task', 'Determine Value', 'math.task.determine.determine_value taxonomy node.', true, 283, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.determine.determine_derivative', 'tag', 'math', 'task', 'Determine Derivative', 'math.task.determine.determine_derivative taxonomy node.', true, 284, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.determine.determine_integral', 'tag', 'math', 'task', 'Determine Integral', 'math.task.determine.determine_integral taxonomy node.', true, 285, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.determine.determine_limit', 'tag', 'math', 'task', 'Determine Limit', 'math.task.determine.determine_limit taxonomy node.', true, 286, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.determine.determine_roots', 'tag', 'math', 'task', 'Determine Roots', 'math.task.determine.determine_roots taxonomy node.', true, 287, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.determine.determine_equation', 'tag', 'math', 'task', 'Determine Equation', 'math.task.determine.determine_equation taxonomy node.', true, 288, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.determine.determine_domain_range', 'tag', 'math', 'task', 'Determine Domain Range', 'math.task.determine.determine_domain_range taxonomy node.', true, 289, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.determine.determine_extreme_value', 'tag', 'math', 'task', 'Determine Extreme Value', 'math.task.determine.determine_extreme_value taxonomy node.', true, 290, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.determine.determine_where_extreme_occurs', 'tag', 'math', 'task', 'Determine Where Extreme Occurs', 'math.task.determine.determine_where_extreme_occurs taxonomy node.', true, 291, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.determine.determine_probability', 'tag', 'math', 'task', 'Determine Probability', 'math.task.determine.determine_probability taxonomy node.', true, 292, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.determine.determine_statistic', 'tag', 'math', 'task', 'Determine Statistic', 'math.task.determine.determine_statistic taxonomy node.', true, 293, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.rewrite', 'tag', 'math', 'task', 'Rewrite', 'math.task.rewrite taxonomy node.', true, 294, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.rewrite.simplify_expression', 'tag', 'math', 'task', 'Simplify Expression', 'math.task.rewrite.simplify_expression taxonomy node.', true, 295, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.rewrite.expand_expression', 'tag', 'math', 'task', 'Expand Expression', 'math.task.rewrite.expand_expression taxonomy node.', true, 296, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.rewrite.factor_expression', 'tag', 'math', 'task', 'Factor Expression', 'math.task.rewrite.factor_expression taxonomy node.', true, 297, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.rewrite.convert_forms', 'tag', 'math', 'task', 'Convert Forms', 'math.task.rewrite.convert_forms taxonomy node.', true, 298, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.rewrite.solve_for_variable', 'tag', 'math', 'task', 'Solve For Variable', 'math.task.rewrite.solve_for_variable taxonomy node.', true, 299, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.rewrite.transform_expression', 'tag', 'math', 'task', 'Transform Expression', 'math.task.rewrite.transform_expression taxonomy node.', true, 300, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.explain', 'tag', 'math', 'task', 'Explain', 'math.task.explain taxonomy node.', true, 301, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.explain.explain_reasoning', 'tag', 'math', 'task', 'Explain Reasoning', 'math.task.explain.explain_reasoning taxonomy node.', true, 302, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.explain.justify_answer', 'tag', 'math', 'task', 'Justify Answer', 'math.task.explain.justify_answer taxonomy node.', true, 303, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.explain.compare_methods', 'tag', 'math', 'task', 'Compare Methods', 'math.task.explain.compare_methods taxonomy node.', true, 304, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.explain.interpret_result', 'tag', 'math', 'task', 'Interpret Result', 'math.task.explain.interpret_result taxonomy node.', true, 305, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.explain.explain_error', 'tag', 'math', 'task', 'Explain Error', 'math.task.explain.explain_error taxonomy node.', true, 306, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.model', 'tag', 'math', 'task', 'Model', 'math.task.model taxonomy node.', true, 307, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.model.build_model', 'tag', 'math', 'task', 'Build Model', 'math.task.model.build_model taxonomy node.', true, 308, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.model.optimize_quantity', 'tag', 'math', 'task', 'Optimize Quantity', 'math.task.model.optimize_quantity taxonomy node.', true, 309, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.model.predict_extrapolate', 'tag', 'math', 'task', 'Predict Extrapolate', 'math.task.model.predict_extrapolate taxonomy node.', true, 310, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.model.validate_model', 'tag', 'math', 'task', 'Validate Model', 'math.task.model.validate_model taxonomy node.', true, 311, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.prove', 'tag', 'math', 'task', 'Prove', 'math.task.prove taxonomy node.', true, 312, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.prove.prove_identity', 'tag', 'math', 'task', 'Prove Identity', 'math.task.prove.prove_identity taxonomy node.', true, 313, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.prove.prove_equivalence', 'tag', 'math', 'task', 'Prove Equivalence', 'math.task.prove.prove_equivalence taxonomy node.', true, 314, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.prove.derive_formula', 'tag', 'math', 'task', 'Derive Formula', 'math.task.prove.derive_formula taxonomy node.', true, 315, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.classify', 'tag', 'math', 'task', 'Classify', 'math.task.classify taxonomy node.', true, 316, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.classify.classify_function', 'tag', 'math', 'task', 'Classify Function', 'math.task.classify.classify_function taxonomy node.', true, 317, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.classify.classify_distribution', 'tag', 'math', 'task', 'Classify Distribution', 'math.task.classify.classify_distribution taxonomy node.', true, 318, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.task.classify.choose_method', 'tag', 'math', 'task', 'Choose Method', 'math.task.classify.choose_method taxonomy node.', true, 319, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.symbolic', 'tag', 'math', 'form', 'Symbolic', 'math.form.symbolic taxonomy node.', true, 320, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.symbolic.expression', 'tag', 'math', 'form', 'Expression', 'math.form.symbolic.expression taxonomy node.', true, 321, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.symbolic.equation', 'tag', 'math', 'form', 'Equation', 'math.form.symbolic.equation taxonomy node.', true, 322, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.symbolic.inequality', 'tag', 'math', 'form', 'Inequality', 'math.form.symbolic.inequality taxonomy node.', true, 323, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.symbolic.system', 'tag', 'math', 'form', 'System', 'math.form.symbolic.system taxonomy node.', true, 324, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.symbolic.function_rule', 'tag', 'math', 'form', 'Function Rule', 'math.form.symbolic.function_rule taxonomy node.', true, 325, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.symbolic.product_expression', 'tag', 'math', 'form', 'Product Expression', 'math.form.symbolic.product_expression taxonomy node.', true, 326, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.symbolic.quotient_expression', 'tag', 'math', 'form', 'Quotient Expression', 'math.form.symbolic.quotient_expression taxonomy node.', true, 327, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.symbolic.composite_expression', 'tag', 'math', 'form', 'Composite Expression', 'math.form.symbolic.composite_expression taxonomy node.', true, 328, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.symbolic.exp_log_composition', 'tag', 'math', 'form', 'Exp Log Composition', 'math.form.symbolic.exp_log_composition taxonomy node.', true, 329, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.symbolic.piecewise_function', 'tag', 'math', 'form', 'Piecewise Function', 'math.form.symbolic.piecewise_function taxonomy node.', true, 330, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.symbolic.matrix_vector', 'tag', 'math', 'form', 'Matrix Vector', 'math.form.symbolic.matrix_vector taxonomy node.', true, 331, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.symbolic.sequence_notation', 'tag', 'math', 'form', 'Sequence Notation', 'math.form.symbolic.sequence_notation taxonomy node.', true, 332, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.visual', 'tag', 'math', 'form', 'Visual', 'math.form.visual taxonomy node.', true, 333, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.visual.coordinate_graph', 'tag', 'math', 'form', 'Coordinate Graph', 'math.form.visual.coordinate_graph taxonomy node.', true, 334, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.visual.diagram', 'tag', 'math', 'form', 'Diagram', 'math.form.visual.diagram taxonomy node.', true, 335, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.visual.geometric_figure', 'tag', 'math', 'form', 'Geometric Figure', 'math.form.visual.geometric_figure taxonomy node.', true, 336, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.visual.number_line', 'tag', 'math', 'form', 'Number Line', 'math.form.visual.number_line taxonomy node.', true, 337, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.visual.vector_diagram', 'tag', 'math', 'form', 'Vector Diagram', 'math.form.visual.vector_diagram taxonomy node.', true, 338, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.visual.histogram_boxplot', 'tag', 'math', 'form', 'Histogram Boxplot', 'math.form.visual.histogram_boxplot taxonomy node.', true, 339, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.visual.scatterplot', 'tag', 'math', 'form', 'Scatterplot', 'math.form.visual.scatterplot taxonomy node.', true, 340, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.table', 'tag', 'math', 'form', 'Table', 'math.form.table taxonomy node.', true, 341, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.table.input_output_table', 'tag', 'math', 'form', 'Input Output Table', 'math.form.table.input_output_table taxonomy node.', true, 342, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.table.data_table', 'tag', 'math', 'form', 'Data Table', 'math.form.table.data_table taxonomy node.', true, 343, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.table.frequency_table', 'tag', 'math', 'form', 'Frequency Table', 'math.form.table.frequency_table taxonomy node.', true, 344, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.table.truth_table', 'tag', 'math', 'form', 'Truth Table', 'math.form.table.truth_table taxonomy node.', true, 345, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.verbal', 'tag', 'math', 'form', 'Verbal', 'math.form.verbal taxonomy node.', true, 346, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.verbal.word_problem', 'tag', 'math', 'form', 'Word Problem', 'math.form.verbal.word_problem taxonomy node.', true, 347, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.verbal.multi_sentence_context', 'tag', 'math', 'form', 'Multi Sentence Context', 'math.form.verbal.multi_sentence_context taxonomy node.', true, 348, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.verbal.proof_prompt', 'tag', 'math', 'form', 'Proof Prompt', 'math.form.verbal.proof_prompt taxonomy node.', true, 349, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.verbal.error_analysis_prompt', 'tag', 'math', 'form', 'Error Analysis Prompt', 'math.form.verbal.error_analysis_prompt taxonomy node.', true, 350, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.mixed', 'tag', 'math', 'form', 'Mixed', 'math.form.mixed taxonomy node.', true, 351, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.mixed.equation_graph', 'tag', 'math', 'form', 'Equation Graph', 'math.form.mixed.equation_graph taxonomy node.', true, 352, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.mixed.table_graph', 'tag', 'math', 'form', 'Table Graph', 'math.form.mixed.table_graph taxonomy node.', true, 353, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.mixed.diagram_equation', 'tag', 'math', 'form', 'Diagram Equation', 'math.form.mixed.diagram_equation taxonomy node.', true, 354, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.mixed.text_equation', 'tag', 'math', 'form', 'Text Equation', 'math.form.mixed.text_equation taxonomy node.', true, 355, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.context', 'tag', 'math', 'form', 'Context', 'math.form.context taxonomy node.', true, 356, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.context.pure_math', 'tag', 'math', 'form', 'Pure Math', 'math.form.context.pure_math taxonomy node.', true, 357, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.context.projectile_motion', 'tag', 'math', 'form', 'Projectile Motion', 'math.form.context.projectile_motion taxonomy node.', true, 358, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.context.area_optimization', 'tag', 'math', 'form', 'Area Optimization', 'math.form.context.area_optimization taxonomy node.', true, 359, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.context.revenue_profit', 'tag', 'math', 'form', 'Revenue Profit', 'math.form.context.revenue_profit taxonomy node.', true, 360, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.context.rate_motion', 'tag', 'math', 'form', 'Rate Motion', 'math.form.context.rate_motion taxonomy node.', true, 361, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.context.population_growth', 'tag', 'math', 'form', 'Population Growth', 'math.form.context.population_growth taxonomy node.', true, 362, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.context.finance_interest', 'tag', 'math', 'form', 'Finance Interest', 'math.form.context.finance_interest taxonomy node.', true, 363, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.context.geometry_design', 'tag', 'math', 'form', 'Geometry Design', 'math.form.context.geometry_design taxonomy node.', true, 364, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.form.context.data_science_context', 'tag', 'math', 'form', 'Data Science Context', 'math.form.context.data_science_context taxonomy node.', true, 365, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.bc', 'tag', 'math', 'curriculum', 'Bc', 'math.curriculum.bc taxonomy node.', true, 366, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.bc.math_10', 'tag', 'math', 'curriculum', 'Math 10', 'math.curriculum.bc.math_10 taxonomy node.', true, 367, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.bc.precalculus_11', 'tag', 'math', 'curriculum', 'Precalculus 11', 'math.curriculum.bc.precalculus_11 taxonomy node.', true, 368, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.bc.precalculus_11.real_numbers_radicals', 'tag', 'math', 'curriculum', 'Real Numbers Radicals', 'math.curriculum.bc.precalculus_11.real_numbers_radicals taxonomy node.', true, 369, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.bc.precalculus_11.powers_rational_exponents', 'tag', 'math', 'curriculum', 'Powers Rational Exponents', 'math.curriculum.bc.precalculus_11.powers_rational_exponents taxonomy node.', true, 370, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.bc.precalculus_11.quadratic_functions', 'tag', 'math', 'curriculum', 'Quadratic Functions', 'math.curriculum.bc.precalculus_11.quadratic_functions taxonomy node.', true, 371, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.bc.precalculus_11.rational_expressions_equations', 'tag', 'math', 'curriculum', 'Rational Expressions Equations', 'math.curriculum.bc.precalculus_11.rational_expressions_equations taxonomy node.', true, 372, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.bc.precalculus_11.trigonometry', 'tag', 'math', 'curriculum', 'Trigonometry', 'math.curriculum.bc.precalculus_11.trigonometry taxonomy node.', true, 373, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.bc.precalculus_11.systems', 'tag', 'math', 'curriculum', 'Systems', 'math.curriculum.bc.precalculus_11.systems taxonomy node.', true, 374, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.bc.precalculus_11.sequences_series', 'tag', 'math', 'curriculum', 'Sequences Series', 'math.curriculum.bc.precalculus_11.sequences_series taxonomy node.', true, 375, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.bc.precalculus_12', 'tag', 'math', 'curriculum', 'Precalculus 12', 'math.curriculum.bc.precalculus_12 taxonomy node.', true, 376, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.bc.precalculus_12.transformations', 'tag', 'math', 'curriculum', 'Transformations', 'math.curriculum.bc.precalculus_12.transformations taxonomy node.', true, 377, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.bc.precalculus_12.polynomial_functions', 'tag', 'math', 'curriculum', 'Polynomial Functions', 'math.curriculum.bc.precalculus_12.polynomial_functions taxonomy node.', true, 378, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.bc.precalculus_12.rational_functions', 'tag', 'math', 'curriculum', 'Rational Functions', 'math.curriculum.bc.precalculus_12.rational_functions taxonomy node.', true, 379, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.bc.precalculus_12.exponential_logarithmic_functions', 'tag', 'math', 'curriculum', 'Exponential Logarithmic Functions', 'math.curriculum.bc.precalculus_12.exponential_logarithmic_functions taxonomy node.', true, 380, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.bc.precalculus_12.trigonometry', 'tag', 'math', 'curriculum', 'Trigonometry', 'math.curriculum.bc.precalculus_12.trigonometry taxonomy node.', true, 381, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.bc.precalculus_12.combinatorics', 'tag', 'math', 'curriculum', 'Combinatorics', 'math.curriculum.bc.precalculus_12.combinatorics taxonomy node.', true, 382, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.bc.calculus_12', 'tag', 'math', 'curriculum', 'Calculus 12', 'math.curriculum.bc.calculus_12 taxonomy node.', true, 383, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.bc.calculus_12.limits_continuity', 'tag', 'math', 'curriculum', 'Limits Continuity', 'math.curriculum.bc.calculus_12.limits_continuity taxonomy node.', true, 384, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.bc.calculus_12.derivatives', 'tag', 'math', 'curriculum', 'Derivatives', 'math.curriculum.bc.calculus_12.derivatives taxonomy node.', true, 385, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.bc.calculus_12.applications_derivatives', 'tag', 'math', 'curriculum', 'Applications Derivatives', 'math.curriculum.bc.calculus_12.applications_derivatives taxonomy node.', true, 386, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.bc.calculus_12.integrals', 'tag', 'math', 'curriculum', 'Integrals', 'math.curriculum.bc.calculus_12.integrals taxonomy node.', true, 387, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.ap', 'tag', 'math', 'curriculum', 'Ap', 'math.curriculum.ap taxonomy node.', true, 388, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.ap.ap_precalculus', 'tag', 'math', 'curriculum', 'Ap Precalculus', 'math.curriculum.ap.ap_precalculus taxonomy node.', true, 389, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.ap.ap_precalculus.polynomial_rational_functions', 'tag', 'math', 'curriculum', 'Polynomial Rational Functions', 'math.curriculum.ap.ap_precalculus.polynomial_rational_functions taxonomy node.', true, 390, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.ap.ap_precalculus.exponential_log_functions', 'tag', 'math', 'curriculum', 'Exponential Log Functions', 'math.curriculum.ap.ap_precalculus.exponential_log_functions taxonomy node.', true, 391, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.ap.ap_precalculus.trig_polar_functions', 'tag', 'math', 'curriculum', 'Trig Polar Functions', 'math.curriculum.ap.ap_precalculus.trig_polar_functions taxonomy node.', true, 392, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.ap.ap_precalculus.functions_parameters_vectors_matrices', 'tag', 'math', 'curriculum', 'Functions Parameters Vectors Matrices', 'math.curriculum.ap.ap_precalculus.functions_parameters_vectors_matrices taxonomy node.', true, 393, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.ap.ap_calculus_ab', 'tag', 'math', 'curriculum', 'Ap Calculus Ab', 'math.curriculum.ap.ap_calculus_ab taxonomy node.', true, 394, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.ap.ap_calculus_ab.limits_continuity', 'tag', 'math', 'curriculum', 'Limits Continuity', 'math.curriculum.ap.ap_calculus_ab.limits_continuity taxonomy node.', true, 395, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.ap.ap_calculus_ab.differentiation_rules', 'tag', 'math', 'curriculum', 'Differentiation Rules', 'math.curriculum.ap.ap_calculus_ab.differentiation_rules taxonomy node.', true, 396, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.ap.ap_calculus_ab.contextual_applications_derivatives', 'tag', 'math', 'curriculum', 'Contextual Applications Derivatives', 'math.curriculum.ap.ap_calculus_ab.contextual_applications_derivatives taxonomy node.', true, 397, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.ap.ap_calculus_ab.analytical_applications_derivatives', 'tag', 'math', 'curriculum', 'Analytical Applications Derivatives', 'math.curriculum.ap.ap_calculus_ab.analytical_applications_derivatives taxonomy node.', true, 398, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.ap.ap_calculus_ab.integration_accumulation', 'tag', 'math', 'curriculum', 'Integration Accumulation', 'math.curriculum.ap.ap_calculus_ab.integration_accumulation taxonomy node.', true, 399, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.ap.ap_calculus_ab.differential_equations', 'tag', 'math', 'curriculum', 'Differential Equations', 'math.curriculum.ap.ap_calculus_ab.differential_equations taxonomy node.', true, 400, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.ap.ap_calculus_ab.applications_integration', 'tag', 'math', 'curriculum', 'Applications Integration', 'math.curriculum.ap.ap_calculus_ab.applications_integration taxonomy node.', true, 401, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.ap.ap_calculus_bc', 'tag', 'math', 'curriculum', 'Ap Calculus Bc', 'math.curriculum.ap.ap_calculus_bc taxonomy node.', true, 402, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.ap.ap_calculus_bc.parametric_polar_vector', 'tag', 'math', 'curriculum', 'Parametric Polar Vector', 'math.curriculum.ap.ap_calculus_bc.parametric_polar_vector taxonomy node.', true, 403, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.ap.ap_calculus_bc.infinite_sequences_series', 'tag', 'math', 'curriculum', 'Infinite Sequences Series', 'math.curriculum.ap.ap_calculus_bc.infinite_sequences_series taxonomy node.', true, 404, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.ap.ap_statistics', 'tag', 'math', 'curriculum', 'Ap Statistics', 'math.curriculum.ap.ap_statistics taxonomy node.', true, 405, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.ap.ap_statistics.exploring_data', 'tag', 'math', 'curriculum', 'Exploring Data', 'math.curriculum.ap.ap_statistics.exploring_data taxonomy node.', true, 406, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.ap.ap_statistics.sampling_experimentation', 'tag', 'math', 'curriculum', 'Sampling Experimentation', 'math.curriculum.ap.ap_statistics.sampling_experimentation taxonomy node.', true, 407, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.ap.ap_statistics.probability', 'tag', 'math', 'curriculum', 'Probability', 'math.curriculum.ap.ap_statistics.probability taxonomy node.', true, 408, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.ap.ap_statistics.inference', 'tag', 'math', 'curriculum', 'Inference', 'math.curriculum.ap.ap_statistics.inference taxonomy node.', true, 409, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.sat', 'tag', 'math', 'curriculum', 'Sat', 'math.curriculum.sat taxonomy node.', true, 410, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.sat.algebra', 'tag', 'math', 'curriculum', 'Algebra', 'math.curriculum.sat.algebra taxonomy node.', true, 411, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.sat.advanced_math', 'tag', 'math', 'curriculum', 'Advanced Math', 'math.curriculum.sat.advanced_math taxonomy node.', true, 412, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.sat.problem_solving_data_analysis', 'tag', 'math', 'curriculum', 'Problem Solving Data Analysis', 'math.curriculum.sat.problem_solving_data_analysis taxonomy node.', true, 413, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.sat.geometry_trigonometry', 'tag', 'math', 'curriculum', 'Geometry Trigonometry', 'math.curriculum.sat.geometry_trigonometry taxonomy node.', true, 414, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.common_core', 'tag', 'math', 'curriculum', 'Common Core', 'math.curriculum.common_core taxonomy node.', true, 415, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.common_core.number_quantity', 'tag', 'math', 'curriculum', 'Number Quantity', 'math.curriculum.common_core.number_quantity taxonomy node.', true, 416, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.common_core.algebra', 'tag', 'math', 'curriculum', 'Algebra', 'math.curriculum.common_core.algebra taxonomy node.', true, 417, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.common_core.functions', 'tag', 'math', 'curriculum', 'Functions', 'math.curriculum.common_core.functions taxonomy node.', true, 418, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.common_core.geometry', 'tag', 'math', 'curriculum', 'Geometry', 'math.curriculum.common_core.geometry taxonomy node.', true, 419, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.common_core.statistics_probability', 'tag', 'math', 'curriculum', 'Statistics Probability', 'math.curriculum.common_core.statistics_probability taxonomy node.', true, 420, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.ib', 'tag', 'math', 'curriculum', 'Ib', 'math.curriculum.ib taxonomy node.', true, 421, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.ib.aa_sl', 'tag', 'math', 'curriculum', 'Aa Sl', 'math.curriculum.ib.aa_sl taxonomy node.', true, 422, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.ib.aa_hl', 'tag', 'math', 'curriculum', 'Aa Hl', 'math.curriculum.ib.aa_hl taxonomy node.', true, 423, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.ib.ai_sl', 'tag', 'math', 'curriculum', 'Ai Sl', 'math.curriculum.ib.ai_sl taxonomy node.', true, 424, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.ib.ai_hl', 'tag', 'math', 'curriculum', 'Ai Hl', 'math.curriculum.ib.ai_hl taxonomy node.', true, 425, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.a_level', 'tag', 'math', 'curriculum', 'A Level', 'math.curriculum.a_level taxonomy node.', true, 426, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.a_level.pure_math', 'tag', 'math', 'curriculum', 'Pure Math', 'math.curriculum.a_level.pure_math taxonomy node.', true, 427, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.a_level.mechanics', 'tag', 'math', 'curriculum', 'Mechanics', 'math.curriculum.a_level.mechanics taxonomy node.', true, 428, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb),
  ('math.curriculum.a_level.statistics', 'tag', 'math', 'curriculum', 'Statistics', 'math.curriculum.a_level.statistics taxonomy node.', true, 429, 'active', '{"seed":"math_taxonomy_v2","display":"derive_label_from_tag_id"}'::jsonb);

create temporary table _math_taxonomy_v2_facets (
  facet_key text primary key,
  subject_tag_id text not null,
  root_tag_id text not null,
  label text not null,
  description text,
  sort_order integer not null,
  status text not null,
  config jsonb not null
) on commit drop;

insert into _math_taxonomy_v2_facets (
  facet_key,
  subject_tag_id,
  root_tag_id,
  label,
  description,
  sort_order,
  status,
  config
) values
  ('curriculum', 'math', 'math.curriculum', 'Curriculum', 'Course, exam, and syllabus placement overlay.', 1, 'active', '{"seed":"math_taxonomy_v2","subject":"math","idPrefix":"math.curriculum"}'::jsonb),
  ('concept', 'math', 'math.concept', 'Concept', 'Mathematical knowledge graph nodes.', 2, 'active', '{"seed":"math_taxonomy_v2","subject":"math","idPrefix":"math.concept"}'::jsonb),
  ('method', 'math', 'math.method', 'Method', 'Solving and reasoning approaches.', 3, 'active', '{"seed":"math_taxonomy_v2","subject":"math","idPrefix":"math.method"}'::jsonb),
  ('task', 'math', 'math.task', 'Task', 'What the question asks the learner to do.', 4, 'active', '{"seed":"math_taxonomy_v2","subject":"math","idPrefix":"math.task"}'::jsonb),
  ('form', 'math', 'math.form', 'Form', 'Question representation, format, and context.', 5, 'active', '{"seed":"math_taxonomy_v2","subject":"math","idPrefix":"math.form"}'::jsonb);

create temporary table _math_taxonomy_v2_edges (
  from_tag_id text not null,
  to_tag_id text not null,
  edge_kind text not null,
  is_primary boolean not null,
  sort_order integer not null,
  status text not null,
  metadata jsonb not null,
  primary key (from_tag_id, to_tag_id, edge_kind)
) on commit drop;

insert into _math_taxonomy_v2_edges (
  from_tag_id,
  to_tag_id,
  edge_kind,
  is_primary,
  sort_order,
  status,
  metadata
) values
  ('math', 'math.curriculum', 'parent_child', true, 0, 'active', '{"seed":"math_taxonomy_v2","subjectRoot":true}'::jsonb),
  ('math', 'math.concept', 'parent_child', true, 1, 'active', '{"seed":"math_taxonomy_v2","subjectRoot":true}'::jsonb),
  ('math', 'math.method', 'parent_child', true, 2, 'active', '{"seed":"math_taxonomy_v2","subjectRoot":true}'::jsonb),
  ('math', 'math.task', 'parent_child', true, 3, 'active', '{"seed":"math_taxonomy_v2","subjectRoot":true}'::jsonb),
  ('math', 'math.form', 'parent_child', true, 4, 'active', '{"seed":"math_taxonomy_v2","subjectRoot":true}'::jsonb),
  ('math.concept', 'math.concept.number_quantity', 'parent_child', true, 5, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.number_quantity', 'math.concept.number_quantity.arithmetic_operations', 'parent_child', true, 6, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.number_quantity', 'math.concept.number_quantity.fractions_decimals_percents', 'parent_child', true, 7, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.number_quantity', 'math.concept.number_quantity.ratios_rates_proportions', 'parent_child', true, 8, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.number_quantity', 'math.concept.number_quantity.exponents_roots', 'parent_child', true, 9, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.number_quantity', 'math.concept.number_quantity.rational_exponents', 'parent_child', true, 10, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.number_quantity', 'math.concept.number_quantity.radicals', 'parent_child', true, 11, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.number_quantity', 'math.concept.number_quantity.complex_numbers', 'parent_child', true, 12, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.number_quantity', 'math.concept.number_quantity.units_dimensional', 'parent_child', true, 13, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept', 'math.concept.algebra', 'parent_child', true, 14, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.algebra', 'math.concept.algebra.expressions', 'parent_child', true, 15, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.algebra.expressions', 'math.concept.algebra.expressions.variables_expressions', 'parent_child', true, 16, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.algebra.expressions', 'math.concept.algebra.expressions.polynomial_expressions', 'parent_child', true, 17, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.algebra.expressions', 'math.concept.algebra.expressions.rational_expressions', 'parent_child', true, 18, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.algebra.expressions', 'math.concept.algebra.expressions.radical_expressions', 'parent_child', true, 19, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.algebra.expressions', 'math.concept.algebra.expressions.exponent_rules', 'parent_child', true, 20, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.algebra.expressions', 'math.concept.algebra.expressions.simplifying_expressions', 'parent_child', true, 21, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.algebra', 'math.concept.algebra.equations', 'parent_child', true, 22, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.algebra.equations', 'math.concept.algebra.equations.linear_equations', 'parent_child', true, 23, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.algebra.equations', 'math.concept.algebra.equations.absolute_value_equations', 'parent_child', true, 24, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.algebra.equations', 'math.concept.algebra.equations.quadratic_equations', 'parent_child', true, 25, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.algebra.equations', 'math.concept.algebra.equations.polynomial_equations', 'parent_child', true, 26, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.algebra.equations', 'math.concept.algebra.equations.rational_equations', 'parent_child', true, 27, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.algebra.equations', 'math.concept.algebra.equations.radical_equations', 'parent_child', true, 28, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.algebra.equations', 'math.concept.algebra.equations.exponential_equations', 'parent_child', true, 29, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.algebra.equations', 'math.concept.algebra.equations.logarithmic_equations', 'parent_child', true, 30, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.algebra.equations', 'math.concept.algebra.equations.systems_linear', 'parent_child', true, 31, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.algebra.equations', 'math.concept.algebra.equations.systems_nonlinear', 'parent_child', true, 32, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.algebra', 'math.concept.algebra.inequalities', 'parent_child', true, 33, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.algebra.inequalities', 'math.concept.algebra.inequalities.linear_inequalities', 'parent_child', true, 34, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.algebra.inequalities', 'math.concept.algebra.inequalities.systems_inequalities', 'parent_child', true, 35, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.algebra', 'math.concept.algebra.sequences_series', 'parent_child', true, 36, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.algebra.sequences_series', 'math.concept.algebra.sequences_series.arithmetic_sequences', 'parent_child', true, 37, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.algebra.sequences_series', 'math.concept.algebra.sequences_series.geometric_sequences', 'parent_child', true, 38, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.algebra.sequences_series', 'math.concept.algebra.sequences_series.recursive_sequences', 'parent_child', true, 39, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.algebra.sequences_series', 'math.concept.algebra.sequences_series.finite_series', 'parent_child', true, 40, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.algebra.sequences_series', 'math.concept.algebra.sequences_series.sigma_notation', 'parent_child', true, 41, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept', 'math.concept.functions', 'parent_child', true, 42, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions', 'math.concept.functions.basics', 'parent_child', true, 43, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.basics', 'math.concept.functions.basics.function_notation', 'parent_child', true, 44, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.basics', 'math.concept.functions.basics.domain_range', 'parent_child', true, 45, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.basics', 'math.concept.functions.basics.intercepts', 'parent_child', true, 46, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.basics', 'math.concept.functions.basics.average_rate_of_change', 'parent_child', true, 47, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.basics', 'math.concept.functions.basics.composition', 'parent_child', true, 48, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.basics', 'math.concept.functions.basics.inverse_functions', 'parent_child', true, 49, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.basics', 'math.concept.functions.basics.transformations', 'parent_child', true, 50, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions', 'math.concept.functions.linear', 'parent_child', true, 51, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.linear', 'math.concept.functions.linear.slope', 'parent_child', true, 52, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.linear', 'math.concept.functions.linear.slope_intercept_form', 'parent_child', true, 53, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.linear', 'math.concept.functions.linear.point_slope_form', 'parent_child', true, 54, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.linear', 'math.concept.functions.linear.parallel_perpendicular', 'parent_child', true, 55, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.linear', 'math.concept.functions.linear.linear_modeling', 'parent_child', true, 56, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions', 'math.concept.functions.quadratic', 'parent_child', true, 57, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.quadratic', 'math.concept.functions.quadratic.standard_form', 'parent_child', true, 58, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.quadratic', 'math.concept.functions.quadratic.vertex_form', 'parent_child', true, 59, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.quadratic', 'math.concept.functions.quadratic.factored_form', 'parent_child', true, 60, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.quadratic', 'math.concept.functions.quadratic.vertex', 'parent_child', true, 61, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.quadratic', 'math.concept.functions.quadratic.axis_of_symmetry', 'parent_child', true, 62, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.quadratic', 'math.concept.functions.quadratic.opening_direction', 'parent_child', true, 63, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.quadratic', 'math.concept.functions.quadratic.roots_zeros', 'parent_child', true, 64, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.quadratic', 'math.concept.functions.quadratic.discriminant', 'parent_child', true, 65, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.quadratic', 'math.concept.functions.quadratic.extreme_value', 'parent_child', true, 66, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.quadratic', 'math.concept.functions.quadratic.where_extreme_occurs', 'parent_child', true, 67, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions', 'math.concept.functions.polynomial', 'parent_child', true, 68, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.polynomial', 'math.concept.functions.polynomial.end_behavior', 'parent_child', true, 69, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.polynomial', 'math.concept.functions.polynomial.zeros_multiplicity', 'parent_child', true, 70, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.polynomial', 'math.concept.functions.polynomial.division', 'parent_child', true, 71, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.polynomial', 'math.concept.functions.polynomial.remainder_factor_theorem', 'parent_child', true, 72, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.polynomial', 'math.concept.functions.polynomial.graphs', 'parent_child', true, 73, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions', 'math.concept.functions.rational', 'parent_child', true, 74, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.rational', 'math.concept.functions.rational.asymptotes', 'parent_child', true, 75, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.rational', 'math.concept.functions.rational.holes', 'parent_child', true, 76, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.rational', 'math.concept.functions.rational.transformations', 'parent_child', true, 77, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.rational', 'math.concept.functions.rational.solving', 'parent_child', true, 78, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions', 'math.concept.functions.exponential_logarithmic', 'parent_child', true, 79, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.exponential_logarithmic', 'math.concept.functions.exponential_logarithmic.exponential_growth_decay', 'parent_child', true, 80, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.exponential_logarithmic', 'math.concept.functions.exponential_logarithmic.exponential_functions', 'parent_child', true, 81, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.exponential_logarithmic', 'math.concept.functions.exponential_logarithmic.logarithmic_functions', 'parent_child', true, 82, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.exponential_logarithmic', 'math.concept.functions.exponential_logarithmic.exp_log_inverse_identity', 'parent_child', true, 83, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.exponential_logarithmic', 'math.concept.functions.exponential_logarithmic.laws_of_logs', 'parent_child', true, 84, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.exponential_logarithmic', 'math.concept.functions.exponential_logarithmic.exponential_models', 'parent_child', true, 85, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.exponential_logarithmic', 'math.concept.functions.exponential_logarithmic.logarithmic_models', 'parent_child', true, 86, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions', 'math.concept.functions.piecewise_absolute', 'parent_child', true, 87, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.piecewise_absolute', 'math.concept.functions.piecewise_absolute.piecewise_functions', 'parent_child', true, 88, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.piecewise_absolute', 'math.concept.functions.piecewise_absolute.absolute_value_functions', 'parent_child', true, 89, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.functions.piecewise_absolute', 'math.concept.functions.piecewise_absolute.step_functions', 'parent_child', true, 90, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept', 'math.concept.geometry', 'parent_child', true, 91, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.geometry', 'math.concept.geometry.lines_angles', 'parent_child', true, 92, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.geometry', 'math.concept.geometry.triangles', 'parent_child', true, 93, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.geometry', 'math.concept.geometry.right_triangle_trig', 'parent_child', true, 94, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.geometry', 'math.concept.geometry.circles', 'parent_child', true, 95, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.geometry', 'math.concept.geometry.polygons', 'parent_child', true, 96, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.geometry', 'math.concept.geometry.area_perimeter', 'parent_child', true, 97, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.geometry', 'math.concept.geometry.surface_area_volume', 'parent_child', true, 98, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.geometry', 'math.concept.geometry.coordinate_geometry', 'parent_child', true, 99, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.geometry', 'math.concept.geometry.transformations', 'parent_child', true, 100, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.geometry', 'math.concept.geometry.similarity_congruence', 'parent_child', true, 101, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.geometry', 'math.concept.geometry.vectors', 'parent_child', true, 102, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.geometry', 'math.concept.geometry.conics', 'parent_child', true, 103, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.geometry.conics', 'math.concept.geometry.conics.parabola', 'parent_child', true, 104, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.geometry.conics', 'math.concept.geometry.conics.circle', 'parent_child', true, 105, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.geometry.conics', 'math.concept.geometry.conics.ellipse', 'parent_child', true, 106, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.geometry.conics', 'math.concept.geometry.conics.hyperbola', 'parent_child', true, 107, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept', 'math.concept.trigonometry', 'parent_child', true, 108, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.trigonometry', 'math.concept.trigonometry.angle_measure', 'parent_child', true, 109, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.trigonometry', 'math.concept.trigonometry.unit_circle', 'parent_child', true, 110, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.trigonometry', 'math.concept.trigonometry.trig_ratios', 'parent_child', true, 111, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.trigonometry', 'math.concept.trigonometry.trig_identities', 'parent_child', true, 112, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.trigonometry', 'math.concept.trigonometry.trig_equations', 'parent_child', true, 113, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.trigonometry', 'math.concept.trigonometry.trig_graphs', 'parent_child', true, 114, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.trigonometry', 'math.concept.trigonometry.inverse_trig', 'parent_child', true, 115, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.trigonometry', 'math.concept.trigonometry.law_sines_cosines', 'parent_child', true, 116, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.trigonometry', 'math.concept.trigonometry.polar_coordinates', 'parent_child', true, 117, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept', 'math.concept.calculus', 'parent_child', true, 118, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus', 'math.concept.calculus.limits', 'parent_child', true, 119, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.limits', 'math.concept.calculus.limits.one_sided_limits', 'parent_child', true, 120, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.limits', 'math.concept.calculus.limits.limit_laws', 'parent_child', true, 121, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.limits', 'math.concept.calculus.limits.continuity', 'parent_child', true, 122, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.limits', 'math.concept.calculus.limits.infinite_limits', 'parent_child', true, 123, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.limits', 'math.concept.calculus.limits.limits_at_infinity', 'parent_child', true, 124, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.limits', 'math.concept.calculus.limits.squeeze_theorem', 'parent_child', true, 125, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus', 'math.concept.calculus.derivatives', 'parent_child', true, 126, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.derivatives', 'math.concept.calculus.derivatives.derivative_definition', 'parent_child', true, 127, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.derivatives', 'math.concept.calculus.derivatives.power_rule', 'parent_child', true, 128, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.derivatives', 'math.concept.calculus.derivatives.product_rule', 'parent_child', true, 129, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.derivatives', 'math.concept.calculus.derivatives.quotient_rule', 'parent_child', true, 130, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.derivatives', 'math.concept.calculus.derivatives.chain_rule', 'parent_child', true, 131, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.derivatives', 'math.concept.calculus.derivatives.implicit_differentiation', 'parent_child', true, 132, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.derivatives', 'math.concept.calculus.derivatives.inverse_derivatives', 'parent_child', true, 133, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.derivatives', 'math.concept.calculus.derivatives.exponential_derivatives', 'parent_child', true, 134, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.derivatives', 'math.concept.calculus.derivatives.logarithmic_derivatives', 'parent_child', true, 135, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.derivatives', 'math.concept.calculus.derivatives.trig_derivatives', 'parent_child', true, 136, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.derivatives', 'math.concept.calculus.derivatives.inverse_trig_derivatives', 'parent_child', true, 137, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.derivatives', 'math.concept.calculus.derivatives.higher_derivatives', 'parent_child', true, 138, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus', 'math.concept.calculus.applications_derivatives', 'parent_child', true, 139, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.applications_derivatives', 'math.concept.calculus.applications_derivatives.tangent_lines', 'parent_child', true, 140, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.applications_derivatives', 'math.concept.calculus.applications_derivatives.related_rates', 'parent_child', true, 141, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.applications_derivatives', 'math.concept.calculus.applications_derivatives.optimization', 'parent_child', true, 142, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.applications_derivatives', 'math.concept.calculus.applications_derivatives.motion', 'parent_child', true, 143, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.applications_derivatives', 'math.concept.calculus.applications_derivatives.mean_value_theorem', 'parent_child', true, 144, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.applications_derivatives', 'math.concept.calculus.applications_derivatives.monotonicity_extrema', 'parent_child', true, 145, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.applications_derivatives', 'math.concept.calculus.applications_derivatives.concavity_inflection', 'parent_child', true, 146, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.applications_derivatives', 'math.concept.calculus.applications_derivatives.curve_sketching', 'parent_child', true, 147, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus', 'math.concept.calculus.integrals', 'parent_child', true, 148, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.integrals', 'math.concept.calculus.integrals.antiderivatives', 'parent_child', true, 149, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.integrals', 'math.concept.calculus.integrals.indefinite_integrals', 'parent_child', true, 150, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.integrals', 'math.concept.calculus.integrals.definite_integrals', 'parent_child', true, 151, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.integrals', 'math.concept.calculus.integrals.riemann_sums', 'parent_child', true, 152, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.integrals', 'math.concept.calculus.integrals.fundamental_theorem', 'parent_child', true, 153, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.integrals', 'math.concept.calculus.integrals.substitution', 'parent_child', true, 154, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.integrals', 'math.concept.calculus.integrals.area_between_curves', 'parent_child', true, 155, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.integrals', 'math.concept.calculus.integrals.volume', 'parent_child', true, 156, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.integrals', 'math.concept.calculus.integrals.accumulation_functions', 'parent_child', true, 157, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.integrals', 'math.concept.calculus.integrals.differential_equations', 'parent_child', true, 158, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus', 'math.concept.calculus.sequences_series', 'parent_child', true, 159, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.sequences_series', 'math.concept.calculus.sequences_series.convergence', 'parent_child', true, 160, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.sequences_series', 'math.concept.calculus.sequences_series.geometric_series', 'parent_child', true, 161, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.sequences_series', 'math.concept.calculus.sequences_series.p_series', 'parent_child', true, 162, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.sequences_series', 'math.concept.calculus.sequences_series.ratio_test', 'parent_child', true, 163, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.sequences_series', 'math.concept.calculus.sequences_series.power_series', 'parent_child', true, 164, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.calculus.sequences_series', 'math.concept.calculus.sequences_series.taylor_series', 'parent_child', true, 165, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept', 'math.concept.statistics_probability', 'parent_child', true, 166, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.statistics_probability', 'math.concept.statistics_probability.data_displays', 'parent_child', true, 167, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.statistics_probability', 'math.concept.statistics_probability.center_spread', 'parent_child', true, 168, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.statistics_probability', 'math.concept.statistics_probability.distributions', 'parent_child', true, 169, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.statistics_probability', 'math.concept.statistics_probability.normal_distribution', 'parent_child', true, 170, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.statistics_probability', 'math.concept.statistics_probability.regression_correlation', 'parent_child', true, 171, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.statistics_probability', 'math.concept.statistics_probability.two_way_tables', 'parent_child', true, 172, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.statistics_probability', 'math.concept.statistics_probability.probability_basics', 'parent_child', true, 173, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.statistics_probability', 'math.concept.statistics_probability.conditional_probability', 'parent_child', true, 174, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.statistics_probability', 'math.concept.statistics_probability.independence', 'parent_child', true, 175, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.statistics_probability', 'math.concept.statistics_probability.counting', 'parent_child', true, 176, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.statistics_probability', 'math.concept.statistics_probability.random_variables', 'parent_child', true, 177, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.statistics_probability', 'math.concept.statistics_probability.sampling', 'parent_child', true, 178, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.statistics_probability', 'math.concept.statistics_probability.confidence_intervals', 'parent_child', true, 179, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.statistics_probability', 'math.concept.statistics_probability.hypothesis_tests', 'parent_child', true, 180, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept', 'math.concept.discrete_math', 'parent_child', true, 181, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.discrete_math', 'math.concept.discrete_math.combinatorics', 'parent_child', true, 182, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.discrete_math', 'math.concept.discrete_math.permutations_combinations', 'parent_child', true, 183, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.discrete_math', 'math.concept.discrete_math.binomial_theorem', 'parent_child', true, 184, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.discrete_math', 'math.concept.discrete_math.graph_theory_basics', 'parent_child', true, 185, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.concept.discrete_math', 'math.concept.discrete_math.logic_sets', 'parent_child', true, 186, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method', 'math.method.algebraic_manipulation', 'parent_child', true, 187, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.algebraic_manipulation', 'math.method.algebraic_manipulation.expand', 'parent_child', true, 188, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.algebraic_manipulation', 'math.method.algebraic_manipulation.factor', 'parent_child', true, 189, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.algebraic_manipulation', 'math.method.algebraic_manipulation.complete_the_square', 'parent_child', true, 190, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.algebraic_manipulation', 'math.method.algebraic_manipulation.isolate_variable', 'parent_child', true, 191, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.algebraic_manipulation', 'math.method.algebraic_manipulation.substitute', 'parent_child', true, 192, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.algebraic_manipulation', 'math.method.algebraic_manipulation.combine_like_terms', 'parent_child', true, 193, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.algebraic_manipulation', 'math.method.algebraic_manipulation.rationalize', 'parent_child', true, 194, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.algebraic_manipulation', 'math.method.algebraic_manipulation.clear_denominators', 'parent_child', true, 195, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.algebraic_manipulation', 'math.method.algebraic_manipulation.use_properties_equality', 'parent_child', true, 196, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.algebraic_manipulation', 'math.method.algebraic_manipulation.rewrite_equivalent_form', 'parent_child', true, 197, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.algebraic_manipulation', 'math.method.algebraic_manipulation.long_synthetic_division', 'parent_child', true, 198, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method', 'math.method.equation_solving', 'parent_child', true, 199, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.equation_solving', 'math.method.equation_solving.solve_by_factoring', 'parent_child', true, 200, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.equation_solving', 'math.method.equation_solving.use_quadratic_formula', 'parent_child', true, 201, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.equation_solving', 'math.method.equation_solving.complete_square_solve', 'parent_child', true, 202, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.equation_solving', 'math.method.equation_solving.system_substitution', 'parent_child', true, 203, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.equation_solving', 'math.method.equation_solving.system_elimination', 'parent_child', true, 204, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.equation_solving', 'math.method.equation_solving.solve_graphically', 'parent_child', true, 205, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.equation_solving', 'math.method.equation_solving.check_extraneous_solutions', 'parent_child', true, 206, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.equation_solving', 'math.method.equation_solving.interval_testing', 'parent_child', true, 207, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method', 'math.method.function_analysis', 'parent_child', true, 208, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.function_analysis', 'math.method.function_analysis.evaluate_function', 'parent_child', true, 209, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.function_analysis', 'math.method.function_analysis.find_domain', 'parent_child', true, 210, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.function_analysis', 'math.method.function_analysis.find_range', 'parent_child', true, 211, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.function_analysis', 'math.method.function_analysis.compose_functions', 'parent_child', true, 212, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.function_analysis', 'math.method.function_analysis.find_inverse_function', 'parent_child', true, 213, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.function_analysis', 'math.method.function_analysis.transform_parent_function', 'parent_child', true, 214, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.function_analysis', 'math.method.function_analysis.compare_function_values', 'parent_child', true, 215, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.function_analysis', 'math.method.function_analysis.use_symmetry', 'parent_child', true, 216, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.function_analysis', 'math.method.function_analysis.analyze_end_behavior', 'parent_child', true, 217, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method', 'math.method.graph_reasoning', 'parent_child', true, 218, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.graph_reasoning', 'math.method.graph_reasoning.read_from_graph', 'parent_child', true, 219, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.graph_reasoning', 'math.method.graph_reasoning.sketch_graph', 'parent_child', true, 220, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.graph_reasoning', 'math.method.graph_reasoning.use_intercepts', 'parent_child', true, 221, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.graph_reasoning', 'math.method.graph_reasoning.use_slope', 'parent_child', true, 222, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.graph_reasoning', 'math.method.graph_reasoning.connect_graph_equation', 'parent_child', true, 223, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.graph_reasoning', 'math.method.graph_reasoning.interpret_area_under_curve', 'parent_child', true, 224, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.graph_reasoning', 'math.method.graph_reasoning.interpret_slope_rate', 'parent_child', true, 225, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method', 'math.method.trigonometric_methods', 'parent_child', true, 226, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.trigonometric_methods', 'math.method.trigonometric_methods.use_unit_circle', 'parent_child', true, 227, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.trigonometric_methods', 'math.method.trigonometric_methods.use_trig_identity', 'parent_child', true, 228, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.trigonometric_methods', 'math.method.trigonometric_methods.solve_trig_equation', 'parent_child', true, 229, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.trigonometric_methods', 'math.method.trigonometric_methods.convert_degrees_radians', 'parent_child', true, 230, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.trigonometric_methods', 'math.method.trigonometric_methods.use_law_sines_cosines', 'parent_child', true, 231, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.trigonometric_methods', 'math.method.trigonometric_methods.use_reference_angle', 'parent_child', true, 232, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method', 'math.method.calculus_procedure', 'parent_child', true, 233, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.calculus_procedure', 'math.method.calculus_procedure.simplify_before_differentiating', 'parent_child', true, 234, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.calculus_procedure', 'math.method.calculus_procedure.use_limit_definition', 'parent_child', true, 235, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.calculus_procedure', 'math.method.calculus_procedure.use_power_rule', 'parent_child', true, 236, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.calculus_procedure', 'math.method.calculus_procedure.use_product_rule', 'parent_child', true, 237, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.calculus_procedure', 'math.method.calculus_procedure.use_quotient_rule', 'parent_child', true, 238, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.calculus_procedure', 'math.method.calculus_procedure.use_chain_rule', 'parent_child', true, 239, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.calculus_procedure', 'math.method.calculus_procedure.use_implicit_differentiation', 'parent_child', true, 240, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.calculus_procedure', 'math.method.calculus_procedure.use_logarithmic_differentiation', 'parent_child', true, 241, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.calculus_procedure', 'math.method.calculus_procedure.use_exp_log_inverse_identity', 'parent_child', true, 242, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.calculus_procedure', 'math.method.calculus_procedure.use_u_substitution', 'parent_child', true, 243, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.calculus_procedure', 'math.method.calculus_procedure.use_integration_by_parts', 'parent_child', true, 244, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.calculus_procedure', 'math.method.calculus_procedure.use_fundamental_theorem', 'parent_child', true, 245, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.calculus_procedure', 'math.method.calculus_procedure.use_riemann_sum', 'parent_child', true, 246, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.calculus_procedure', 'math.method.calculus_procedure.separate_variables', 'parent_child', true, 247, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.calculus_procedure', 'math.method.calculus_procedure.linear_approximation', 'parent_child', true, 248, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method', 'math.method.modeling', 'parent_child', true, 249, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.modeling', 'math.method.modeling.define_variables', 'parent_child', true, 250, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.modeling', 'math.method.modeling.choose_model', 'parent_child', true, 251, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.modeling', 'math.method.modeling.build_equation', 'parent_child', true, 252, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.modeling', 'math.method.modeling.fit_model', 'parent_child', true, 253, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.modeling', 'math.method.modeling.interpret_parameters', 'parent_child', true, 254, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.modeling', 'math.method.modeling.check_domain_constraints', 'parent_child', true, 255, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.modeling', 'math.method.modeling.validate_units', 'parent_child', true, 256, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.modeling', 'math.method.modeling.optimize_quantity', 'parent_child', true, 257, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.modeling', 'math.method.modeling.translate_words_to_expressions', 'parent_child', true, 258, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method', 'math.method.statistical_methods', 'parent_child', true, 259, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.statistical_methods', 'math.method.statistical_methods.compute_summary_stat', 'parent_child', true, 260, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.statistical_methods', 'math.method.statistical_methods.standardize_z_score', 'parent_child', true, 261, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.statistical_methods', 'math.method.statistical_methods.calculate_probability', 'parent_child', true, 262, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.statistical_methods', 'math.method.statistical_methods.use_counting_rule', 'parent_child', true, 263, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.statistical_methods', 'math.method.statistical_methods.fit_regression_line', 'parent_child', true, 264, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.statistical_methods', 'math.method.statistical_methods.interpret_residuals', 'parent_child', true, 265, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.statistical_methods', 'math.method.statistical_methods.construct_confidence_interval', 'parent_child', true, 266, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.statistical_methods', 'math.method.statistical_methods.perform_hypothesis_test', 'parent_child', true, 267, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method', 'math.method.proof_reasoning', 'parent_child', true, 268, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.proof_reasoning', 'math.method.proof_reasoning.direct_reasoning', 'parent_child', true, 269, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.proof_reasoning', 'math.method.proof_reasoning.contradiction', 'parent_child', true, 270, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.proof_reasoning', 'math.method.proof_reasoning.induction', 'parent_child', true, 271, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.proof_reasoning', 'math.method.proof_reasoning.justify_steps', 'parent_child', true, 272, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.proof_reasoning', 'math.method.proof_reasoning.counterexample', 'parent_child', true, 273, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.method.proof_reasoning', 'math.method.proof_reasoning.dimensional_analysis', 'parent_child', true, 274, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task', 'math.task.identify', 'parent_child', true, 275, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task.identify', 'math.task.identify.identify_concept', 'parent_child', true, 276, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task.identify', 'math.task.identify.identify_form', 'parent_child', true, 277, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task.identify', 'math.task.identify.identify_graph_feature', 'parent_child', true, 278, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task.identify', 'math.task.identify.identify_error', 'parent_child', true, 279, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task.identify', 'math.task.identify.identify_parameter', 'parent_child', true, 280, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task', 'math.task.determine', 'parent_child', true, 281, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task.determine', 'math.task.determine.determine_value', 'parent_child', true, 282, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task.determine', 'math.task.determine.determine_derivative', 'parent_child', true, 283, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task.determine', 'math.task.determine.determine_integral', 'parent_child', true, 284, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task.determine', 'math.task.determine.determine_limit', 'parent_child', true, 285, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task.determine', 'math.task.determine.determine_roots', 'parent_child', true, 286, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task.determine', 'math.task.determine.determine_equation', 'parent_child', true, 287, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task.determine', 'math.task.determine.determine_domain_range', 'parent_child', true, 288, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task.determine', 'math.task.determine.determine_extreme_value', 'parent_child', true, 289, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task.determine', 'math.task.determine.determine_where_extreme_occurs', 'parent_child', true, 290, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task.determine', 'math.task.determine.determine_probability', 'parent_child', true, 291, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task.determine', 'math.task.determine.determine_statistic', 'parent_child', true, 292, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task', 'math.task.rewrite', 'parent_child', true, 293, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task.rewrite', 'math.task.rewrite.simplify_expression', 'parent_child', true, 294, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task.rewrite', 'math.task.rewrite.expand_expression', 'parent_child', true, 295, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task.rewrite', 'math.task.rewrite.factor_expression', 'parent_child', true, 296, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task.rewrite', 'math.task.rewrite.convert_forms', 'parent_child', true, 297, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task.rewrite', 'math.task.rewrite.solve_for_variable', 'parent_child', true, 298, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task.rewrite', 'math.task.rewrite.transform_expression', 'parent_child', true, 299, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task', 'math.task.explain', 'parent_child', true, 300, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task.explain', 'math.task.explain.explain_reasoning', 'parent_child', true, 301, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task.explain', 'math.task.explain.justify_answer', 'parent_child', true, 302, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task.explain', 'math.task.explain.compare_methods', 'parent_child', true, 303, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task.explain', 'math.task.explain.interpret_result', 'parent_child', true, 304, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task.explain', 'math.task.explain.explain_error', 'parent_child', true, 305, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task', 'math.task.model', 'parent_child', true, 306, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task.model', 'math.task.model.build_model', 'parent_child', true, 307, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task.model', 'math.task.model.optimize_quantity', 'parent_child', true, 308, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task.model', 'math.task.model.predict_extrapolate', 'parent_child', true, 309, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task.model', 'math.task.model.validate_model', 'parent_child', true, 310, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task', 'math.task.prove', 'parent_child', true, 311, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task.prove', 'math.task.prove.prove_identity', 'parent_child', true, 312, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task.prove', 'math.task.prove.prove_equivalence', 'parent_child', true, 313, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task.prove', 'math.task.prove.derive_formula', 'parent_child', true, 314, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task', 'math.task.classify', 'parent_child', true, 315, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task.classify', 'math.task.classify.classify_function', 'parent_child', true, 316, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task.classify', 'math.task.classify.classify_distribution', 'parent_child', true, 317, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.task.classify', 'math.task.classify.choose_method', 'parent_child', true, 318, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form', 'math.form.symbolic', 'parent_child', true, 319, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.symbolic', 'math.form.symbolic.expression', 'parent_child', true, 320, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.symbolic', 'math.form.symbolic.equation', 'parent_child', true, 321, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.symbolic', 'math.form.symbolic.inequality', 'parent_child', true, 322, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.symbolic', 'math.form.symbolic.system', 'parent_child', true, 323, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.symbolic', 'math.form.symbolic.function_rule', 'parent_child', true, 324, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.symbolic', 'math.form.symbolic.product_expression', 'parent_child', true, 325, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.symbolic', 'math.form.symbolic.quotient_expression', 'parent_child', true, 326, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.symbolic', 'math.form.symbolic.composite_expression', 'parent_child', true, 327, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.symbolic', 'math.form.symbolic.exp_log_composition', 'parent_child', true, 328, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.symbolic', 'math.form.symbolic.piecewise_function', 'parent_child', true, 329, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.symbolic', 'math.form.symbolic.matrix_vector', 'parent_child', true, 330, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.symbolic', 'math.form.symbolic.sequence_notation', 'parent_child', true, 331, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form', 'math.form.visual', 'parent_child', true, 332, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.visual', 'math.form.visual.coordinate_graph', 'parent_child', true, 333, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.visual', 'math.form.visual.diagram', 'parent_child', true, 334, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.visual', 'math.form.visual.geometric_figure', 'parent_child', true, 335, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.visual', 'math.form.visual.number_line', 'parent_child', true, 336, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.visual', 'math.form.visual.vector_diagram', 'parent_child', true, 337, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.visual', 'math.form.visual.histogram_boxplot', 'parent_child', true, 338, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.visual', 'math.form.visual.scatterplot', 'parent_child', true, 339, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form', 'math.form.table', 'parent_child', true, 340, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.table', 'math.form.table.input_output_table', 'parent_child', true, 341, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.table', 'math.form.table.data_table', 'parent_child', true, 342, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.table', 'math.form.table.frequency_table', 'parent_child', true, 343, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.table', 'math.form.table.truth_table', 'parent_child', true, 344, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form', 'math.form.verbal', 'parent_child', true, 345, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.verbal', 'math.form.verbal.word_problem', 'parent_child', true, 346, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.verbal', 'math.form.verbal.multi_sentence_context', 'parent_child', true, 347, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.verbal', 'math.form.verbal.proof_prompt', 'parent_child', true, 348, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.verbal', 'math.form.verbal.error_analysis_prompt', 'parent_child', true, 349, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form', 'math.form.mixed', 'parent_child', true, 350, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.mixed', 'math.form.mixed.equation_graph', 'parent_child', true, 351, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.mixed', 'math.form.mixed.table_graph', 'parent_child', true, 352, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.mixed', 'math.form.mixed.diagram_equation', 'parent_child', true, 353, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.mixed', 'math.form.mixed.text_equation', 'parent_child', true, 354, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form', 'math.form.context', 'parent_child', true, 355, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.context', 'math.form.context.pure_math', 'parent_child', true, 356, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.context', 'math.form.context.projectile_motion', 'parent_child', true, 357, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.context', 'math.form.context.area_optimization', 'parent_child', true, 358, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.context', 'math.form.context.revenue_profit', 'parent_child', true, 359, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.context', 'math.form.context.rate_motion', 'parent_child', true, 360, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.context', 'math.form.context.population_growth', 'parent_child', true, 361, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.context', 'math.form.context.finance_interest', 'parent_child', true, 362, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.context', 'math.form.context.geometry_design', 'parent_child', true, 363, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.form.context', 'math.form.context.data_science_context', 'parent_child', true, 364, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum', 'math.curriculum.bc', 'parent_child', true, 365, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.bc', 'math.curriculum.bc.math_10', 'parent_child', true, 366, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.bc', 'math.curriculum.bc.precalculus_11', 'parent_child', true, 367, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.bc.precalculus_11', 'math.curriculum.bc.precalculus_11.real_numbers_radicals', 'parent_child', true, 368, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.bc.precalculus_11', 'math.curriculum.bc.precalculus_11.powers_rational_exponents', 'parent_child', true, 369, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.bc.precalculus_11', 'math.curriculum.bc.precalculus_11.quadratic_functions', 'parent_child', true, 370, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.bc.precalculus_11', 'math.curriculum.bc.precalculus_11.rational_expressions_equations', 'parent_child', true, 371, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.bc.precalculus_11', 'math.curriculum.bc.precalculus_11.trigonometry', 'parent_child', true, 372, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.bc.precalculus_11', 'math.curriculum.bc.precalculus_11.systems', 'parent_child', true, 373, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.bc.precalculus_11', 'math.curriculum.bc.precalculus_11.sequences_series', 'parent_child', true, 374, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.bc', 'math.curriculum.bc.precalculus_12', 'parent_child', true, 375, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.bc.precalculus_12', 'math.curriculum.bc.precalculus_12.transformations', 'parent_child', true, 376, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.bc.precalculus_12', 'math.curriculum.bc.precalculus_12.polynomial_functions', 'parent_child', true, 377, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.bc.precalculus_12', 'math.curriculum.bc.precalculus_12.rational_functions', 'parent_child', true, 378, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.bc.precalculus_12', 'math.curriculum.bc.precalculus_12.exponential_logarithmic_functions', 'parent_child', true, 379, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.bc.precalculus_12', 'math.curriculum.bc.precalculus_12.trigonometry', 'parent_child', true, 380, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.bc.precalculus_12', 'math.curriculum.bc.precalculus_12.combinatorics', 'parent_child', true, 381, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.bc', 'math.curriculum.bc.calculus_12', 'parent_child', true, 382, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.bc.calculus_12', 'math.curriculum.bc.calculus_12.limits_continuity', 'parent_child', true, 383, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.bc.calculus_12', 'math.curriculum.bc.calculus_12.derivatives', 'parent_child', true, 384, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.bc.calculus_12', 'math.curriculum.bc.calculus_12.applications_derivatives', 'parent_child', true, 385, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.bc.calculus_12', 'math.curriculum.bc.calculus_12.integrals', 'parent_child', true, 386, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum', 'math.curriculum.ap', 'parent_child', true, 387, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.ap', 'math.curriculum.ap.ap_precalculus', 'parent_child', true, 388, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.ap.ap_precalculus', 'math.curriculum.ap.ap_precalculus.polynomial_rational_functions', 'parent_child', true, 389, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.ap.ap_precalculus', 'math.curriculum.ap.ap_precalculus.exponential_log_functions', 'parent_child', true, 390, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.ap.ap_precalculus', 'math.curriculum.ap.ap_precalculus.trig_polar_functions', 'parent_child', true, 391, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.ap.ap_precalculus', 'math.curriculum.ap.ap_precalculus.functions_parameters_vectors_matrices', 'parent_child', true, 392, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.ap', 'math.curriculum.ap.ap_calculus_ab', 'parent_child', true, 393, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.ap.ap_calculus_ab', 'math.curriculum.ap.ap_calculus_ab.limits_continuity', 'parent_child', true, 394, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.ap.ap_calculus_ab', 'math.curriculum.ap.ap_calculus_ab.differentiation_rules', 'parent_child', true, 395, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.ap.ap_calculus_ab', 'math.curriculum.ap.ap_calculus_ab.contextual_applications_derivatives', 'parent_child', true, 396, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.ap.ap_calculus_ab', 'math.curriculum.ap.ap_calculus_ab.analytical_applications_derivatives', 'parent_child', true, 397, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.ap.ap_calculus_ab', 'math.curriculum.ap.ap_calculus_ab.integration_accumulation', 'parent_child', true, 398, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.ap.ap_calculus_ab', 'math.curriculum.ap.ap_calculus_ab.differential_equations', 'parent_child', true, 399, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.ap.ap_calculus_ab', 'math.curriculum.ap.ap_calculus_ab.applications_integration', 'parent_child', true, 400, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.ap', 'math.curriculum.ap.ap_calculus_bc', 'parent_child', true, 401, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.ap.ap_calculus_bc', 'math.curriculum.ap.ap_calculus_bc.parametric_polar_vector', 'parent_child', true, 402, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.ap.ap_calculus_bc', 'math.curriculum.ap.ap_calculus_bc.infinite_sequences_series', 'parent_child', true, 403, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.ap', 'math.curriculum.ap.ap_statistics', 'parent_child', true, 404, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.ap.ap_statistics', 'math.curriculum.ap.ap_statistics.exploring_data', 'parent_child', true, 405, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.ap.ap_statistics', 'math.curriculum.ap.ap_statistics.sampling_experimentation', 'parent_child', true, 406, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.ap.ap_statistics', 'math.curriculum.ap.ap_statistics.probability', 'parent_child', true, 407, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.ap.ap_statistics', 'math.curriculum.ap.ap_statistics.inference', 'parent_child', true, 408, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum', 'math.curriculum.sat', 'parent_child', true, 409, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.sat', 'math.curriculum.sat.algebra', 'parent_child', true, 410, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.sat', 'math.curriculum.sat.advanced_math', 'parent_child', true, 411, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.sat', 'math.curriculum.sat.problem_solving_data_analysis', 'parent_child', true, 412, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.sat', 'math.curriculum.sat.geometry_trigonometry', 'parent_child', true, 413, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum', 'math.curriculum.common_core', 'parent_child', true, 414, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.common_core', 'math.curriculum.common_core.number_quantity', 'parent_child', true, 415, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.common_core', 'math.curriculum.common_core.algebra', 'parent_child', true, 416, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.common_core', 'math.curriculum.common_core.functions', 'parent_child', true, 417, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.common_core', 'math.curriculum.common_core.geometry', 'parent_child', true, 418, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.common_core', 'math.curriculum.common_core.statistics_probability', 'parent_child', true, 419, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum', 'math.curriculum.ib', 'parent_child', true, 420, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.ib', 'math.curriculum.ib.aa_sl', 'parent_child', true, 421, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.ib', 'math.curriculum.ib.aa_hl', 'parent_child', true, 422, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.ib', 'math.curriculum.ib.ai_sl', 'parent_child', true, 423, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.ib', 'math.curriculum.ib.ai_hl', 'parent_child', true, 424, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum', 'math.curriculum.a_level', 'parent_child', true, 425, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.a_level', 'math.curriculum.a_level.pure_math', 'parent_child', true, 426, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.a_level', 'math.curriculum.a_level.mechanics', 'parent_child', true, 427, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.a_level', 'math.curriculum.a_level.statistics', 'parent_child', true, 428, 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('math.curriculum.ap.ap_precalculus.polynomial_rational_functions', 'math.concept.functions.polynomial', 'maps_to', false, 429, 'active', '{"seed":"math_taxonomy_v2","sourceEdgeKind":"curriculum_maps_to_concept"}'::jsonb),
  ('math.curriculum.ap.ap_precalculus.polynomial_rational_functions', 'math.concept.functions.rational', 'maps_to', false, 430, 'active', '{"seed":"math_taxonomy_v2","sourceEdgeKind":"curriculum_maps_to_concept"}'::jsonb),
  ('math.curriculum.ap.ap_precalculus.polynomial_rational_functions', 'math.concept.functions.quadratic', 'maps_to', false, 431, 'active', '{"seed":"math_taxonomy_v2","sourceEdgeKind":"curriculum_maps_to_concept"}'::jsonb),
  ('math.curriculum.ap.ap_precalculus.exponential_log_functions', 'math.concept.functions.exponential_logarithmic', 'maps_to', false, 432, 'active', '{"seed":"math_taxonomy_v2","sourceEdgeKind":"curriculum_maps_to_concept"}'::jsonb),
  ('math.curriculum.ap.ap_precalculus.trig_polar_functions', 'math.concept.trigonometry', 'maps_to', false, 433, 'active', '{"seed":"math_taxonomy_v2","sourceEdgeKind":"curriculum_maps_to_concept"}'::jsonb),
  ('math.curriculum.ap.ap_calculus_ab.limits_continuity', 'math.concept.calculus.limits', 'maps_to', false, 434, 'active', '{"seed":"math_taxonomy_v2","sourceEdgeKind":"curriculum_maps_to_concept"}'::jsonb),
  ('math.curriculum.ap.ap_calculus_ab.differentiation_rules', 'math.concept.calculus.derivatives', 'maps_to', false, 435, 'active', '{"seed":"math_taxonomy_v2","sourceEdgeKind":"curriculum_maps_to_concept"}'::jsonb),
  ('math.curriculum.ap.ap_calculus_ab.contextual_applications_derivatives', 'math.concept.calculus.applications_derivatives', 'maps_to', false, 436, 'active', '{"seed":"math_taxonomy_v2","sourceEdgeKind":"curriculum_maps_to_concept"}'::jsonb),
  ('math.curriculum.ap.ap_calculus_ab.integration_accumulation', 'math.concept.calculus.integrals', 'maps_to', false, 437, 'active', '{"seed":"math_taxonomy_v2","sourceEdgeKind":"curriculum_maps_to_concept"}'::jsonb),
  ('math.curriculum.ap.ap_calculus_bc.infinite_sequences_series', 'math.concept.calculus.sequences_series', 'maps_to', false, 438, 'active', '{"seed":"math_taxonomy_v2","sourceEdgeKind":"curriculum_maps_to_concept"}'::jsonb),
  ('math.curriculum.ap.ap_statistics.probability', 'math.concept.statistics_probability.probability_basics', 'maps_to', false, 439, 'active', '{"seed":"math_taxonomy_v2","sourceEdgeKind":"curriculum_maps_to_concept"}'::jsonb),
  ('math.curriculum.bc.precalculus_11.quadratic_functions', 'math.concept.functions.quadratic', 'maps_to', false, 440, 'active', '{"seed":"math_taxonomy_v2","sourceEdgeKind":"curriculum_maps_to_concept"}'::jsonb),
  ('math.curriculum.bc.precalculus_11.trigonometry', 'math.concept.trigonometry', 'maps_to', false, 441, 'active', '{"seed":"math_taxonomy_v2","sourceEdgeKind":"curriculum_maps_to_concept"}'::jsonb),
  ('math.curriculum.bc.precalculus_12.exponential_logarithmic_functions', 'math.concept.functions.exponential_logarithmic', 'maps_to', false, 442, 'active', '{"seed":"math_taxonomy_v2","sourceEdgeKind":"curriculum_maps_to_concept"}'::jsonb),
  ('math.curriculum.bc.calculus_12.derivatives', 'math.concept.calculus.derivatives', 'maps_to', false, 443, 'active', '{"seed":"math_taxonomy_v2","sourceEdgeKind":"curriculum_maps_to_concept"}'::jsonb),
  ('math.curriculum.bc.calculus_12.integrals', 'math.concept.calculus.integrals', 'maps_to', false, 444, 'active', '{"seed":"math_taxonomy_v2","sourceEdgeKind":"curriculum_maps_to_concept"}'::jsonb),
  ('math.curriculum.sat.algebra', 'math.concept.algebra', 'maps_to', false, 445, 'active', '{"seed":"math_taxonomy_v2","sourceEdgeKind":"curriculum_maps_to_concept"}'::jsonb),
  ('math.curriculum.sat.advanced_math', 'math.concept.functions', 'maps_to', false, 446, 'active', '{"seed":"math_taxonomy_v2","sourceEdgeKind":"curriculum_maps_to_concept"}'::jsonb),
  ('math.curriculum.sat.geometry_trigonometry', 'math.concept.geometry', 'maps_to', false, 447, 'active', '{"seed":"math_taxonomy_v2","sourceEdgeKind":"curriculum_maps_to_concept"}'::jsonb),
  ('math.curriculum.sat.geometry_trigonometry', 'math.concept.trigonometry', 'maps_to', false, 448, 'active', '{"seed":"math_taxonomy_v2","sourceEdgeKind":"curriculum_maps_to_concept"}'::jsonb);

create temporary table _math_taxonomy_v2_aliases (
  alias_text text not null,
  normalized_alias text not null,
  tag_id text not null,
  status text not null,
  metadata jsonb not null,
  primary key (normalized_alias, tag_id)
) on commit drop;

insert into _math_taxonomy_v2_aliases (
  alias_text,
  normalized_alias,
  tag_id,
  status,
  metadata
) values
  ('quadratic max', 'quadratic max', 'math.concept.functions.quadratic.extreme_value', 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('maximum value', 'maximum value', 'math.concept.functions.quadratic.extreme_value', 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('where maximum occurs', 'where maximum occurs', 'math.concept.functions.quadratic.where_extreme_occurs', 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('x value of vertex', 'x value of vertex', 'math.concept.functions.quadratic.where_extreme_occurs', 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('e ln composition', 'e ln composition', 'math.form.symbolic.exp_log_composition', 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('exp log composition', 'exp log composition', 'math.form.symbolic.exp_log_composition', 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('e ln inverse', 'e ln inverse', 'math.method.calculus_procedure.use_exp_log_inverse_identity', 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('e to ln identity', 'e to ln identity', 'math.method.calculus_procedure.use_exp_log_inverse_identity', 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('complete square', 'complete square', 'math.method.algebraic_manipulation.complete_the_square', 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('read graph', 'read graph', 'math.method.graph_reasoning.read_from_graph', 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('chain rule', 'chain rule', 'math.concept.calculus.derivatives.chain_rule', 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('composite derivative', 'composite derivative', 'math.concept.calculus.derivatives.chain_rule', 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('chain rule method', 'chain rule method', 'math.method.calculus_procedure.use_chain_rule', 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('use chain rule', 'use chain rule', 'math.method.calculus_procedure.use_chain_rule', 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('vertex', 'vertex', 'math.concept.functions.quadratic.vertex', 'active', '{"seed":"math_taxonomy_v2"}'::jsonb),
  ('identify graph feature', 'identify graph feature', 'math.task.identify.identify_graph_feature', 'active', '{"seed":"math_taxonomy_v2"}'::jsonb);

do $$
declare
  conflict_ids text;
begin
  if (select count(*) from _math_taxonomy_v2_nodes) <> 430
     or (select count(*) from _math_taxonomy_v2_facets) <> 5
     or (select count(*) from _math_taxonomy_v2_edges) <> 449
     or (select count(*) from _math_taxonomy_v2_aliases) <> 16 then
    raise exception '0056 rejected: embedded Math taxonomy v2 catalog is incomplete';
  end if;

  select string_agg(stage.tag_id, ', ' order by stage.tag_id)
  into conflict_ids
  from _math_taxonomy_v2_nodes stage
  join public.taxonomy_nodes live using (tag_id)
  where live.node_kind is distinct from stage.node_kind
     or live.subject_tag_id is distinct from stage.subject_tag_id
     or live.facet_key is distinct from stage.facet_key
     or live.status is distinct from stage.status;

  if conflict_ids is not null then
    raise exception '0056 rejected: existing taxonomy node identifiers have incompatible structure'
      using detail = conflict_ids;
  end if;

  select string_agg(stage.facet_key, ', ' order by stage.facet_key)
  into conflict_ids
  from _math_taxonomy_v2_facets stage
  join public.taxonomy_facets live using (facet_key)
  where live.subject_tag_id is distinct from stage.subject_tag_id
     or live.root_tag_id is distinct from stage.root_tag_id
     or live.status is distinct from stage.status;

  if conflict_ids is not null then
    raise exception '0056 rejected: existing taxonomy facet identifiers have incompatible structure'
      using detail = conflict_ids;
  end if;

  select string_agg(
    stage.from_tag_id || '>' || stage.to_tag_id || ':' || stage.edge_kind,
    ', ' order by stage.from_tag_id, stage.to_tag_id, stage.edge_kind
  )
  into conflict_ids
  from _math_taxonomy_v2_edges stage
  join public.taxonomy_edges live
    on live.from_tag_id = stage.from_tag_id
   and live.to_tag_id = stage.to_tag_id
   and live.edge_kind = stage.edge_kind
  where live.is_primary is distinct from stage.is_primary
     or live.status is distinct from stage.status;

  if conflict_ids is not null then
    raise exception '0056 rejected: existing taxonomy edges have incompatible structure'
      using detail = conflict_ids;
  end if;

  select string_agg(
    stage.normalized_alias || '>' || stage.tag_id,
    ', ' order by stage.normalized_alias, stage.tag_id
  )
  into conflict_ids
  from _math_taxonomy_v2_aliases stage
  join public.taxonomy_aliases live
    on live.normalized_alias = stage.normalized_alias
   and live.tag_id = stage.tag_id
  where live.status is distinct from stage.status;

  if conflict_ids is not null then
    raise exception '0056 rejected: existing taxonomy aliases have incompatible status'
      using detail = conflict_ids;
  end if;
end;
$$;

-- Insert dependency roots first. Existing roots are preserved verbatim.
insert into public.taxonomy_nodes (
  tag_id,
  node_kind,
  subject_tag_id,
  facet_key,
  label,
  description,
  is_assignable,
  sort_order,
  status,
  metadata
)
select
  stage.tag_id,
  stage.node_kind,
  stage.subject_tag_id,
  stage.facet_key,
  stage.label,
  stage.description,
  false,
  stage.sort_order,
  stage.status,
  stage.metadata
from _math_taxonomy_v2_nodes stage
where stage.node_kind in ('subject', 'facet_root')
order by case stage.node_kind when 'subject' then 0 else 1 end, stage.sort_order, stage.tag_id
on conflict (tag_id) do nothing;

insert into public.taxonomy_facets (
  facet_key,
  subject_tag_id,
  root_tag_id,
  label,
  description,
  sort_order,
  status,
  config
)
select
  stage.facet_key,
  stage.subject_tag_id,
  stage.root_tag_id,
  stage.label,
  stage.description,
  stage.sort_order,
  stage.status,
  stage.config
from _math_taxonomy_v2_facets stage
order by stage.sort_order, stage.facet_key
on conflict (facet_key) do nothing;

insert into public.taxonomy_nodes (
  tag_id,
  node_kind,
  subject_tag_id,
  facet_key,
  label,
  description,
  is_assignable,
  sort_order,
  status,
  metadata
)
select
  stage.tag_id,
  stage.node_kind,
  stage.subject_tag_id,
  stage.facet_key,
  stage.label,
  stage.description,
  stage.is_assignable,
  stage.sort_order,
  stage.status,
  stage.metadata
from _math_taxonomy_v2_nodes stage
where stage.node_kind = 'tag'
order by stage.sort_order, stage.tag_id
on conflict (tag_id) do nothing;

insert into public.taxonomy_edges (
  from_tag_id,
  to_tag_id,
  edge_kind,
  is_primary,
  sort_order,
  status,
  metadata
)
select
  stage.from_tag_id,
  stage.to_tag_id,
  stage.edge_kind,
  stage.is_primary,
  stage.sort_order,
  stage.status,
  stage.metadata
from _math_taxonomy_v2_edges stage
order by stage.sort_order, stage.from_tag_id, stage.to_tag_id, stage.edge_kind
on conflict (from_tag_id, to_tag_id, edge_kind) do nothing;

-- Existing assignments are intentionally untouched. Only future assignment eligibility changes.
with desired_assignability as (
  select
    node.tag_id,
    node.node_kind = 'tag'
      and node.status = 'active'
      and not exists (
        select 1
        from public.taxonomy_edges edge
        where edge.from_tag_id = node.tag_id
          and edge.edge_kind = 'parent_child'
          and edge.status = 'active'
      ) as is_assignable
  from public.taxonomy_nodes node
  join _math_taxonomy_v2_nodes stage using (tag_id)
)
update public.taxonomy_nodes node
set
  is_assignable = desired.is_assignable,
  updated_at = now()
from desired_assignability desired
where node.tag_id = desired.tag_id
  and node.is_assignable is distinct from desired.is_assignable;

insert into public.taxonomy_aliases (
  alias_text,
  normalized_alias,
  tag_id,
  status,
  metadata
)
select
  stage.alias_text,
  stage.normalized_alias,
  stage.tag_id,
  stage.status,
  stage.metadata
from _math_taxonomy_v2_aliases stage
order by stage.normalized_alias, stage.tag_id
on conflict (normalized_alias, tag_id) do nothing;

-- The closure table is a derived cache. TRUNCATE inside the existing helper is transactional.
select private.rebuild_taxonomy_node_closure();

do $$
begin
  if exists (
    select 1
    from _math_taxonomy_v2_nodes stage
    left join public.taxonomy_nodes live using (tag_id)
    where live.tag_id is null
       or live.node_kind is distinct from stage.node_kind
       or live.subject_tag_id is distinct from stage.subject_tag_id
       or live.facet_key is distinct from stage.facet_key
       or live.status is distinct from stage.status
  ) then
    raise exception '0056 rejected: not every catalog node exists with compatible structure';
  end if;

  if exists (
    select 1
    from _math_taxonomy_v2_facets stage
    left join public.taxonomy_facets live using (facet_key)
    where live.facet_key is null
       or live.subject_tag_id is distinct from stage.subject_tag_id
       or live.root_tag_id is distinct from stage.root_tag_id
       or live.status is distinct from stage.status
  ) then
    raise exception '0056 rejected: not every catalog facet exists with compatible structure';
  end if;

  if exists (
    select 1
    from _math_taxonomy_v2_edges stage
    left join public.taxonomy_edges live
      on live.from_tag_id = stage.from_tag_id
     and live.to_tag_id = stage.to_tag_id
     and live.edge_kind = stage.edge_kind
    where live.id is null
       or live.is_primary is distinct from stage.is_primary
       or live.status is distinct from stage.status
  ) then
    raise exception '0056 rejected: not every catalog edge exists with compatible structure';
  end if;

  if exists (
    select 1
    from _math_taxonomy_v2_aliases stage
    left join public.taxonomy_aliases live
      on live.normalized_alias = stage.normalized_alias
     and live.tag_id = stage.tag_id
    where live.id is null
       or live.status is distinct from stage.status
  ) then
    raise exception '0056 rejected: not every catalog alias exists with compatible status';
  end if;

  if exists (
    select 1
    from public.taxonomy_nodes node
    join _math_taxonomy_v2_nodes stage using (tag_id)
    where node.is_assignable is distinct from (
      node.node_kind = 'tag'
      and node.status = 'active'
      and not exists (
        select 1
        from public.taxonomy_edges edge
        where edge.from_tag_id = node.tag_id
          and edge.edge_kind = 'parent_child'
          and edge.status = 'active'
      )
    )
  ) then
    raise exception '0056 rejected: catalog assignability does not match the active leaf graph';
  end if;

  if exists (
    select 1
    from public.taxonomy_nodes node
    join _math_taxonomy_v2_nodes stage using (tag_id)
    where node.node_kind <> 'subject'
      and node.status = 'active'
      and not exists (
        select 1
        from public.taxonomy_edges edge
        where edge.to_tag_id = node.tag_id
          and edge.edge_kind = 'parent_child'
          and edge.is_primary
          and edge.status = 'active'
      )
  ) then
    raise exception '0056 rejected: an active catalog node has no active primary parent';
  end if;

  if exists (
    select edge.to_tag_id
    from public.taxonomy_edges edge
    join _math_taxonomy_v2_nodes stage on stage.tag_id = edge.to_tag_id
    where edge.edge_kind = 'parent_child'
      and edge.is_primary
      and edge.status = 'active'
    group by edge.to_tag_id
    having count(*) > 1
  ) then
    raise exception '0056 rejected: a catalog node has multiple active primary parents';
  end if;

  if exists (
    select 1
    from _math_taxonomy_v2_edges stage
    where stage.edge_kind = 'parent_child'
      and stage.status = 'active'
      and not exists (
        select 1
        from public.taxonomy_node_closure closure
        where closure.ancestor_tag_id = stage.from_tag_id
          and closure.descendant_tag_id = stage.to_tag_id
          and closure.depth = 1
      )
  ) then
    raise exception '0056 rejected: closure is missing an active catalog parent-child edge';
  end if;

  if exists (
    select 1
    from _math_taxonomy_v2_nodes stage
    join public.taxonomy_nodes node using (tag_id)
    where node.status = 'active'
      and not exists (
        select 1
        from public.taxonomy_node_closure closure
        where closure.ancestor_tag_id = node.tag_id
          and closure.descendant_tag_id = node.tag_id
          and closure.depth = 0
      )
  ) then
    raise exception '0056 rejected: closure is missing an active catalog node self-row';
  end if;
end;
$$;

commit;
