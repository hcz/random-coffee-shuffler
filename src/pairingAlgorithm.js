/**
 * Pairing Algorithm
 *
 * Builds a graph of past meetings and finds the lowest-cost set of pairs, where:
 * - people who have already met are paired again only if no all-new matching exists
 * - new pairings are scored by diversity (few mutual connections) and network
 *   impact (connecting separate communities, linking isolated people to hubs)
 *
 * Small groups are matched by exhaustive backtracking, larger groups by a greedy
 * heuristic with look-ahead.
 */

const Graph = require('graphology');

/**
 * Configuration for algorithm tuning
 */
const ALGORITHM_CONFIG = {
  // Relative weights of the scoring objectives for new pairings
  WEIGHTS: {
    DIVERSITY: 0.6,               // Few mutual connections
    NETWORK_OPTIMIZATION: 0.4,    // Break silos, connect components
  },

  // Diversity score = BASE_DIVERSITY_SCORE + MAX_MUTUAL_CONNECTIONS_BONUS - mutual connections
  BASE_DIVERSITY_SCORE: 10,
  MAX_MUTUAL_CONNECTIONS_BONUS: 10,

  // Network optimization
  CROSS_COMMUNITY_BONUS: 50,      // Bonus for pairing across detected communities
  BRIDGE_BUILDING_BONUS: 30,      // Bonus for pairing a well-connected with a poorly connected person
  BRIDGE_MIN_DEGREE_GAP: 3,       // Connection count difference that qualifies as a bridge

  // Cost of a prohibited pairing (self-pairing, repeated pairing)
  HARD_CONSTRAINT_PENALTY: 10000,

  // Largest group matched by exhaustive backtracking; larger groups use the greedy heuristic
  MAX_GROUP_SIZE_FOR_BACKTRACKING: 12,
};

const ACTIVE_STATUS_VALUES = new Set([true, 1, 'true', 'TRUE']);

/**
 * Build connection graph from pairing history
 * @param {Array} employeeRows - Employees sheet rows: email | active status | "twice" flag (optional)
 * @param {Array} historyRows - History sheet rows: email1 | email2 | date | round label
 * @returns {Graph} - Graphology graph with active employees as nodes and an edge for each pair who have met
 */
function buildConnectionGraph(employeeRows, historyRows) {
  const graph = new Graph({ type: 'undirected' });

  for (const row of employeeRows.slice(1)) {
    const [email, activeStatus, twiceFlag] = row ?? [];
    if (!email || !ACTIVE_STATUS_VALUES.has(activeStatus)) continue;

    const canBeTwice = String(twiceFlag ?? '').trim().toLowerCase() === 'twice';
    graph.addNode(email, { canBeTwice });
  }

  for (const row of historyRows.slice(1)) {
    const [email1, email2] = row ?? [];
    // Ignore meetings with people who are no longer active
    if (graph.hasNode(email1) && graph.hasNode(email2)) {
      graph.mergeEdge(email1, email2);
    }
  }

  return graph;
}

/**
 * Detect communities as connected components of the meeting graph
 * @returns {Map<string, number>} - Community id for each employee
 */
function detectCommunities(graph) {
  const communities = new Map();
  let communityId = 0;

  graph.forEachNode(startNode => {
    if (communities.has(startNode)) return;

    // Breadth-first search assigns the whole component to the same community
    const queue = [startNode];
    communities.set(startNode, communityId);

    while (queue.length > 0) {
      graph.forEachNeighbor(queue.shift(), neighbor => {
        if (!communities.has(neighbor)) {
          communities.set(neighbor, communityId);
          queue.push(neighbor);
        }
      });
    }

    communityId++;
  });

  return communities;
}

/**
 * Calculate diversity score between two employees
 * Higher score = more diverse pairing (fewer mutual connections)
 */
function calculateDiversityScore(email1, email2, graph) {
  const { BASE_DIVERSITY_SCORE, MAX_MUTUAL_CONNECTIONS_BONUS } = ALGORITHM_CONFIG;

  if (!graph.hasNode(email1) || !graph.hasNode(email2)) {
    return BASE_DIVERSITY_SCORE;
  }

  const neighbors2 = new Set(graph.neighbors(email2));
  const mutualConnectionCount = graph.neighbors(email1).filter(neighbor => neighbors2.has(neighbor)).length;

  return Math.max(0, BASE_DIVERSITY_SCORE + MAX_MUTUAL_CONNECTIONS_BONUS - mutualConnectionCount);
}

/**
 * Calculate network optimization score
 * Rewards pairings that improve network structure (break silos, create bridges)
 */
function calculateNetworkScore(email1, email2, graph, communities) {
  let networkScore = 0;

  const community1 = communities.get(email1);
  const community2 = communities.get(email2);
  if (community1 !== undefined && community2 !== undefined && community1 !== community2) {
    networkScore += ALGORITHM_CONFIG.CROSS_COMMUNITY_BONUS;
  }

  if (graph.hasNode(email1) && graph.hasNode(email2)) {
    const degreeGap = Math.abs(graph.degree(email1) - graph.degree(email2));
    if (degreeGap >= ALGORITHM_CONFIG.BRIDGE_MIN_DEGREE_GAP) {
      networkScore += ALGORITHM_CONFIG.BRIDGE_BUILDING_BONUS;
    }
  }

  return networkScore;
}

