/**
 * STANAL Model Validator
 * 모델 유효성 검사
 */

import { StanalModel, Node, Member, Support, LoadCase, Material, Section } from '../model/types';

export interface ValidationError {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * 전체 모델 유효성 검사
 */
export function validateModel(model: StanalModel): ValidationError[] {
  const errors: ValidationError[] = [];

  // 기본 구조 검증
  if (!model) {
    errors.push({ path: '', message: '모델이 비어있습니다.', severity: 'error' });
    return errors;
  }

  // 모델 정보 검증
  errors.push(...validateModelInfo(model));

  // 재료 검증
  errors.push(...validateMaterials(model.materials || []));

  // 단면 검증
  errors.push(...validateSections(model.sections || []));

  // 절점 검증
  errors.push(...validateNodes(model.nodes || []));

  // 부재 검증
  errors.push(...validateMembers(model.members || [], model.nodes || [], model.materials || [], model.sections || []));

  // 지지 조건 검증
  errors.push(...validateSupports(model.supports || [], model.nodes || []));

  // 하중 케이스 검증
  errors.push(...validateLoadCases(model.loadCases || [], model.nodes || [], model.members || []));

  // 하중 조합 검증
  errors.push(...validateLoadCombinations(model.loadCombinations || [], model.loadCases || []));

  // 구조 안정성 검증
  errors.push(...validateStructuralStability(model));

  return errors;
}

function validateModelInfo(model: StanalModel): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!model.model) {
    errors.push({ path: 'model', message: '모델 정보가 없습니다.', severity: 'error' });
    return errors;
  }

  if (!model.model.name) {
    errors.push({ path: 'model.name', message: '모델 이름이 없습니다.', severity: 'warning' });
  }

  if (!model.model.units) {
    errors.push({ path: 'model.units', message: '단위 정보가 없습니다.', severity: 'warning' });
  }

  return errors;
}

