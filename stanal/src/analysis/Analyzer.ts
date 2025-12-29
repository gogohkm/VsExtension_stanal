/**
 * STANAL Analyzer
 * 3D 구조 해석 엔진
 */

import { Matrix } from './Matrix';
import { Member3DElement } from './Member3DElement';
import {
  StanalModel,
  AnalysisResult,
  NodeResult,
  MemberResult,
  MemberForces,
  Node,
  Member,
  Material,
  Section,
  Support,
  LoadCase,
  LoadCombination,
  NodeLoad,
  MemberLoad
} from '../model/types';

export class Analyzer {
  private model: StanalModel;
  private nodeMap: Map<string, Node>;
  private nodeIndexMap: Map<string, number>;
  private materialMap: Map<string, Material>;
  private sectionMap: Map<string, Section>;
  private supportMap: Map<string, Support>;
  private elements: Member3DElement[] = [];
  private numDOF: number = 0;
  private freeDOF: number[] = [];
  private fixedDOF: number[] = [];

  constructor(model: StanalModel) {
    this.model = model;
    this.nodeMap = new Map();
    this.nodeIndexMap = new Map();
    this.materialMap = new Map();
    this.sectionMap = new Map();
    this.supportMap = new Map();
    this.elements = [];
    this.freeDOF = [];
    this.fixedDOF = [];

    this.initialize();
  }

  /**
   * 모델 초기화
   */
  private initialize(): void {
    // 노드 맵 생성
    this.model.nodes.forEach((node, index) => {
      this.nodeMap.set(node.id, node);
      this.nodeIndexMap.set(node.id, index);
    });

    // 재료 맵 생성
    this.model.materials.forEach(mat => {
      this.materialMap.set(mat.id, mat);
    });

    // 단면 맵 생성
    this.model.sections.forEach(sec => {
      this.sectionMap.set(sec.id, sec);
    });

    // 지지 조건 맵 생성
    (this.model.supports || []).forEach(support => {
      this.supportMap.set(support.node, support);
    });

    // 요소 생성
    (this.model.members || []).forEach(member => {
      const iNode = this.nodeMap.get(member.iNode);
      const jNode = this.nodeMap.get(member.jNode);
      const material = this.materialMap.get(member.material);
      const section = this.sectionMap.get(member.section);

      if (iNode && jNode && material && section) {
        this.elements.push(new Member3DElement(member, iNode, jNode, material, section));
      }
    });

    // 전체 자유도 수
    this.numDOF = this.model.nodes.length * 6;

    // 자유도 분류 (자유 vs 고정)
    this.classifyDOF();
  }

  /**
   * 자유도 분류
   */
  private classifyDOF(): void {
    this.freeDOF = [];
    this.fixedDOF = [];

    for (let i = 0; i < this.model.nodes.length; i++) {
      const node = this.model.nodes[i];
      const support = this.supportMap.get(node.id);
      const baseDOF = i * 6;

      const constraints = support
        ? [support.dx, support.dy, support.dz, support.rx, support.ry, support.rz]
        : [false, false, false, false, false, false];

      for (let j = 0; j < 6; j++) {
        if (constraints[j]) {
          this.fixedDOF.push(baseDOF + j);
        } else {
          this.freeDOF.push(baseDOF + j);
        }
      }
    }
  }

  /**
   * 전체 강성 행렬 조립
   */
  private assembleGlobalStiffnessMatrix(): Matrix {
    const K = Matrix.zeros(this.numDOF, this.numDOF);

    for (const element of this.elements) {
      const kGlobal = element.globalStiffnessMatrix();

      // 요소 DOF → 전체 DOF 매핑
      const iIndex = this.nodeIndexMap.get(element.iNode.id)!;
      const jIndex = this.nodeIndexMap.get(element.jNode.id)!;

      const dofMap = [
        iIndex * 6, iIndex * 6 + 1, iIndex * 6 + 2,
        iIndex * 6 + 3, iIndex * 6 + 4, iIndex * 6 + 5,
        jIndex * 6, jIndex * 6 + 1, jIndex * 6 + 2,
        jIndex * 6 + 3, jIndex * 6 + 4, jIndex * 6 + 5
      ];

      // 강성 행렬 조립
      for (let i = 0; i < 12; i++) {
        for (let j = 0; j < 12; j++) {
          K.add(dofMap[i], dofMap[j], kGlobal.get(i, j));
        }
      }
    }

    return K;
  }