/**
 * Calculate the cost of pairing two employees (lower cost = better pairing)
 *
 * New pairings: -(diversity weight · diversity score + network weight · network score)
 * Self-pairing or people who have met before: HARD_CONSTRAINT_PENALTY
 */
function calculatePairCost(email1, email2, graph, communities) {
  // The same email appears twice in the list when a "twice" employee is added
  if (email1 === email2 || graph.hasEdge(email1, email2)) {
    return ALGORITHM_CONFIG.HARD_CONSTRAINT_PENALTY;
  }

  const { WEIGHTS } = ALGORITHM_CONFIG;
  const score =
    WEIGHTS.DIVERSITY * calculateDiversityScore(email1, email2, graph) +
    WEIGHTS.NETWORK_OPTIMIZATION * calculateNetworkScore(email1, email2, graph, communities);

  // Matching minimizes cost, so negate the score
  return -score;
}

/**
 * Build cost matrix where costMatrix[i][j] is the cost of pairing employees[i] with employees[j]
 */
function buildCostMatrix(employees, graph, communities) {
  return employees.map(email1 =>
    employees.map(email2 => calculatePairCost(email1, email2, graph, communities))
  );
}

/**
 * Find the set of pairs with the lowest total cost, pairing as many employees as possible
 * @returns {Array<[string, string]>} - Pairs of emails
 */
function findMinimumCostMatching(employees, costMatrix) {
  if (!costMatrix?.length || costMatrix.some(row => !row?.length)) {
    console.error('Error: Cost matrix is empty or malformed');
    return [];
  }

  const candidatePairs = listCandidatePairsByCost(employees, costMatrix);
  const pairCount = Math.floor(employees.length / 2);

  const matching = employees.length > ALGORITHM_CONFIG.MAX_GROUP_SIZE_FOR_BACKTRACKING
    ? findMatchingGreedily(candidatePairs, costMatrix, pairCount)
    : findMatchingByBacktracking(candidatePairs, pairCount);

  return matching.map(pair => [pair.email1, pair.email2]);
}

/**
 * List every pair of distinct employees, cheapest first
 */
function listCandidatePairsByCost(employees, costMatrix) {
  const candidatePairs = [];

  for (let i = 0; i < employees.length; i++) {
    for (let j = i + 1; j < employees.length; j++) {
      // A "twice" employee appears twice in the list and must not be paired with themselves
      if (employees[i] === employees[j]) continue;

      candidatePairs.push({ i, j, cost: costMatrix[i][j], email1: employees[i], email2: employees[j] });
    }
  }

  return candidatePairs.sort((a, b) => a.cost - b.cost);
}

/**
 * Search pair combinations recursively with pruning for the lowest-cost complete matching
 */
function findMatchingByBacktracking(candidatePairs, pairCount) {
  let bestMatching = [];
  let bestCost = Infinity;
  const currentMatching = [];
  const pairedIndices = new Set();

  function search(startIndex, currentCost) {
    if (currentMatching.length === pairCount) {
      if (currentCost < bestCost) {
        bestCost = currentCost;
        bestMatching = [...currentMatching];
      }
      return;
    }

    if (currentCost >= bestCost) return;

    const pairsStillNeeded = pairCount - currentMatching.length;
    if (candidatePairs.length - startIndex < pairsStillNeeded) return;

    for (let k = startIndex; k < candidatePairs.length; k++) {
      const pair = candidatePairs[k];
      if (pairedIndices.has(pair.i) || pairedIndices.has(pair.j)) continue;

      currentMatching.push(pair);
      pairedIndices.add(pair.i).add(pair.j);

      search(k + 1, currentCost + pair.cost);

      currentMatching.pop();
      pairedIndices.delete(pair.i);
      pairedIndices.delete(pair.j);
    }
  }

  search(0, 0);
  return bestMatching;
}

/**
 * Pick the cheapest available pair repeatedly, avoiding choices that would
 * leave the remaining employees with only prohibited pairings
 */
function findMatchingGreedily(candidatePairs, costMatrix, pairCount) {
  const allIndices = costMatrix.map((_, index) => index);
  const matching = [];
  const pairedIndices = new Set();

  while (matching.length < pairCount) {
    let bestPair = null;
    let bestScore = Infinity;

    for (const pair of candidatePairs) {
      if (pairedIndices.has(pair.i) || pairedIndices.has(pair.j)) continue;

      const remainingIndices = allIndices.filter(
        index => !pairedIndices.has(index) && index !== pair.i && index !== pair.j
      );
      // Discourage, but don't prevent, choices that strand the remaining employees
      const strandingPenalty = hasOnlyProhibitedPairs(remainingIndices, costMatrix)
        ? ALGORITHM_CONFIG.HARD_CONSTRAINT_PENALTY * 0.5
        : 0;
      const score = pair.cost + strandingPenalty;

      if (score < bestScore) {
        bestScore = score;
        bestPair = pair;
      }
    }

    if (!bestPair) break;

    matching.push(bestPair);
    pairedIndices.add(bestPair.i).add(bestPair.j);
  }

  return matching;
}