function validateMaterials(materials: Material[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const ids = new Set<string>();

  materials.forEach((mat, i) => {
    const path = `materials[${i}]`;

    if (!mat.id) {
      errors.push({ path: `${path}.id`, message: '재료 ID가 없습니다.', severity: 'error' });
    } else if (ids.has(mat.id)) {
      errors.push({ path: `${path}.id`, message: `중복된 재료 ID: ${mat.id}`, severity: 'error' });
    } else {
      ids.add(mat.id);
    }

    if (mat.E <= 0) {
      errors.push({ path: `${path}.E`, message: '탄성계수(E)는 양수여야 합니다.', severity: 'error' });
    }

    if (mat.G <= 0) {
      errors.push({ path: `${path}.G`, message: '전단탄성계수(G)는 양수여야 합니다.', severity: 'error' });
    }

    if (mat.nu < 0 || mat.nu >= 0.5) {
      errors.push({ path: `${path}.nu`, message: '포아송비(nu)는 0 ~ 0.5 사이여야 합니다.', severity: 'error' });
    }
  });

  return errors;
}

function validateSections(sections: Section[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const ids = new Set<string>();

  sections.forEach((sec, i) => {
    const path = `sections[${i}]`;

    if (!sec.id) {
      errors.push({ path: `${path}.id`, message: '단면 ID가 없습니다.', severity: 'error' });
    } else if (ids.has(sec.id)) {
      errors.push({ path: `${path}.id`, message: `중복된 단면 ID: ${sec.id}`, severity: 'error' });
    } else {
      ids.add(sec.id);
    }

    if (sec.A <= 0) {
      errors.push({ path: `${path}.A`, message: '단면적(A)은 양수여야 합니다.', severity: 'error' });
    }

    if (sec.Iy <= 0) {
      errors.push({ path: `${path}.Iy`, message: '단면2차모멘트(Iy)는 양수여야 합니다.', severity: 'error' });
    }

    if (sec.Iz <= 0) {
      errors.push({ path: `${path}.Iz`, message: '단면2차모멘트(Iz)는 양수여야 합니다.', severity: 'error' });
    }

    if (sec.J <= 0) {
      errors.push({ path: `${path}.J`, message: '비틀림상수(J)는 양수여야 합니다.', severity: 'error' });
    }
  });

  return errors;
}

function validateNodes(nodes: Node[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const ids = new Set<string>();

  if (nodes.length === 0) {
    errors.push({ path: 'nodes', message: '절점이 정의되지 않았습니다.', severity: 'warning' });
    return errors;
  }

  nodes.forEach((node, i) => {
    const path = `nodes[${i}]`;

    if (!node.id) {
      errors.push({ path: `${path}.id`, message: '절점 ID가 없습니다.', severity: 'error' });
    } else if (ids.has(node.id)) {
      errors.push({ path: `${path}.id`, message: `중복된 절점 ID: ${node.id}`, severity: 'error' });
    } else {
      ids.add(node.id);
    }

    if (typeof node.x !== 'number' || typeof node.y !== 'number' || typeof node.z !== 'number') {
      errors.push({ path: path, message: '절점 좌표가 올바르지 않습니다.', severity: 'error' });
    }
  });

  return errors;
}

function validateMembers(members: Member[], nodes: Node[], materials: Material[], sections: Section[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const ids = new Set<string>();
  const nodeIds = new Set(nodes.map(n => n.id));
  const materialIds = new Set(materials.map(m => m.id));
  const sectionIds = new Set(sections.map(s => s.id));

  if (members.length === 0) {
    errors.push({ path: 'members', message: '부재가 정의되지 않았습니다.', severity: 'warning' });
    return errors;
  }

  members.forEach((member, i) => {
    const path = `members[${i}]`;

    if (!member.id) {
      errors.push({ path: `${path}.id`, message: '부재 ID가 없습니다.', severity: 'error' });
    } else if (ids.has(member.id)) {
      errors.push({ path: `${path}.id`, message: `중복된 부재 ID: ${member.id}`, severity: 'error' });
    } else {
      ids.add(member.id);
    }

    if (!member.iNode || !nodeIds.has(member.iNode)) {
      errors.push({ path: `${path}.iNode`, message: `존재하지 않는 시작 절점: ${member.iNode}`, severity: 'error' });
    }

    if (!member.jNode || !nodeIds.has(member.jNode)) {
      errors.push({ path: `${path}.jNode`, message: `존재하지 않는 끝 절점: ${member.jNode}`, severity: 'error' });
    }

    if (member.iNode === member.jNode) {
      errors.push({ path: path, message: '시작 절점과 끝 절점이 같습니다.', severity: 'error' });
    }

    if (!member.material || !materialIds.has(member.material)) {
      errors.push({ path: `${path}.material`, message: `존재하지 않는 재료: ${member.material}`, severity: 'error' });
    }

    if (!member.section || !sectionIds.has(member.section)) {
      errors.push({ path: `${path}.section`, message: `존재하지 않는 단면: ${member.section}`, severity: 'error' });
    }
  });

  return errors;
}

function validateSupports(supports: Support[], nodes: Node[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const nodeIds = new Set(nodes.map(n => n.id));
  const supportedNodes = new Set<string>();

  supports.forEach((support, i) => {
    const path = `supports[${i}]`;

    if (!support.node || !nodeIds.has(support.node)) {
      errors.push({ path: `${path}.node`, message: `존재하지 않는 절점: ${support.node}`, severity: 'error' });
    } else if (supportedNodes.has(support.node)) {
      errors.push({ path: `${path}.node`, message: `중복된 지지 조건: ${support.node}`, severity: 'warning' });
    } else {
      supportedNodes.add(support.node);
    }

    // 최소 하나의 구속이 있는지 확인
    const hasConstraint = support.dx || support.dy || support.dz ||
                         support.rx || support.ry || support.rz;
    if (!hasConstraint) {
      errors.push({ path: path, message: '지지 조건에 구속이 없습니다.', severity: 'warning' });
    }
  });

  return errors;
}

function validateLoadCases(loadCases: LoadCase[], nodes: Node[], members: Member[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const nodeIds = new Set(nodes.map(n => n.id));
  const memberIds = new Set(members.map(m => m.id));
  const caseNames = new Set<string>();

  loadCases.forEach((lc, i) => {
    const path = `loadCases[${i}]`;

    if (!lc.name) {
      errors.push({ path: `${path}.name`, message: '하중 케이스 이름이 없습니다.', severity: 'error' });
    } else if (caseNames.has(lc.name)) {
      errors.push({ path: `${path}.name`, message: `중복된 하중 케이스 이름: ${lc.name}`, severity: 'error' });
    } else {
      caseNames.add(lc.name);
    }

    // 절점 하중 검증
    (lc.nodeLoads || []).forEach((nl, j) => {
      if (!nodeIds.has(nl.node)) {
        errors.push({ path: `${path}.nodeLoads[${j}].node`, message: `존재하지 않는 절점: ${nl.node}`, severity: 'error' });
      }
    });

    // 부재 하중 검증
    (lc.memberLoads || []).forEach((ml, j) => {
      if (!memberIds.has(ml.member)) {
        errors.push({ path: `${path}.memberLoads[${j}].member`, message: `존재하지 않는 부재: ${ml.member}`, severity: 'error' });
      }
    });
  });

  return errors;
}

function validateLoadCombinations(combinations: { name: string; factors: { [key: string]: number } }[], loadCases: LoadCase[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const caseNames = new Set(loadCases.map(lc => lc.name));
  const comboNames = new Set<string>();

  combinations.forEach((combo, i) => {
    const path = `loadCombinations[${i}]`;

    if (!combo.name) {
      errors.push({ path: `${path}.name`, message: '하중 조합 이름이 없습니다.', severity: 'error' });
    } else if (comboNames.has(combo.name)) {
      errors.push({ path: `${path}.name`, message: `중복된 하중 조합 이름: ${combo.name}`, severity: 'error' });
    } else {
      comboNames.add(combo.name);
    }

    // 하중 케이스 참조 검증
    Object.keys(combo.factors || {}).forEach(caseName => {
      if (!caseNames.has(caseName)) {
        errors.push({ path: `${path}.factors`, message: `존재하지 않는 하중 케이스: ${caseName}`, severity: 'error' });
      }
    });
  });

  return errors;
}

function validateStructuralStability(model: StanalModel): ValidationError[] {
  const errors: ValidationError[] = [];

  // 기본 안정성 검사
  const supports = model.supports || [];

  if (supports.length === 0) {
    errors.push({ path: 'supports', message: '지지 조건이 정의되지 않았습니다. 구조물이 불안정합니다.', severity: 'error' });
    return errors;
  }

  // 3D 구조물의 최소 지지 조건 확인 (간단한 검사)
  let totalDx = 0, totalDy = 0, totalDz = 0;
  let totalRx = 0, totalRy = 0, totalRz = 0;

  supports.forEach(s => {
    if (s.dx) {totalDx++;}
    if (s.dy) {totalDy++;}
    if (s.dz) {totalDz++;}
    if (s.rx) {totalRx++;}
    if (s.ry) {totalRy++;}
    if (s.rz) {totalRz++;}
  });

  // 강체 이동 방지 (최소 3개 변위 구속)
  if (totalDx === 0) {
    errors.push({ path: 'supports', message: 'X 방향 변위 구속이 없습니다.', severity: 'error' });
  }
  if (totalDy === 0) {
    errors.push({ path: 'supports', message: 'Y 방향 변위 구속이 없습니다.', severity: 'error' });
  }
  if (totalDz === 0) {
    errors.push({ path: 'supports', message: 'Z 방향 변위 구속이 없습니다.', severity: 'error' });
  }

  return errors;
}
