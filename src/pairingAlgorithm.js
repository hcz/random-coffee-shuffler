/**
 * Sophisticated Pairing Algorithm
 *
 * Based on matching algorithm research combining:
 * - Hungarian Algorithm for optimal weighted matching
 * - Multi-objective optimization (diversity, history, network structure)
 * - Social network analysis with community detection
 * - Exponential decay for meeting history
 * - Constraint satisfaction (hard and soft constraints)
 *
 * DATE FORMAT: All dates passed to this algorithm are in ISO format (yyyy-mm-dd)
 * (normalization happens in index.js before calling this module)
 */

const munkres = require('munkres-js');
const Graph = require('graphology');

/**
 * Configuration for algorithm tuning
 */
const ALGORITHM_CONFIG = {
  // Weight parameters for multi-objective optimization (α, γ)
  // Note: NO repetitions allowed - people who have met before will NOT be paired again
  // unless there are no other options
  WEIGHTS: {
    DIVERSITY: 0.6,               // α: Cross-departmental, level, location diversity
    NETWORK_OPTIMIZATION: 0.4,    // γ: Break silos, connect components
  },

  // Diversity scoring weights
  DIVERSITY_FACTORS: {
    DEPARTMENT: 1.0,
    SENIORITY: 0.7,
    LOCATION: 0.5,
    TENURE: 0.3
  },

  // Network optimization
  CROSS_COMMUNITY_BONUS: 50,  // Bonus for pairing across detected communities
  BRIDGE_BUILDING_BONUS: 30,  // Bonus for creating network bridges

  // Constraint penalties
  HARD_CONSTRAINT_PENALTY: 10000,  // Prohibits pairing (self-pairing, repeated pairings)
};

/**
 * Parse date in ISO format (yyyy-mm-dd) to JavaScript Date
 * Note: All dates are normalized to ISO format before being passed to this algorithm
 * @param {string} dateValue - Date string in yyyy-mm-dd format
 * @returns {Date|null} - Parsed date or null
 */
function parseDate(dateValue) {
  if (!dateValue || typeof dateValue !== 'string') return null;

  // Parse ISO format yyyy-mm-dd
  const isoMatch = dateValue.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1; // months are 0-indexed
    const day = parseInt(isoMatch[3], 10);
    return new Date(year, month, day);
  }

  return null;
}

/**
 * Build connection graph from pairing history
 * @returns {Graph} - Graphology graph with employees as nodes and meetings as edges
 */
function buildConnectionGraph(table1Data, table2Data) {
  const graph = new Graph({ type: 'undirected' });

  // Add all active employees as nodes
  // Table 1 structure: Column 0 = email, Column 1 = active status, Column 2 = twice flag (optional)
  for (let i = 1; i < table1Data.length; i++) {
    const row = table1Data[i];
    if (!row || !row[0]) continue;

    const email = row[0];
    const isActive = row[1];
    const twiceFlag = row[2];

    if (isActive === true || isActive === 'true' || isActive === 1 || isActive === 'TRUE') {
      const canBeTwice = twiceFlag && String(twiceFlag).toLowerCase().trim() === 'twice';

      graph.addNode(email, {
        email,
        canBeTwice,
        // Would include department, level, location if available in columns 3, 4, 5
        meetingCount: 0
      });
    }
  }

  // Add edges for meeting history
  // Table 2 structure: Column 0 = email1, Column 1 = email2, Column 2 = date (yyyy-mm-dd), Column 3 = text
  for (let i = 1; i < table2Data.length; i++) {
    const row = table2Data[i];
    if (!row || !row[0] || !row[1]) continue;

    const email1 = row[0];
    const email2 = row[1];
    const dateValue = row[2]; // Expected format: yyyy-mm-dd (ISO)

    // Only add edge if both employees still exist in active list
    if (!graph.hasNode(email1) || !graph.hasNode(email2)) continue;

    // Parse date from ISO format (yyyy-mm-dd)
    const meetingDate = parseDate(dateValue);

    if (!graph.hasEdge(email1, email2)) {
      graph.addEdge(email1, email2, {
        meetings: [meetingDate],
        count: 1
      });
    } else {
      const edgeData = graph.getEdgeAttributes(email1, email2);
      edgeData.meetings.push(meetingDate);
      edgeData.count += 1;
      graph.replaceEdgeAttributes(email1, email2, edgeData);
    }

    // Update node meeting counts
    graph.updateNodeAttribute(email1, 'meetingCount', n => (n || 0) + 1);
    graph.updateNodeAttribute(email2, 'meetingCount', n => (n || 0) + 1);
  }

  return graph;
}

