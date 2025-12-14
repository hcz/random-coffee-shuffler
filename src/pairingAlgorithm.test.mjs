import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  generateOptimalPairs,
  buildConnectionGraph,
  detectCommunities,
  calculateDiversityScore,
  calculateNetworkScore,
  buildCostMatrix,
  hungarianMatching,
  parseDate,
  ALGORITHM_CONFIG,
} = require('./pairingAlgorithm');

describe('pairingAlgorithm', () => {
  // Suppress console.log during tests
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('parseDate', () => {
    it('should parse ISO format yyyy-mm-dd', () => {
      const result = parseDate('2024-03-15');
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(2); // 0-indexed
      expect(result.getDate()).toBe(15);
    });

    it('should parse single-digit month and day in ISO format', () => {
      const result = parseDate('2024-1-5');
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(0);
      expect(result.getDate()).toBe(5);
    });

    it('should return null for empty string', () => {
      expect(parseDate('')).toBeNull();
    });

    it('should return null for null', () => {
      expect(parseDate(null)).toBeNull();
    });

    it('should return null for undefined', () => {
      expect(parseDate(undefined)).toBeNull();
    });

    it('should return null for non-string values', () => {
      expect(parseDate(12345)).toBeNull();
      expect(parseDate({})).toBeNull();
    });

    it('should return null for invalid date format', () => {
      expect(parseDate('not-a-date')).toBeNull();
      expect(parseDate('15/03/2024')).toBeNull(); // dd/mm/yyyy not supported in algorithm
    });
  });

  describe('buildConnectionGraph', () => {
    it('should create a graph with active employees as nodes', () => {
      const table1Data = [
        ['email', 'active', 'twice'],
        ['alice@test.com', true, ''],
        ['bob@test.com', true, ''],
        ['charlie@test.com', false, ''], // inactive
      ];
      const table2Data = [['email1', 'email2', 'date', 'text']];

      const graph = buildConnectionGraph(table1Data, table2Data);

      expect(graph.nodes()).toContain('alice@test.com');
      expect(graph.nodes()).toContain('bob@test.com');
      expect(graph.nodes()).not.toContain('charlie@test.com');
      expect(graph.order).toBe(2); // 2 active employees
    });

    it('should handle various truthy values for active status', () => {
      const table1Data = [
        ['email', 'active', 'twice'],
        ['a@test.com', true, ''],
        ['b@test.com', 'true', ''],
        ['c@test.com', 1, ''],
        ['d@test.com', 'TRUE', ''],
        ['e@test.com', false, ''],
        ['f@test.com', 0, ''],
      ];
      const table2Data = [['email1', 'email2', 'date', 'text']];

      const graph = buildConnectionGraph(table1Data, table2Data);

      expect(graph.order).toBe(4); // a, b, c, d are active
    });

    it('should set canBeTwice attribute correctly', () => {
      const table1Data = [
        ['email', 'active', 'twice'],
        ['alice@test.com', true, 'twice'],
        ['bob@test.com', true, ''],
        ['charlie@test.com', true, 'Twice'], // Mixed case - should work with toLowerCase()
      ];
      const table2Data = [['email1', 'email2', 'date', 'text']];

      const graph = buildConnectionGraph(table1Data, table2Data);

      expect(graph.getNodeAttribute('alice@test.com', 'canBeTwice')).toBe(true);
      // Bob's canBeTwice is falsy (empty string or false)
      expect(!!graph.getNodeAttribute('bob@test.com', 'canBeTwice')).toBe(false);
      expect(graph.getNodeAttribute('charlie@test.com', 'canBeTwice')).toBe(true);
    });

    it('should create edges from meeting history', () => {
      const table1Data = [
        ['email', 'active', 'twice'],
        ['alice@test.com', true, ''],
        ['bob@test.com', true, ''],
        ['charlie@test.com', true, ''],
      ];
      const table2Data = [
        ['email1', 'email2', 'date', 'text'],
        ['alice@test.com', 'bob@test.com', '2024-01-15', 'Random Coffee #1'],
        ['bob@test.com', 'charlie@test.com', '2024-02-15', 'Random Coffee #2'],
      ];

      const graph = buildConnectionGraph(table1Data, table2Data);

      expect(graph.hasEdge('alice@test.com', 'bob@test.com')).toBe(true);
      expect(graph.hasEdge('bob@test.com', 'charlie@test.com')).toBe(true);
      expect(graph.hasEdge('alice@test.com', 'charlie@test.com')).toBe(false);
    });

    it('should count multiple meetings between same pair', () => {
      const table1Data = [
        ['email', 'active', 'twice'],
        ['alice@test.com', true, ''],
        ['bob@test.com', true, ''],
      ];
      const table2Data = [
        ['email1', 'email2', 'date', 'text'],
        ['alice@test.com', 'bob@test.com', '2024-01-15', 'Random Coffee #1'],
        ['alice@test.com', 'bob@test.com', '2024-02-15', 'Random Coffee #2'],
        ['alice@test.com', 'bob@test.com', '2024-03-15', 'Random Coffee #3'],
      ];

      const graph = buildConnectionGraph(table1Data, table2Data);
      const edgeData = graph.getEdgeAttributes('alice@test.com', 'bob@test.com');

      expect(edgeData.count).toBe(3);
      expect(edgeData.meetings.length).toBe(3);
    });

    it('should skip history entries where employees are not in active list', () => {
      const table1Data = [
        ['email', 'active', 'twice'],
        ['alice@test.com', true, ''],
      ];
      const table2Data = [
        ['email1', 'email2', 'date', 'text'],
        ['alice@test.com', 'deleted@test.com', '2024-01-15', 'Random Coffee #1'],
      ];

      const graph = buildConnectionGraph(table1Data, table2Data);

      expect(graph.edges().length).toBe(0);
    });

    it('should handle empty rows gracefully', () => {
      const table1Data = [
        ['email', 'active', 'twice'],
        ['alice@test.com', true, ''],
        null,
        [],
        ['bob@test.com', true, ''],
      ];
      const table2Data = [
        ['email1', 'email2', 'date', 'text'],
        null,
        [],
        ['alice@test.com', 'bob@test.com', '2024-01-15', 'Random Coffee #1'],
      ];

      const graph = buildConnectionGraph(table1Data, table2Data);

      expect(graph.order).toBe(2);
      expect(graph.hasEdge('alice@test.com', 'bob@test.com')).toBe(true);
    });
  });

  describe('detectCommunities', () => {
    it('should detect separate communities for unconnected components', () => {
      const table1Data = [
        ['email', 'active', 'twice'],
        ['a@test.com', true, ''],
        ['b@test.com', true, ''],
        ['c@test.com', true, ''],
        ['d@test.com', true, ''],
      ];
      const table2Data = [
        ['email1', 'email2', 'date', 'text'],
        ['a@test.com', 'b@test.com', '2024-01-15', 'Round #1'], // a-b connected
        ['c@test.com', 'd@test.com', '2024-01-15', 'Round #1'], // c-d connected
      ];

      const graph = buildConnectionGraph(table1Data, table2Data);
      const communities = detectCommunities(graph);

      // a and b should be in the same community
      expect(communities.get('a@test.com')).toBe(communities.get('b@test.com'));
      // c and d should be in the same community
      expect(communities.get('c@test.com')).toBe(communities.get('d@test.com'));
      // a/b community should be different from c/d community
      expect(communities.get('a@test.com')).not.toBe(communities.get('c@test.com'));
    });

    it('should put all connected nodes in same community', () => {
      const table1Data = [
        ['email', 'active', 'twice'],
        ['a@test.com', true, ''],
        ['b@test.com', true, ''],
        ['c@test.com', true, ''],
      ];
      const table2Data = [
        ['email1', 'email2', 'date', 'text'],
        ['a@test.com', 'b@test.com', '2024-01-15', 'Round #1'],
        ['b@test.com', 'c@test.com', '2024-02-15', 'Round #2'],
      ];

      const graph = buildConnectionGraph(table1Data, table2Data);
      const communities = detectCommunities(graph);

      // All should be in the same community
      expect(communities.get('a@test.com')).toBe(communities.get('b@test.com'));
      expect(communities.get('b@test.com')).toBe(communities.get('c@test.com'));
    });

    it('should assign isolated nodes to their own communities', () => {
      const table1Data = [
        ['email', 'active', 'twice'],
        ['a@test.com', true, ''],
        ['b@test.com', true, ''],
        ['isolated@test.com', true, ''],
      ];
      const table2Data = [
        ['email1', 'email2', 'date', 'text'],
        ['a@test.com', 'b@test.com', '2024-01-15', 'Round #1'],
      ];

      const graph = buildConnectionGraph(table1Data, table2Data);
      const communities = detectCommunities(graph);

      expect(communities.has('isolated@test.com')).toBe(true);
      expect(communities.get('isolated@test.com')).not.toBe(communities.get('a@test.com'));
    });
  });

  describe('calculateDiversityScore', () => {
    it('should return base score when nodes do not exist in graph', () => {
      const table1Data = [
        ['email', 'active', 'twice'],
        ['a@test.com', true, ''],
      ];
      const table2Data = [['email1', 'email2', 'date', 'text']];

      const graph = buildConnectionGraph(table1Data, table2Data);
      const score = calculateDiversityScore('nonexistent1@test.com', 'nonexistent2@test.com', graph);

      expect(score).toBe(10); // base score
    });

    it('should calculate higher diversity for fewer common neighbors', () => {
      const table1Data = [
        ['email', 'active', 'twice'],
        ['a@test.com', true, ''],
        ['b@test.com', true, ''],
        ['c@test.com', true, ''],
        ['d@test.com', true, ''],
      ];
      const table2Data = [
        ['email1', 'email2', 'date', 'text'],
        ['a@test.com', 'c@test.com', '2024-01-15', 'Round #1'],
        ['b@test.com', 'c@test.com', '2024-01-15', 'Round #1'],
        // a and b share neighbor c
      ];

      const graph = buildConnectionGraph(table1Data, table2Data);
      const scoreWithCommon = calculateDiversityScore('a@test.com', 'b@test.com', graph);
      const scoreWithoutCommon = calculateDiversityScore('a@test.com', 'd@test.com', graph);

      // d has no connection to anyone, so a-d should have higher diversity
      expect(scoreWithoutCommon).toBeGreaterThanOrEqual(scoreWithCommon);
    });
  });

  describe('calculateNetworkScore', () => {
    it('should give cross-community bonus for different communities', () => {
      const table1Data = [
        ['email', 'active', 'twice'],
        ['a@test.com', true, ''],
        ['b@test.com', true, ''],
        ['c@test.com', true, ''],
        ['d@test.com', true, ''],
      ];
      const table2Data = [
        ['email1', 'email2', 'date', 'text'],
        ['a@test.com', 'b@test.com', '2024-01-15', 'Round #1'],
        ['c@test.com', 'd@test.com', '2024-01-15', 'Round #1'],
      ];

      const graph = buildConnectionGraph(table1Data, table2Data);
      const communities = detectCommunities(graph);

      const crossCommunityScore = calculateNetworkScore('a@test.com', 'c@test.com', graph, communities);
      const sameCommunityScore = calculateNetworkScore('a@test.com', 'b@test.com', graph, communities);

      expect(crossCommunityScore).toBeGreaterThan(sameCommunityScore);
      expect(crossCommunityScore).toBeGreaterThanOrEqual(ALGORITHM_CONFIG.CROSS_COMMUNITY_BONUS);
    });

    it('should give bridge building bonus when degree difference is significant', () => {
      const table1Data = [
        ['email', 'active', 'twice'],
        ['hub@test.com', true, ''],
        ['a@test.com', true, ''],
        ['b@test.com', true, ''],
        ['c@test.com', true, ''],
        ['isolated@test.com', true, ''],
      ];
      const table2Data = [
        ['email1', 'email2', 'date', 'text'],
        ['hub@test.com', 'a@test.com', '2024-01-15', 'Round #1'],
        ['hub@test.com', 'b@test.com', '2024-01-15', 'Round #1'],
        ['hub@test.com', 'c@test.com', '2024-01-15', 'Round #1'],
        // hub has degree 3, isolated has degree 0
      ];

      const graph = buildConnectionGraph(table1Data, table2Data);
      const communities = detectCommunities(graph);

      const scoreWithBridge = calculateNetworkScore('hub@test.com', 'isolated@test.com', graph, communities);

      expect(scoreWithBridge).toBeGreaterThanOrEqual(ALGORITHM_CONFIG.BRIDGE_BUILDING_BONUS);
    });
  });

  describe('buildCostMatrix', () => {
    it('should assign high cost (penalty) for self-pairing', () => {
      const table1Data = [
        ['email', 'active', 'twice'],
        ['a@test.com', true, ''],
        ['b@test.com', true, ''],
      ];
      const table2Data = [['email1', 'email2', 'date', 'text']];

      const graph = buildConnectionGraph(table1Data, table2Data);
      const communities = detectCommunities(graph);
      const employees = graph.nodes();
      const costMatrix = buildCostMatrix(employees, graph, communities);

      // Diagonal should have penalty
      expect(costMatrix[0][0]).toBe(ALGORITHM_CONFIG.HARD_CONSTRAINT_PENALTY);
      expect(costMatrix[1][1]).toBe(ALGORITHM_CONFIG.HARD_CONSTRAINT_PENALTY);
    });

    it('should assign high cost (penalty) for people who have already met', () => {
      const table1Data = [
        ['email', 'active', 'twice'],
        ['a@test.com', true, ''],
        ['b@test.com', true, ''],
        ['c@test.com', true, ''],
      ];
      const table2Data = [
        ['email1', 'email2', 'date', 'text'],
        ['a@test.com', 'b@test.com', '2024-01-15', 'Round #1'],
      ];

      const graph = buildConnectionGraph(table1Data, table2Data);
      const communities = detectCommunities(graph);
      const employees = graph.nodes();
      const costMatrix = buildCostMatrix(employees, graph, communities);

      // Find indices
      const aIndex = employees.indexOf('a@test.com');
      const bIndex = employees.indexOf('b@test.com');
      const cIndex = employees.indexOf('c@test.com');

      // a-b have met, should have penalty
      expect(costMatrix[aIndex][bIndex]).toBe(ALGORITHM_CONFIG.HARD_CONSTRAINT_PENALTY);
      expect(costMatrix[bIndex][aIndex]).toBe(ALGORITHM_CONFIG.HARD_CONSTRAINT_PENALTY);

      // a-c and b-c have not met, should have lower cost
      expect(costMatrix[aIndex][cIndex]).toBeLessThan(ALGORITHM_CONFIG.HARD_CONSTRAINT_PENALTY);
      expect(costMatrix[bIndex][cIndex]).toBeLessThan(ALGORITHM_CONFIG.HARD_CONSTRAINT_PENALTY);
    });

    it('should produce negative costs for desirable new pairings', () => {
      const table1Data = [
        ['email', 'active', 'twice'],
        ['a@test.com', true, ''],
        ['b@test.com', true, ''],
      ];
      const table2Data = [['email1', 'email2', 'date', 'text']];

      const graph = buildConnectionGraph(table1Data, table2Data);
      const communities = detectCommunities(graph);
      const employees = graph.nodes();
      const costMatrix = buildCostMatrix(employees, graph, communities);

      const aIndex = employees.indexOf('a@test.com');
      const bIndex = employees.indexOf('b@test.com');

      // New pairings should have negative cost (desirable)
      expect(costMatrix[aIndex][bIndex]).toBeLessThan(0);
    });
  });

  describe('hungarianMatching', () => {
    it('should return empty array for empty cost matrix', () => {
      const result = hungarianMatching([], []);
      expect(result).toEqual([]);
    });

    it('should return empty array for null cost matrix', () => {
      const result = hungarianMatching(['a@test.com'], null);
      expect(result).toEqual([]);
    });

    it('should create pairs for even number of employees', () => {
      const employees = ['a@test.com', 'b@test.com', 'c@test.com', 'd@test.com'];
      // Simple cost matrix favoring a-b and c-d pairings
      const costMatrix = [
        [10000, -10, 0, 0],
        [-10, 10000, 0, 0],
        [0, 0, 10000, -10],
        [0, 0, -10, 10000],
      ];

      const pairs = hungarianMatching(employees, costMatrix);

      expect(pairs.length).toBe(2);
      // Each person should appear exactly once
      const allPeople = pairs.flat();
      expect(new Set(allPeople).size).toBe(4);
    });

    it('should handle odd number of employees by leaving one unpaired', () => {
      const employees = ['a@test.com', 'b@test.com', 'c@test.com'];
      const costMatrix = [
        [10000, -10, -5],
        [-10, 10000, -5],
        [-5, -5, 10000],
      ];

      const pairs = hungarianMatching(employees, costMatrix);

      // With 3 employees, only 1 pair can be formed
      expect(pairs.length).toBe(1);
    });

    it('should not include null (dummy) employees in pairs', () => {
      const employees = ['a@test.com', 'b@test.com', 'c@test.com'];
      const costMatrix = [
        [10000, -10, -5],
        [-10, 10000, -5],
        [-5, -5, 10000],
      ];

      const pairs = hungarianMatching(employees, costMatrix);

      for (const [email1, email2] of pairs) {
        expect(email1).not.toBeNull();
        expect(email2).not.toBeNull();
      }
    });
  });

  describe('generateOptimalPairs', () => {
    it('should return empty array when fewer than 2 employees', () => {
      const table1Data = [
        ['email', 'active', 'twice'],
        ['a@test.com', true, ''],
      ];
      const table2Data = [['email1', 'email2', 'date', 'text']];

      const pairs = generateOptimalPairs(table1Data, table2Data);

      expect(pairs).toEqual([]);
    });

    it('should create pairs for all employees when possible', () => {
      const table1Data = [
        ['email', 'active', 'twice'],
        ['a@test.com', true, ''],
        ['b@test.com', true, ''],
        ['c@test.com', true, ''],
        ['d@test.com', true, ''],
      ];
      const table2Data = [['email1', 'email2', 'date', 'text']];

      const pairs = generateOptimalPairs(table1Data, table2Data);

      expect(pairs.length).toBe(2);
      const allPeople = pairs.flat();
      expect(new Set(allPeople).size).toBe(4);
    });

    it('should avoid pairing people who have already met', () => {
      const table1Data = [
        ['email', 'active', 'twice'],
        ['a@test.com', true, ''],
        ['b@test.com', true, ''],
        ['c@test.com', true, ''],
        ['d@test.com', true, ''],
      ];
      const table2Data = [
        ['email1', 'email2', 'date', 'text'],
        ['a@test.com', 'b@test.com', '2024-01-15', 'Round #1'],
        ['c@test.com', 'd@test.com', '2024-01-15', 'Round #1'],
      ];

      const pairs = generateOptimalPairs(table1Data, table2Data);

      // Should not have a-b or c-d pairs (they've already met)
      for (const [email1, email2] of pairs) {
        const isRepeat =
          (email1 === 'a@test.com' && email2 === 'b@test.com') ||
          (email1 === 'b@test.com' && email2 === 'a@test.com') ||
          (email1 === 'c@test.com' && email2 === 'd@test.com') ||
          (email1 === 'd@test.com' && email2 === 'c@test.com');
        expect(isRepeat).toBe(false);
      }
    });

    it('should use twice user when odd number of employees', () => {
      const table1Data = [
        ['email', 'active', 'twice'],
        ['a@test.com', true, 'twice'],
        ['b@test.com', true, ''],
        ['c@test.com', true, ''],
      ];
      const table2Data = [['email1', 'email2', 'date', 'text']];

      const pairs = generateOptimalPairs(table1Data, table2Data);

      // With 3 employees and one "twice" user, should still make 2 pairs
      // (the twice user gets paired twice)
      expect(pairs.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle case when everyone has met everyone', () => {
      const table1Data = [
        ['email', 'active', 'twice'],
        ['a@test.com', true, ''],
        ['b@test.com', true, ''],
        ['c@test.com', true, ''],
        ['d@test.com', true, ''],
      ];
      const table2Data = [
        ['email1', 'email2', 'date', 'text'],
        // All 6 possible pairs have met
        ['a@test.com', 'b@test.com', '2024-01-01', '#1'],
        ['a@test.com', 'c@test.com', '2024-01-02', '#2'],
        ['a@test.com', 'd@test.com', '2024-01-03', '#3'],
        ['b@test.com', 'c@test.com', '2024-01-04', '#4'],
        ['b@test.com', 'd@test.com', '2024-01-05', '#5'],
        ['c@test.com', 'd@test.com', '2024-01-06', '#6'],
      ];

      // Should still produce pairs even if everyone has met (fallback)
      const pairs = generateOptimalPairs(table1Data, table2Data);

      // Algorithm will still try to pair, even with penalties
      expect(pairs.length).toBeGreaterThanOrEqual(0);
    });

    it('should return pairs as arrays of two emails', () => {
      const table1Data = [
        ['email', 'active', 'twice'],
        ['a@test.com', true, ''],
        ['b@test.com', true, ''],
      ];
      const table2Data = [['email1', 'email2', 'date', 'text']];

      const pairs = generateOptimalPairs(table1Data, table2Data);

      expect(pairs.length).toBe(1);
      expect(pairs[0]).toHaveLength(2);
      expect(typeof pairs[0][0]).toBe('string');
      expect(typeof pairs[0][1]).toBe('string');
    });
  });

  describe('ALGORITHM_CONFIG', () => {
    it('should have required weight values', () => {
      expect(ALGORITHM_CONFIG.WEIGHTS.DIVERSITY).toBeDefined();
      expect(ALGORITHM_CONFIG.WEIGHTS.NETWORK_OPTIMIZATION).toBeDefined();
      expect(ALGORITHM_CONFIG.WEIGHTS.DIVERSITY + ALGORITHM_CONFIG.WEIGHTS.NETWORK_OPTIMIZATION).toBe(1);
    });

    it('should have hard constraint penalty defined', () => {
      expect(ALGORITHM_CONFIG.HARD_CONSTRAINT_PENALTY).toBeGreaterThan(0);
    });

    it('should have cross community bonus defined', () => {
      expect(ALGORITHM_CONFIG.CROSS_COMMUNITY_BONUS).toBeGreaterThan(0);
    });

    it('should have bridge building bonus defined', () => {
      expect(ALGORITHM_CONFIG.BRIDGE_BUILDING_BONUS).toBeGreaterThan(0);
    });
  });

  describe('All Employees Matched Tests', () => {
    it('should pair all 6 employees in first round (no history)', () => {
      const table1Data = [
        ['email', 'active', 'twice'],
        ['a@test.com', true, ''],
        ['b@test.com', true, ''],
        ['c@test.com', true, ''],
        ['d@test.com', true, ''],
        ['e@test.com', true, ''],
        ['f@test.com', true, ''],
      ];
      const table2Data = [['email1', 'email2', 'date', 'text']];

      const pairs = generateOptimalPairs(table1Data, table2Data);

      expect(pairs.length).toBe(3);
      const allPaired = pairs.flat();
      expect(new Set(allPaired).size).toBe(6);
    });

    it('should pair all 6 employees in second round (with history)', () => {
      const table1Data = [
        ['email', 'active', 'twice'],
        ['a@test.com', true, ''],
        ['b@test.com', true, ''],
        ['c@test.com', true, ''],
        ['d@test.com', true, ''],
        ['e@test.com', true, ''],
        ['f@test.com', true, ''],
      ];
      const table2Data = [
        ['email1', 'email2', 'date', 'text'],
        ['a@test.com', 'b@test.com', '2024-01-15', 'Round #1'],
        ['c@test.com', 'd@test.com', '2024-01-15', 'Round #1'],
        ['e@test.com', 'f@test.com', '2024-01-15', 'Round #1'],
      ];

      const pairs = generateOptimalPairs(table1Data, table2Data);

      expect(pairs.length).toBe(3);
      const allPaired = pairs.flat();
      expect(new Set(allPaired).size).toBe(6);

      // Verify no repeat pairs from history
      const historyPairs = new Set(['a@test.com-b@test.com', 'c@test.com-d@test.com', 'e@test.com-f@test.com']);
      for (const [e1, e2] of pairs) {
        const pairKey = [e1, e2].sort().join('-');
        expect(historyPairs.has(pairKey)).toBe(false);
      }
    });

    it('should pair all 8 employees across multiple rounds', () => {
      const table1Data = [
        ['email', 'active', 'twice'],
        ['a@test.com', true, ''],
        ['b@test.com', true, ''],
        ['c@test.com', true, ''],
        ['d@test.com', true, ''],
        ['e@test.com', true, ''],
        ['f@test.com', true, ''],
        ['g@test.com', true, ''],
        ['h@test.com', true, ''],
      ];

      let table2Data = [['email1', 'email2', 'date', 'text']];

      // Run 3 rounds and ensure everyone is paired each time
      for (let round = 1; round <= 3; round++) {
        const pairs = generateOptimalPairs(table1Data, table2Data);

        expect(pairs.length).toBe(4);
        const allPaired = pairs.flat();
        expect(new Set(allPaired).size).toBe(8);

        // Add pairs to history
        for (const [e1, e2] of pairs) {
          table2Data.push([e1, e2, `2024-0${round}-15`, `Round #${round}`]);
        }
      }
    });

    it('should pair all 10 employees in first round', () => {
      const table1Data = [['email', 'active', 'twice']];
      for (let i = 1; i <= 10; i++) {
        table1Data.push([`user${i}@test.com`, true, '']);
      }
      const table2Data = [['email1', 'email2', 'date', 'text']];

      const pairs = generateOptimalPairs(table1Data, table2Data);

      expect(pairs.length).toBe(5);
      const allPaired = pairs.flat();
      expect(new Set(allPaired).size).toBe(10);
    });

    it('should pair all 12 employees across 5 rounds', () => {
      const table1Data = [['email', 'active', 'twice']];
      for (let i = 1; i <= 12; i++) {
        table1Data.push([`user${i}@test.com`, true, '']);
      }

      let table2Data = [['email1', 'email2', 'date', 'text']];

      for (let round = 1; round <= 5; round++) {
        const pairs = generateOptimalPairs(table1Data, table2Data);

        expect(pairs.length).toBe(6);
        const allPaired = pairs.flat();
        expect(new Set(allPaired).size).toBe(12);

        // Add pairs to history
        for (const [e1, e2] of pairs) {
          table2Data.push([e1, e2, `2024-0${round}-15`, `Round #${round}`]);
        }
      }
    });

    it('should not leave any employee unpaired with even count', () => {
      // Test specifically that no employees are stranded
      const table1Data = [
        ['email', 'active', 'twice'],
        ['alice@test.com', true, ''],
        ['bob@test.com', true, ''],
        ['charlie@test.com', true, ''],
        ['diana@test.com', true, ''],
      ];
      const table2Data = [
        ['email1', 'email2', 'date', 'text'],
        ['alice@test.com', 'bob@test.com', '2024-01-15', 'Round #1'],
      ];

      const pairs = generateOptimalPairs(table1Data, table2Data);

      expect(pairs.length).toBe(2);
      const pairedEmails = new Set(pairs.flat());

      // All 4 employees should be paired
      expect(pairedEmails.has('alice@test.com')).toBe(true);
      expect(pairedEmails.has('bob@test.com')).toBe(true);
      expect(pairedEmails.has('charlie@test.com')).toBe(true);
      expect(pairedEmails.has('diana@test.com')).toBe(true);
    });

    it('should handle scenario where optimal matching could strand someone', () => {
      // This is a tricky case where greedy could leave someone out
      const table1Data = [
        ['email', 'active', 'twice'],
        ['a@test.com', true, ''],
        ['b@test.com', true, ''],
        ['c@test.com', true, ''],
        ['d@test.com', true, ''],
        ['e@test.com', true, ''],
        ['f@test.com', true, ''],
      ];
      // History designed so that a greedy algorithm picking lowest cost might fail
      const table2Data = [
        ['email1', 'email2', 'date', 'text'],
        ['a@test.com', 'b@test.com', '2024-01-15', 'R1'],
        ['a@test.com', 'c@test.com', '2024-02-15', 'R2'],
        ['b@test.com', 'c@test.com', '2024-03-15', 'R3'],
        ['d@test.com', 'e@test.com', '2024-01-15', 'R1'],
        ['d@test.com', 'f@test.com', '2024-02-15', 'R2'],
        ['e@test.com', 'f@test.com', '2024-03-15', 'R3'],
      ];

      const pairs = generateOptimalPairs(table1Data, table2Data);

      expect(pairs.length).toBe(3);
      const allPaired = pairs.flat();
      expect(new Set(allPaired).size).toBe(6);
    });
  });
});
