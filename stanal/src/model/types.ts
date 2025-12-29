/**
 * STANAL - Structural Analysis Types
 * 구조해석을 위한 타입 정의
 */

// ============================================
// 단위 시스템
// ============================================

export type LengthUnit = 'mm' | 'm' | 'in' | 'ft';
export type ForceUnit = 'N' | 'kN' | 'lb' | 'kip';

export interface Units {
  length: LengthUnit;
  force: ForceUnit;
}

// ============================================
// 모델 정보
// ============================================

export interface ModelInfo {
  name: string;
  units: Units;
}

// ============================================
// 재료 (Material)
// ============================================

export interface Material {
  id: string;
  E: number;      // 탄성계수 (Young's modulus)
  G: number;      // 전단탄성계수 (Shear modulus)
  nu: number;     // 포아송비 (Poisson's ratio)
  rho: number;    // 밀도 (Density)
}

// ============================================
// 단면 (Section)
// ============================================

export interface Section {
  id: string;
  A: number;      // 단면적 (Area)
  Iy: number;     // Y축 단면2차모멘트 (Moment of inertia about Y)
  Iz: number;     // Z축 단면2차모멘트 (Moment of inertia about Z)
  J: number;      // 비틀림 상수 (Torsional constant)
}

// ============================================
// 절점 (Node)
// ============================================

export interface Node {
  id: string;
  x: number;
  y: number;
  z: number;
}

// 절점 자유도 (6 DOF per node)
export interface NodeDOF {
  dx: number;     // X 변위
  dy: number;     // Y 변위
  dz: number;     // Z 변위
  rx: number;     // X축 회전
  ry: number;     // Y축 회전
  rz: number;     // Z축 회전
}

// 절점 결과
export interface NodeResult {
  nodeId: string;
  displacement: NodeDOF;
  reaction: NodeDOF;
}

// ============================================
// 부재 (Member)
// ============================================

export interface Member {
  id: string;
  iNode: string;      // 시작 절점 ID
  jNode: string;      // 끝 절점 ID
  material: string;   // 재료 ID
  section: string;    // 단면 ID
  rotation?: number;  // 국부축 회전 (도, degrees)
  releases?: MemberReleases;  // 단부 해제 조건
}

// 부재 단부 해제 조건 (힌지 등)
export interface MemberReleases {
  iNode: {
    fx?: boolean;   // 축력 해제
    fy?: boolean;   // Y 전단력 해제
    fz?: boolean;   // Z 전단력 해제
    mx?: boolean;   // 비틀림 해제
    my?: boolean;   // Y 모멘트 해제
    mz?: boolean;   // Z 모멘트 해제
  };
  jNode: {
    fx?: boolean;
    fy?: boolean;
    fz?: boolean;
    mx?: boolean;
    my?: boolean;
    mz?: boolean;
  };
}

// 부재력 결과
export interface MemberForces {
  x: number;        // 부재 내 위치 (0 ~ L)
  axial: number;    // 축력 (Fx)
  shearY: number;   // Y 전단력 (Fy)
  shearZ: number;   // Z 전단력 (Fz)
  torsion: number;  // 비틀림 (Mx)
  momentY: number;  // Y 모멘트 (My)
  momentZ: number;  // Z 모멘트 (Mz)
}

export interface MemberResult {
  memberId: string;
  forces: MemberForces[];  // 부재 길이를 따라 분포된 내력
  maxForces: {
    axial: { value: number; location: number };
    shearY: { value: number; location: number };
    shearZ: { value: number; location: number };
    momentY: { value: number; location: number };
    momentZ: { value: number; location: number };
  };
}

// ============================================
// 지지 조건 (Support)
// ============================================

export interface Support {
  node: string;       // 절점 ID
  dx: boolean;        // X 변위 구속
  dy: boolean;        // Y 변위 구속
  dz: boolean;        // Z 변위 구속
  rx: boolean;        // X축 회전 구속
  ry: boolean;        // Y축 회전 구속
  rz: boolean;        // Z축 회전 구속
}

// ============================================
// 하중 (Load)
// ============================================

export type LoadDirection = 'FX' | 'FY' | 'FZ' | 'MX' | 'MY' | 'MZ'
                          | 'Fx' | 'Fy' | 'Fz' | 'Mx' | 'My' | 'Mz';

export type MemberLoadType = 'distributed' | 'point' | 'moment';

// 절점 하중
export interface NodeLoad {
  node: string;
  direction: LoadDirection;
  magnitude: number;
}

// 부재 하중
export interface MemberLoad {
  member: string;
  type: MemberLoadType;
  direction: LoadDirection;
  magnitude?: number;   // 점하중/모멘트 크기
  w1?: number;          // 분포하중 시작값
  w2?: number;          // 분포하중 끝값
  x1?: number;          // 분포하중 시작 위치 (0 ~ 1, 부재 길이 비율)
  x2?: number;          // 분포하중 끝 위치 (0 ~ 1)
  x?: number;           // 점하중 위치 (0 ~ 1)
}

// 하중 케이스
export interface LoadCase {
  name: string;
  nodeLoads: NodeLoad[];
  memberLoads: MemberLoad[];
}

// 하중 조합
export interface LoadCombination {
  name: string;
  factors: { [caseName: string]: number };
}

// ============================================
// 전체 모델
// ============================================

export interface StanalModel {
  model: ModelInfo;
  materials: Material[];
  sections: Section[];
  nodes: Node[];
  members: Member[];
  supports: Support[];
  loadCases: LoadCase[];
  loadCombinations: LoadCombination[];
}

// ============================================
// 해석 결과
// ============================================

export interface AnalysisResult {
  success: boolean;
  error?: string;
  loadCase: string;
  nodes: NodeResult[];
  members: MemberResult[];
  summary: {
    maxDisplacement: { nodeId: string; value: number; direction: string };
    maxReaction: { nodeId: string; value: number; direction: string };
    maxMoment: { memberId: string; value: number; location: number };
    maxShear: { memberId: string; value: number; location: number };
  };
}

// ============================================
// WebView 메시지 타입
// ============================================

export type WebviewMessageType =
  | 'updateModel'
  | 'updateResults'
  | 'setViewMode'
  | 'selectElement'
  | 'highlightElement';

export interface WebviewMessage {
  type: WebviewMessageType;
  payload: unknown;
}

export type ViewMode = 'model' | 'deformed' | 'shear' | 'moment' | 'axial';