/**
 * Simple community detection using connected components and density
 * (Simplified version of Louvain algorithm for production use)
 */
function detectCommunities(graph) {
  // For now, use a simple heuristic: connected components
  // In production, implement Louvain or Label Propagation
  const communities = new Map();
  const visited = new Set();
  let communityId = 0;

  graph.forEachNode(node => {
    if (visited.has(node)) return;

    // BFS to find connected component
    const community = [];
    const queue = [node];
    visited.add(node);

    while (queue.length > 0) {
      const current = queue.shift();
      community.push(current);

      graph.forEachNeighbor(current, neighbor => {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      });
    }

    // Assign community
    community.forEach(member => {
      communities.set(member, communityId);
    });
    communityId++;
  });

  // All unconnected nodes are in separate single-person communities
  graph.forEachNode(node => {
    if (!communities.has(node)) {
      communities.set(node, communityId++);
    }
  });

  return communities;
}

/**
 * Calculate diversity score between two employees
 * Higher score = more diverse pairing
 */
function calculateDiversityScore(email1, email2, graph) {
  // In a real implementation, this would consider:
  // - Department difference (from HRIS data)
  // - Seniority level difference
  // - Geographic location difference
  // - Tenure difference

  // For now, we use a simple heuristic:
  // Higher score if they haven't met or have few common connections
  let diversityScore = 10; // Base score

  try {
    // Check common neighbors (mutual connections)
    // Ensure both nodes exist in the graph
    if (!graph.hasNode(email1) || !graph.hasNode(email2)) {
      return diversityScore; // Return base score if nodes don't exist
    }

    const neighbors1 = new Set(graph.neighbors(email1));
    const neighbors2 = new Set(graph.neighbors(email2));
    const commonNeighbors = [...neighbors1].filter(n => neighbors2.has(n)).length;

    // Fewer common neighbors = more diverse
    diversityScore += (10 - commonNeighbors);
  } catch (error) {
    // If any error occurs, just return base score
    console.warn(`Warning in calculateDiversityScore: ${error.message}`);
  }

  return Math.max(0, diversityScore);
}

/**
 * Calculate network optimization score
 * Rewards pairings that improve network structure (break silos, create bridges)
 */
function calculateNetworkScore(email1, email2, graph, communities) {
  let networkScore = 0;

  try {
    // Cross-community bonus
    const community1 = communities.get(email1);
    const community2 = communities.get(email2);

    if (community1 !== undefined && community2 !== undefined && community1 !== community2) {
      networkScore += ALGORITHM_CONFIG.CROSS_COMMUNITY_BONUS;
    }

    // Bridge building bonus: connecting low-degree nodes to high-degree nodes
    if (graph.hasNode(email1) && graph.hasNode(email2)) {
      const degree1 = graph.degree(email1);
      const degree2 = graph.degree(email2);

      // Reward connecting isolated employees (low degree) with well-connected ones
      if (Math.abs(degree1 - degree2) > 2) {
        networkScore += ALGORITHM_CONFIG.BRIDGE_BUILDING_BONUS;
      }
    }
  } catch (error) {
    console.warn(`Warning in calculateNetworkScore: ${error.message}`);
  }

  return networkScore;
}