  /**
   * 하중 벡터 조립
   */
  private assembleLoadVector(loadCase: LoadCase): number[] {
    const P = new Array(this.numDOF).fill(0);

    // 절점 하중
    for (const load of loadCase.nodeLoads || []) {
      const nodeIndex = this.nodeIndexMap.get(load.node);
      if (nodeIndex === undefined) {continue;}

      const dir = load.direction.toUpperCase();
      const dofOffset = this.getDOFOffset(dir);
      if (dofOffset >= 0) {
        P[nodeIndex * 6 + dofOffset] += load.magnitude;
      }
    }

    // 부재 하중 → 고정단 반력 (등가 절점 하중)
    for (const element of this.elements) {
      const fer = element.fixedEndReactions(loadCase.memberLoads || []);

      const iIndex = this.nodeIndexMap.get(element.iNode.id)!;
      const jIndex = this.nodeIndexMap.get(element.jNode.id)!;

      // 고정단 반력은 반대 방향으로 적용
      for (let i = 0; i < 6; i++) {
        P[iIndex * 6 + i] -= fer[i];
        P[jIndex * 6 + i] -= fer[i + 6];
      }
    }

    return P;
  }

  /**
   * 방향 문자열 → DOF 오프셋
   */
  private getDOFOffset(direction: string): number {
    switch (direction) {
      case 'FX': return 0;
      case 'FY': return 1;
      case 'FZ': return 2;
      case 'MX': return 3;
      case 'MY': return 4;
      case 'MZ': return 5;
      default: return -1;
    }
  }

  /**
   * 하중 조합 해석
   */
  analyze(combinationName: string): AnalysisResult {
    try {
      // 하중 조합 찾기
      const combo = this.model.loadCombinations.find(c => c.name === combinationName);
      if (!combo) {
        return {
          success: false,
          error: `Load combination '${combinationName}' not found`,
          loadCase: combinationName,
          nodes: [],
          members: [],
          summary: this.emptySummary()
        };
      }

      // 전체 강성 행렬 조립
      const K = this.assembleGlobalStiffnessMatrix();

      // 조합 하중 벡터 계산
      const P = new Array(this.numDOF).fill(0);

      for (const [caseName, factor] of Object.entries(combo.factors)) {
        const loadCase = this.model.loadCases.find(lc => lc.name === caseName);
        if (loadCase) {
          const caseP = this.assembleLoadVector(loadCase);
          for (let i = 0; i < this.numDOF; i++) {
            P[i] += factor * caseP[i];
          }
        }
      }

      // 행렬 분할 및 해석
      // K11 * D1 = P1 (자유 DOF)
      // D2 = 0 (고정 DOF, 강제 변위 없음 가정)

      const K11 = K.subMatrix(this.freeDOF, this.freeDOF);
      const P1 = Matrix.extractVector(P, this.freeDOF);

      // 선형 시스템 해석
      const D1 = K11.solve(P1);

      // 전체 변위 벡터 조립
      const D = new Array(this.numDOF).fill(0);
      Matrix.setVector(D, this.freeDOF, D1);

      // 반력 계산: R = K * D - P
      const reactions = K.multiplyVector(D);
      for (let i = 0; i < this.numDOF; i++) {
        reactions[i] -= P[i];
      }

      // 결과 정리
      const nodeResults = this.extractNodeResults(D, reactions);
      const memberResults = this.extractMemberResults(D, combo);

      return {
        success: true,
        loadCase: combinationName,
        nodes: nodeResults,
        members: memberResults,
        summary: this.computeSummary(nodeResults, memberResults)
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        loadCase: combinationName,
        nodes: [],
        members: [],
        summary: this.emptySummary()
      };
    }
  }

  /**
   * 절점 결과 추출
   */
  private extractNodeResults(D: number[], reactions: number[]): NodeResult[] {
    return this.model.nodes.map((node, index) => {
      const baseDOF = index * 6;

      return {
        nodeId: node.id,
        displacement: {
          dx: D[baseDOF],
          dy: D[baseDOF + 1],
          dz: D[baseDOF + 2],
          rx: D[baseDOF + 3],
          ry: D[baseDOF + 4],
          rz: D[baseDOF + 5]
        },
        reaction: {
          dx: reactions[baseDOF],
          dy: reactions[baseDOF + 1],
          dz: reactions[baseDOF + 2],
          rx: reactions[baseDOF + 3],
          ry: reactions[baseDOF + 4],
          rz: reactions[baseDOF + 5]
        }
      };
    });
  }