function hasOnlyProhibitedPairs(indices, costMatrix) {
  if (indices.length < 2) return false;

  for (let a = 0; a < indices.length; a++) {
    for (let b = a + 1; b < indices.length; b++) {
      if (costMatrix[indices[a]][indices[b]] < ALGORITHM_CONFIG.HARD_CONSTRAINT_PENALTY) {
        return false;
      }
    }
  }
  return true;
}

/**
 * For an odd number of employees, add a random employee marked "twice" so they
 * are paired twice and nobody is left out
 * @returns {string[]} - Employees to pair, possibly with one email listed twice
 */
function addTwiceEmployeeIfOdd(employees, graph) {
  if (employees.length % 2 === 0) return employees;

  const twiceEmployees = employees.filter(email => graph.getNodeAttribute(email, 'canBeTwice'));
  if (twiceEmployees.length === 0) {
    console.log(`  - Warning: Odd number of employees (${employees.length}) but no users marked as "twice"`);
    console.log('  - One person will remain unpaired');
    return employees;
  }

  const twiceEmployee = twiceEmployees[Math.floor(Math.random() * twiceEmployees.length)];
  console.log(`  - Odd number detected: ${twiceEmployee} will be paired twice`);
  return [...employees, twiceEmployee];
}

function logPairingQuality(pairs, employees, graph, communities) {
  const crossCommunityCount = pairs.filter(([email1, email2]) => communities.get(email1) !== communities.get(email2)).length;
  const newPairCount = pairs.filter(([email1, email2]) => !graph.hasEdge(email1, email2)).length;
  const repeatedPairCount = pairs.length - newPairCount;
  const percentOfPairs = count => ((count / pairs.length) * 100).toFixed(1);

  console.log('\nPairing Quality Metrics:');
  console.log(`  - Cross-community pairings: ${crossCommunityCount}/${pairs.length} (${percentOfPairs(crossCommunityCount)}%)`);
  console.log(`  - Brand new pairings: ${newPairCount}/${pairs.length} (${percentOfPairs(newPairCount)}%)`);

  if (repeatedPairCount > 0) {
    console.log(`  ⚠ WARNING: ${repeatedPairCount} repeated pairing(s) - everyone may have met everyone!`);
  } else {
    console.log(`  ✓ All pairings are NEW - no one is paired with someone they've met before!`);
  }

  const pairedEmails = new Set(pairs.flat());
  const unpairedEmployees = employees.filter(email => !pairedEmails.has(email));
  if (unpairedEmployees.length > 0) {
    console.log(`\n⚠ WARNING: ${unpairedEmployees.length} employee(s) not paired:`);
    unpairedEmployees.forEach(email => console.log(`    - ${email}`));
  }
}

/**
 * Generate this round's pairs from the Employees and History sheets
 * @param {Array} employeeRows - Employees sheet rows, including the header
 * @param {Array} historyRows - History sheet rows, including the header
 * @returns {Array<[string, string]>} - Pairs of emails
 */
function generatePairs(employeeRows, historyRows) {
  console.log('\n=== Sophisticated Pairing Algorithm ===\n');

  console.log('Step 1: Building connection graph from history...');
  const graph = buildConnectionGraph(employeeRows, historyRows);
  console.log(`  - ${graph.order} active employees`);
  console.log(`  - ${graph.size} historical connections`);

  if (graph.order < 2) {
    console.log('Not enough active employees for pairing');
    return [];
  }

  const employees = addTwiceEmployeeIfOdd(graph.nodes(), graph);

  console.log('\nStep 2: Detecting communities...');
  const communities = detectCommunities(graph);
  console.log(`  - Found ${new Set(communities.values()).size} communities/groups`);

  console.log('\nStep 3: Analyzing network structure...');
  const averageDegree = (2 * graph.size) / graph.order;
  console.log(`  - Average connections per employee: ${averageDegree.toFixed(2)}`);

  console.log('\nStep 4: Computing optimal matching...');
  console.log('  - Strategy: NO REPETITIONS - only pair people who have never met');
  console.log('  - Optimizing new pairings for:');
  console.log(`    * Diversity (weight: ${ALGORITHM_CONFIG.WEIGHTS.DIVERSITY})`);
  console.log(`    * Network optimization (weight: ${ALGORITHM_CONFIG.WEIGHTS.NETWORK_OPTIMIZATION})`);
  const costMatrix = buildCostMatrix(employees, graph, communities);

  const pairs = findMinimumCostMatching(employees, costMatrix);
  console.log(`\nStep 5: Generated ${pairs.length} optimal pairs`);

  logPairingQuality(pairs, employees, graph, communities);

  return pairs;
}

module.exports = {
  generatePairs,
  buildConnectionGraph,
  detectCommunities,
  calculateDiversityScore,
  calculateNetworkScore,
  buildCostMatrix,
  findMinimumCostMatching,
  ALGORITHM_CONFIG,
};