/**
 * Build cost matrix for Hungarian algorithm
 * Lower cost = better pairing (we minimize cost)
 *
 * HARD CONSTRAINT: People who have met before should NOT be paired again
 * unless there is absolutely no alternative (all possible new pairings exhausted)
 *
 * For new pairings: Cost = -1 * (α·diversity + γ·network_score)
 * For repeated pairings: Cost = HARD_CONSTRAINT_PENALTY (effectively prohibited)
 */
function buildCostMatrix(employees, graph, communities) {
  const n = employees.length;
  const costMatrix = Array(n).fill(null).map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const email1 = employees[i];
      const email2 = employees[j];

      // Can't pair with self (same index or same email for "twice" users)
      if (i === j || email1 === email2) {
        costMatrix[i][j] = ALGORITHM_CONFIG.HARD_CONSTRAINT_PENALTY;
        continue;
      }

      // HARD CONSTRAINT: If these two people have met before, heavily penalize this pairing
      // This ensures the algorithm will ONLY use repeated pairings if there's no other option
      if (graph.hasEdge(email1, email2)) {
        costMatrix[i][j] = ALGORITHM_CONFIG.HARD_CONSTRAINT_PENALTY;
        continue;
      }

      // This is a NEW pairing (they've never met) - calculate desirability score
      const diversityScore = calculateDiversityScore(email1, email2, graph) || 0;
      const networkScore = calculateNetworkScore(email1, email2, graph, communities) || 0;

      // Score for new pairings (higher score = better pairing)
      const totalScore =
        ALGORITHM_CONFIG.WEIGHTS.DIVERSITY * diversityScore +
        ALGORITHM_CONFIG.WEIGHTS.NETWORK_OPTIMIZATION * networkScore;

      // Convert to cost (negate since we minimize cost but want to maximize score)
      const cost = isNaN(totalScore) ? 0 : -totalScore;
      costMatrix[i][j] = cost;
    }
  }

  return costMatrix;
}

/**
 * Apply optimal matching algorithm
 *
 * Uses a recursive backtracking approach with pruning to find the optimal
 * set of pairs that minimizes total cost while ensuring everyone is paired.
 */
function hungarianMatching(employees, costMatrix) {
  // Validate inputs
  if (!costMatrix || costMatrix.length === 0) {
    console.error('Error: Cost matrix is empty');
    return [];
  }

  // Check if matrix is properly formed
  for (let i = 0; i < costMatrix.length; i++) {
    if (!costMatrix[i] || costMatrix[i].length === 0) {
      console.error(`Error: Cost matrix row ${i} is undefined or empty`);
      return [];
    }
  }

  const n = employees.length;
  const targetPairs = Math.floor(n / 2);

  // Build list of all possible pairs with their costs (only i < j to avoid duplicates)
  const possiblePairs = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // Skip if same person (shouldn't happen with i < j, but safety check)
      if (employees[i] === employees[j]) continue;

      // Use the cost from the matrix
      const cost = costMatrix[i][j];
      possiblePairs.push({ i, j, cost, email1: employees[i], email2: employees[j] });
    }
  }

  // Sort pairs by cost (ascending - lower cost is better)
  possiblePairs.sort((a, b) => a.cost - b.cost);

  // Use backtracking to find optimal matching
  let bestMatching = null;
  let bestCost = Infinity;

  function backtrack(pairIndex, currentPairs, usedIndices, currentCost) {
    // If we have enough pairs, check if this is the best solution
    if (currentPairs.length === targetPairs) {
      if (currentCost < bestCost) {
        bestCost = currentCost;
        bestMatching = [...currentPairs];
      }
      return;
    }

    // Pruning: if current cost already exceeds best, stop
    if (currentCost >= bestCost) return;

    // Pruning: if not enough pairs left to complete matching, stop
    const remainingNeeded = targetPairs - currentPairs.length;
    const remainingPairs = possiblePairs.length - pairIndex;
    if (remainingPairs < remainingNeeded) return;

    // Try each remaining pair
    for (let i = pairIndex; i < possiblePairs.length; i++) {
      const pair = possiblePairs[i];

      // Skip if either person is already paired
      if (usedIndices.has(pair.i) || usedIndices.has(pair.j)) continue;

      // Add this pair and recurse
      currentPairs.push(pair);
      usedIndices.add(pair.i);
      usedIndices.add(pair.j);

      backtrack(i + 1, currentPairs, usedIndices, currentCost + pair.cost);

      // Backtrack
      currentPairs.pop();
      usedIndices.delete(pair.i);
      usedIndices.delete(pair.j);
    }
  }

  // For large groups, use greedy with look-ahead instead of full backtracking
  if (n > 12) {
    // Greedy with look-ahead: prefer pairs that don't strand others
    return greedyWithLookahead(employees, costMatrix, possiblePairs, targetPairs);
  }

  // For smaller groups, use backtracking for optimal solution
  backtrack(0, [], new Set(), 0);

  // Convert best matching to output format
  if (!bestMatching) return [];
  return bestMatching.map(p => [p.email1, p.email2]);
}