  /**
   * 부재 결과 추출
   */
  private extractMemberResults(D: number[], combo: LoadCombination): MemberResult[] {
    return this.elements.map(element => {
      const iIndex = this.nodeIndexMap.get(element.iNode.id)!;
      const jIndex = this.nodeIndexMap.get(element.jNode.id)!;

      // 요소 변위 추출
      const elementD = [
        D[iIndex * 6], D[iIndex * 6 + 1], D[iIndex * 6 + 2],
        D[iIndex * 6 + 3], D[iIndex * 6 + 4], D[iIndex * 6 + 5],
        D[jIndex * 6], D[jIndex * 6 + 1], D[jIndex * 6 + 2],
        D[jIndex * 6 + 3], D[jIndex * 6 + 4], D[jIndex * 6 + 5]
      ];

      // 조합된 부재 하중
      const combinedLoads: MemberLoad[] = [];
      for (const [caseName, factor] of Object.entries(combo.factors)) {
        const loadCase = this.model.loadCases.find(lc => lc.name === caseName);
        if (loadCase) {
          for (const ml of loadCase.memberLoads || []) {
            if (ml.member === element.id) {
              combinedLoads.push({
                ...ml,
                magnitude: (ml.magnitude || 0) * factor,
                w1: (ml.w1 || 0) * factor,
                w2: (ml.w2 || 0) * factor
              });
            }
          }
        }
      }

      // 부재력 계산
      const forcePoints = element.computeMemberForces(elementD, combinedLoads);

      const forces: MemberForces[] = forcePoints.map(fp => ({
        x: fp.x,
        axial: fp.forces[0],
        shearY: fp.forces[1],
        shearZ: fp.forces[2],
        torsion: fp.forces[3],
        momentY: fp.forces[4],
        momentZ: fp.forces[5]
      }));

      // 최대값 찾기
      const maxForces = {
        axial: this.findMax(forces, 'axial'),
        shearY: this.findMax(forces, 'shearY'),
        shearZ: this.findMax(forces, 'shearZ'),
        momentY: this.findMax(forces, 'momentY'),
        momentZ: this.findMax(forces, 'momentZ')
      };

      return {
        memberId: element.id,
        forces,
        maxForces
      };
    });
  }

  /**
   * 최대값 찾기
   */
  private findMax(forces: MemberForces[], key: keyof MemberForces): { value: number; location: number } {
    let maxVal = 0;
    let maxLoc = 0;

    for (const f of forces) {
      const val = Math.abs(f[key] as number);
      if (val > Math.abs(maxVal)) {
        maxVal = f[key] as number;
        maxLoc = f.x;
      }
    }

    return { value: maxVal, location: maxLoc };
  }

  /**
   * 결과 요약 계산
   */
  private computeSummary(nodes: NodeResult[], members: MemberResult[]): AnalysisResult['summary'] {
    let maxDisp = { nodeId: '', value: 0, direction: '' };
    let maxReaction = { nodeId: '', value: 0, direction: '' };
    let maxMoment = { memberId: '', value: 0, location: 0 };
    let maxShear = { memberId: '', value: 0, location: 0 };

    // 최대 변위
    for (const node of nodes) {
      const d = node.displacement;
      const directions = ['dx', 'dy', 'dz'] as const;
      for (const dir of directions) {
        if (Math.abs(d[dir]) > Math.abs(maxDisp.value)) {
          maxDisp = { nodeId: node.nodeId, value: d[dir], direction: dir };
        }
      }
    }

    // 최대 반력
    for (const node of nodes) {
      const r = node.reaction;
      const directions = ['dx', 'dy', 'dz'] as const;
      for (const dir of directions) {
        if (Math.abs(r[dir]) > Math.abs(maxReaction.value)) {
          maxReaction = { nodeId: node.nodeId, value: r[dir], direction: dir };
        }
      }
    }

    // 최대 모멘트 및 전단력
    for (const member of members) {
      if (Math.abs(member.maxForces.momentZ.value) > Math.abs(maxMoment.value)) {
        maxMoment = {
          memberId: member.memberId,
          value: member.maxForces.momentZ.value,
          location: member.maxForces.momentZ.location
        };
      }
      if (Math.abs(member.maxForces.shearY.value) > Math.abs(maxShear.value)) {
        maxShear = {
          memberId: member.memberId,
          value: member.maxForces.shearY.value,
          location: member.maxForces.shearY.location
        };
      }
    }

    return { maxDisplacement: maxDisp, maxReaction, maxMoment, maxShear };
  }

  /**
   * 빈 요약 생성
   */
  private emptySummary(): AnalysisResult['summary'] {
    return {
      maxDisplacement: { nodeId: '', value: 0, direction: '' },
      maxReaction: { nodeId: '', value: 0, direction: '' },
      maxMoment: { memberId: '', value: 0, location: 0 },
      maxShear: { memberId: '', value: 0, location: 0 }
    };
  }
}
