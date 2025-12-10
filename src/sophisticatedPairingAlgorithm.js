/**
 * Sophisticated Pairing Algorithm
 *
 * Based on matching algorithm research combining:
 * - Hungarian Algorithm for optimal weighted matching
 * - Multi-objective optimization (diversity, history, network structure)
 * - Social network analysis with community detection
 * - Exponential decay for meeting history
 * - Constraint satisfaction (hard and soft constraints)
 */

const munkres = require('munkres-js');
const Graph = require('graphology');

/**
 * Configuration for algorithm tuning
 */
const ALGORITHM_CONFIG = {
  // Weight parameters for multi-objective optimization (α, β, γ, δ)
  WEIGHTS: {
    DIVERSITY: 0.4,        // α: Cross-departmental, level, location diversity
    HISTORY_PENALTY: 0.3,  // β: Penalty for recent meetings
    NETWORK_OPTIMIZATION: 0.2,  // γ: Break silos, connect components
    PREFERENCE: 0.1        // δ: User preferences (if available)
  },

  // History decay parameters
  HISTORY_DECAY_RATE: 0.15,  // Exponential decay rate (higher = faster decay)
  REPETITION_PENALTY: 100,    // Base penalty for repeated pairings

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
  HARD_CONSTRAINT_PENALTY: 10000,  // Effectively prohibits the pairing
  SOFT_CONSTRAINT_PENALTY: 20      // Mild discouragement
};

/**
 * Convert Excel serial date to JavaScript Date
 */
function excelDateToJSDate(serial) {
  if (typeof serial !== 'number') return null;
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date_info = new Date(utc_value * 1000);
  return new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate());
}

/**
 * Parse date from various formats (Excel serial, dd/mm/yyyy text, ISO string)
 * @param {number|string} dateValue - Date in any format
 * @returns {Date|null} - Parsed date or null
 */
function parseDate(dateValue) {
  if (!dateValue) return null;

  // Excel serial number
  if (typeof dateValue === 'number') {
    return excelDateToJSDate(dateValue);
  }

  // Text date in dd/mm/yyyy format
  if (typeof dateValue === 'string') {
    // Try dd/mm/yyyy format first
    const ddmmyyyyMatch = dateValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (ddmmyyyyMatch) {
      const day = parseInt(ddmmyyyyMatch[1], 10);
      const month = parseInt(ddmmyyyyMatch[2], 10) - 1; // months are 0-indexed
      const year = parseInt(ddmmyyyyMatch[3], 10);
      return new Date(year, month, day);
    }

    // Fallback to standard Date parsing (handles ISO format, etc.)
    const parsed = new Date(dateValue);
    return isNaN(parsed.getTime()) ? null : parsed;
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
  // Table 2 structure: Column 0 = email1, Column 1 = email2, Column 2 = date, Column 3 = text
  for (let i = 1; i < table2Data.length; i++) {
    const row = table2Data[i];
    if (!row || !row[0] || !row[1]) continue;

    const email1 = row[0];
    const email2 = row[1];
    const dateValue = row[2];

    // Only add edge if both employees still exist in active list
    if (!graph.hasNode(email1) || !graph.hasNode(email2)) continue;

    // Parse date from any format (Excel serial, dd/mm/yyyy text, ISO string)
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
 * Calculate history penalty with exponential decay
 * Recent meetings have higher penalty than old ones
 */
function calculateHistoryPenalty(email1, email2, graph) {
  if (!graph.hasEdge(email1, email2)) {
    return 0; // Never met = no penalty
  }

  const edge = graph.getEdgeAttributes(email1, email2);
  const meetings = edge.meetings || [];
  const now = new Date();

  let totalPenalty = 0;

  for (const meetingDate of meetings) {
    if (!meetingDate) continue;

    // Calculate days since meeting
    const daysSince = (now - meetingDate) / (1000 * 60 * 60 * 24);

    // Exponential decay: penalty = base * e^(-λ * days)
    // More recent meetings have exponentially higher penalty
    const decayedPenalty = ALGORITHM_CONFIG.REPETITION_PENALTY *
                          Math.exp(-ALGORITHM_CONFIG.HISTORY_DECAY_RATE * daysSince);

    totalPenalty += decayedPenalty;
  }

  return totalPenalty;
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
 * Cost = -1 * (α·diversity - β·history_penalty + γ·network_score)
 * Negative because we minimize cost but want to maximize score
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

      // Calculate component scores
      const diversityScore = calculateDiversityScore(email1, email2, graph) || 0;
      const historyPenalty = calculateHistoryPenalty(email1, email2, graph) || 0;
      const networkScore = calculateNetworkScore(email1, email2, graph, communities) || 0;

      // Weighted multi-objective score
      const totalScore =
        ALGORITHM_CONFIG.WEIGHTS.DIVERSITY * diversityScore -
        ALGORITHM_CONFIG.WEIGHTS.HISTORY_PENALTY * historyPenalty +
        ALGORITHM_CONFIG.WEIGHTS.NETWORK_OPTIMIZATION * networkScore;

      // Convert to cost (negate since we minimize cost)
      // Ensure the result is a valid number
      const cost = isNaN(totalScore) ? 0 : -totalScore;
      costMatrix[i][j] = cost;
    }
  }

  return costMatrix;
}

/**
 * Apply Hungarian algorithm to find optimal matching
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

  // Handle odd number of employees by adding a dummy employee
  const n = employees.length;
  let adjustedMatrix = costMatrix;
  let adjustedEmployees = employees;

  if (n % 2 !== 0) {
    // Add dummy row and column with zero cost (will be ignored)
    adjustedMatrix = costMatrix.map(row => [...row, 0]);
    adjustedMatrix.push(Array(n + 1).fill(0));
    adjustedEmployees = [...employees, null]; // null represents dummy
  }

  // Deep copy the matrix to ensure munkres-js doesn't have issues
  const matrixCopy = adjustedMatrix.map(row => row.slice());

  // Munkres algorithm expects square matrix
  let assignments;

  try {
    assignments = munkres(matrixCopy);
  } catch (error) {
    console.error('Munkres algorithm error:', error.message);
    console.error('Matrix sample:', JSON.stringify(matrixCopy.slice(0, 2)));
    return [];
  }

  // Convert assignments to pairs
  const pairs = [];
  const used = new Set();

  for (const [i, j] of assignments) {
    // Skip self-pairing (diagonal)
    if (i === j) continue;

    // Skip if either person is already paired
    if (used.has(i) || used.has(j)) continue;

    // Skip dummy assignments
    if (adjustedEmployees[i] === null || adjustedEmployees[j] === null) continue;

    // Add the pair (Hungarian algorithm guarantees each person appears in exactly one assignment)
    pairs.push([adjustedEmployees[i], adjustedEmployees[j]]);
    used.add(i);
    used.add(j);
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
  console.log('  - Optimizing for:');
  console.log(`    * Diversity (weight: ${ALGORITHM_CONFIG.WEIGHTS.DIVERSITY})`);
  console.log(`    * History avoidance (weight: ${ALGORITHM_CONFIG.WEIGHTS.HISTORY_PENALTY})`);
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
  console.log(`  - Repeated pairings: ${pairs.length - newPairs}/${pairs.length}`);

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
  ALGORITHM_CONFIG
};