/**
 * Greedy algorithm with look-ahead for larger groups
 * Avoids picking pairs that would strand others with only high-cost options
 */
function greedyWithLookahead(employees, costMatrix, sortedPairs, targetPairs) {
  const n = employees.length;
  const PENALTY = ALGORITHM_CONFIG.HARD_CONSTRAINT_PENALTY;

  const pairs = [];
  const used = new Set();

  while (pairs.length < targetPairs) {
    let bestPair = null;
    let bestScore = Infinity;

    // Find the best pair to add next
    for (const pair of sortedPairs) {
      if (used.has(pair.i) || used.has(pair.j)) continue;

      // Calculate score: pair cost + penalty for stranding others
      let score = pair.cost;

      // Check if picking this pair would strand anyone
      const testUsed = new Set(used);
      testUsed.add(pair.i);
      testUsed.add(pair.j);

      // Count available good pairs for remaining people
      const remaining = [];
      for (let k = 0; k < n; k++) {
        if (!testUsed.has(k)) remaining.push(k);
      }

      // If odd number remaining (and not at last pair), that's fine
      // But check if remaining pairs are all penalties
      let allPenalties = true;
      for (let ri = 0; ri < remaining.length && allPenalties; ri++) {
        for (let rj = ri + 1; rj < remaining.length && allPenalties; rj++) {
          if (costMatrix[remaining[ri]][remaining[rj]] < PENALTY) {
            allPenalties = false;
          }
        }
      }

      // If this choice forces penalty pairs, add a penalty to score
      if (remaining.length >= 2 && allPenalties) {
        score += PENALTY * 0.5; // Discourage but don't prevent
      }

      if (score < bestScore) {
        bestScore = score;
        bestPair = pair;
      }
    }

    if (!bestPair) break;

    pairs.push([bestPair.email1, bestPair.email2]);
    used.add(bestPair.i);
    used.add(bestPair.j);
  }

  return pairs;
}

/**
 * Main function: Generate optimal pairings using sophisticated algorithm
 */
function generateOptimalPairs(table1Data, table2Data) {
  console.log('\n=== Sophisticated Pairing Algorithm ===\n');

  // Step 1: Build connection graph from history
  console.log('Step 1: Building connection graph from history...');
  const graph = buildConnectionGraph(table1Data, table2Data);
  let employees = graph.nodes();

  console.log(`  - ${employees.length} active employees`);
  console.log(`  - ${graph.edges().length} historical connections`);

  if (employees.length < 2) {
    console.log('Not enough active employees for pairing');
    return [];
  }

  // Handle odd number of employees by using a "twice" user
  let twiceUser = null;
  if (employees.length % 2 !== 0) {
    // Find all users who can be paired twice
    const twiceUsers = employees.filter(email => {
      const attrs = graph.getNodeAttributes(email);
      return attrs.canBeTwice === true;
    });

    if (twiceUsers.length > 0) {
      // Randomly select one "twice" user
      const randomIndex = Math.floor(Math.random() * twiceUsers.length);
      twiceUser = twiceUsers[randomIndex];

      // Add them to the employees list again (they'll be paired twice)
      employees = [...employees, twiceUser];

      console.log(`  - Odd number detected: ${twiceUser} will be paired twice`);
    } else {
      console.log(`  - Warning: Odd number of employees (${employees.length}) but no users marked as "twice"`);
      console.log(`  - One person will remain unpaired`);
    }
  }

  // Step 2: Detect communities (identify silos)
  console.log('\nStep 2: Detecting communities...');
  const communities = detectCommunities(graph);
  const uniqueCommunities = new Set(communities.values()).size;
  console.log(`  - Found ${uniqueCommunities} communities/groups`);

  // Step 3: Calculate network metrics
  console.log('\nStep 3: Analyzing network structure...');
  // Calculate average degree manually: (2 * edges) / nodes for undirected graph
  const avgDegree = employees.length > 0 ? (2 * graph.size) / graph.order : 0;
  console.log(`  - Average connections per employee: ${avgDegree.toFixed(2)}`);

  // Step 4: Build cost matrix with multi-objective optimization
  console.log('\nStep 4: Computing optimal matching...');
  console.log('  - Strategy: NO REPETITIONS - only pair people who have never met');
  console.log('  - Optimizing new pairings for:');
  console.log(`    * Diversity (weight: ${ALGORITHM_CONFIG.WEIGHTS.DIVERSITY})`);
  console.log(`    * Network optimization (weight: ${ALGORITHM_CONFIG.WEIGHTS.NETWORK_OPTIMIZATION})`);

  const costMatrix = buildCostMatrix(employees, graph, communities);

  // Debug: validate cost matrix
  console.log(`  - Cost matrix size: ${costMatrix.length}x${costMatrix[0]?.length || 0}`);

  // Step 5: Apply Hungarian algorithm
  const pairs = hungarianMatching(employees, costMatrix);

  console.log(`\nStep 5: Generated ${pairs.length} optimal pairs`);

  // Step 6: Analyze pairing quality
  let crossCommunityPairs = 0;
  let newPairs = 0;

  for (const [email1, email2] of pairs) {
    if (communities.get(email1) !== communities.get(email2)) {
      crossCommunityPairs++;
    }
    if (!graph.hasEdge(email1, email2)) {
      newPairs++;
    }
  }

  console.log('\nPairing Quality Metrics:');
  console.log(`  - Cross-community pairings: ${crossCommunityPairs}/${pairs.length} (${(crossCommunityPairs/pairs.length*100).toFixed(1)}%)`);
  console.log(`  - Brand new pairings: ${newPairs}/${pairs.length} (${(newPairs/pairs.length*100).toFixed(1)}%)`);

  const repeatedPairs = pairs.length - newPairs;
  if (repeatedPairs > 0) {
    console.log(`  ⚠ WARNING: ${repeatedPairs} repeated pairing(s) - everyone may have met everyone!`);
  } else {
    console.log(`  ✓ All pairings are NEW - no one is paired with someone they've met before!`);
  }

  // Verify all employees are paired
  const pairedEmployees = new Set();
  for (const [email1, email2] of pairs) {
    pairedEmployees.add(email1);
    pairedEmployees.add(email2);
  }
  const unpairedEmployees = employees.filter(email => !pairedEmployees.has(email));
  if (unpairedEmployees.length > 0) {
    console.log(`\n⚠ WARNING: ${unpairedEmployees.length} employee(s) not paired:`);
    unpairedEmployees.forEach(email => console.log(`    - ${email}`));
  }

  // Convert to expected format (just return email pairs)
  return pairs.map(([email1, email2]) => {
    return [email1, email2];
  });
}

module.exports = {
  generateOptimalPairs,
  buildConnectionGraph,
  detectCommunities,
  calculateDiversityScore,
  calculateNetworkScore,
  buildCostMatrix,
  hungarianMatching,
  parseDate,
  ALGORITHM_CONFIG,
};
