/**
 * STANAL 3D Beam Element
 * 3D 보 요소의 강성 행렬 및 고정단 반력 계산
 */

import { Matrix, createTransformationMatrix } from './Matrix';
import { Member, Node, Material, Section, MemberLoad } from '../model/types';

export class Member3DElement {
  public readonly id: string;
  public readonly iNode: Node;
  public readonly jNode: Node;
  public readonly material: Material;
  public readonly section: Section;
  public readonly rotation: number;
  public readonly length: number;

  constructor(
    member: Member,
    iNode: Node,
    jNode: Node,
    material: Material,
    section: Section
  ) {
    this.id = member.id;
    this.iNode = iNode;
    this.jNode = jNode;
    this.material = material;
    this.section = section;
    this.rotation = member.rotation || 0;

    // 부재 길이 계산
    const dx = jNode.x - iNode.x;
    const dy = jNode.y - iNode.y;
    const dz = jNode.z - iNode.z;
    this.length = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (this.length < 1e-10) {
      throw new Error(`Member ${member.id} has zero length`);
    }
  }

  /**
   * 국부 좌표계 강성 행렬 (12x12)
   * DOF 순서: [dx, dy, dz, rx, ry, rz] for each node
   */
  localStiffnessMatrix(): Matrix {
    const E = this.material.E;
    const G = this.material.G;
    const A = this.section.A;
    const Iy = this.section.Iy;
    const Iz = this.section.Iz;
    const J = this.section.J;
    const L = this.length;

    const L2 = L * L;
    const L3 = L2 * L;

    // 축방향 강성
    const EA_L = E * A / L;

    // 비틀림 강성
    const GJ_L = G * J / L;

    // Y축 굽힘 강성 (Iz 사용)
    const EIz = E * Iz;
    const k_y1 = 12 * EIz / L3;
    const k_y2 = 6 * EIz / L2;
    const k_y3 = 4 * EIz / L;
    const k_y4 = 2 * EIz / L;

    // Z축 굽힘 강성 (Iy 사용)
    const EIy = E * Iy;
    const k_z1 = 12 * EIy / L3;
    const k_z2 = 6 * EIy / L2;
    const k_z3 = 4 * EIy / L;
    const k_z4 = 2 * EIy / L;

    // 12x12 강성 행렬 조립
    const k = Matrix.zeros(12, 12);

    // 축방향 (DOF 0, 6)
    k.set(0, 0, EA_L);
    k.set(0, 6, -EA_L);
    k.set(6, 0, -EA_L);
    k.set(6, 6, EA_L);

    // Y 방향 전단 및 Z축 회전 (DOF 1, 5, 7, 11)
    k.set(1, 1, k_y1);
    k.set(1, 5, k_y2);
    k.set(1, 7, -k_y1);
    k.set(1, 11, k_y2);

    k.set(5, 1, k_y2);
    k.set(5, 5, k_y3);
    k.set(5, 7, -k_y2);
    k.set(5, 11, k_y4);

    k.set(7, 1, -k_y1);
    k.set(7, 5, -k_y2);
    k.set(7, 7, k_y1);
    k.set(7, 11, -k_y2);

    k.set(11, 1, k_y2);
    k.set(11, 5, k_y4);
    k.set(11, 7, -k_y2);
    k.set(11, 11, k_y3);

    // Z 방향 전단 및 Y축 회전 (DOF 2, 4, 8, 10)
    k.set(2, 2, k_z1);
    k.set(2, 4, -k_z2);
    k.set(2, 8, -k_z1);
    k.set(2, 10, -k_z2);

    k.set(4, 2, -k_z2);
    k.set(4, 4, k_z3);
    k.set(4, 8, k_z2);
    k.set(4, 10, k_z4);

    k.set(8, 2, -k_z1);
    k.set(8, 4, k_z2);
    k.set(8, 8, k_z1);
    k.set(8, 10, k_z2);

    k.set(10, 2, -k_z2);
    k.set(10, 4, k_z4);
    k.set(10, 8, k_z2);
    k.set(10, 10, k_z3);

    // 비틀림 (DOF 3, 9)
    k.set(3, 3, GJ_L);
    k.set(3, 9, -GJ_L);
    k.set(9, 3, -GJ_L);
    k.set(9, 9, GJ_L);

    return k;
  }

  /**
   * 좌표 변환 행렬
   */
  transformationMatrix(): Matrix {
    return createTransformationMatrix(this.iNode, this.jNode, this.rotation);
  }

  /**
   * 전역 좌표계 강성 행렬
   * K_global = T^T * K_local * T
   */
  globalStiffnessMatrix(): Matrix {
    const kLocal = this.localStiffnessMatrix();
    const T = this.transformationMatrix();
    const Tt = T.transpose();

    return Tt.multiply(kLocal).multiply(T);
  }

  /**
   * 고정단 반력 계산 (분포하중)
   * 국부 좌표계에서 계산 후 전역으로 변환
   */
  fixedEndReactions(memberLoads: MemberLoad[]): number[] {
    const L = this.length;
    const fer = new Array(12).fill(0);

    for (const load of memberLoads) {
      if (load.member !== this.id) {continue;}

      const dir = load.direction.toUpperCase();

      if (load.type === 'distributed') {
        const w1 = load.w1 || 0;
        const w2 = load.w2 ?? w1;
        const x1 = (load.x1 || 0) * L;
        const x2 = (load.x2 ?? 1) * L;
        const loadLength = x2 - x1;

        if (Math.abs(w1 - w2) < 1e-10) {
          // 균등 분포하중
          this.addUniformLoadFER(fer, dir, w1, x1, x2, L);
        } else {
          // 선형 분포하중 (사다리꼴)
          this.addLinearLoadFER(fer, dir, w1, w2, x1, x2, L);
        }
      } else if (load.type === 'point') {
        const P = load.magnitude || 0;
        const x = (load.x || 0.5) * L;
        this.addPointLoadFER(fer, dir, P, x, L);
      }
    }

    // 국부 → 전역 변환
    const T = this.transformationMatrix();
    const ferLocal = Matrix.fromArray([fer]).transpose();
    const ferGlobal = T.transpose().multiply(ferLocal);

    return Array.from({ length: 12 }, (_, i) => ferGlobal.get(i, 0));
  }

  /**
   * 균등 분포하중에 대한 고정단 반력
   */
  private addUniformLoadFER(
    fer: number[],
    direction: string,
    w: number,
    x1: number,
    x2: number,
    L: number
  ): void {
    // 전체 길이 분포하중인 경우 간단한 공식 사용
    if (Math.abs(x1) < 1e-10 && Math.abs(x2 - L) < 1e-10) {
      const wL = w * L;
      const wL2 = w * L * L;

      switch (direction) {
        case 'FY':
          fer[1] += wL / 2;
          fer[5] += wL2 / 12;
          fer[7] += wL / 2;
          fer[11] += -wL2 / 12;
          break;
        case 'FZ':
          fer[2] += wL / 2;
          fer[4] += -wL2 / 12;
          fer[8] += wL / 2;
          fer[10] += wL2 / 12;
          break;
        case 'FX':
          fer[0] += wL / 2;
          fer[6] += wL / 2;
          break;
      }
    } else {
      // 부분 분포하중 - 적분으로 계산
      const a = x1;
      const b = x2;
      const loadLen = b - a;

      switch (direction) {
        case 'FY': {
          // 전단력과 모멘트에 대한 고정단 반력
          const R1 = w * loadLen * (L - (a + b) / 2) / L;
          const R2 = w * loadLen - R1;
          const M1 = w * loadLen * ((a + b) / 2 - a * (L - (a + b) / 2) / L);
          fer[1] += R1;
          fer[7] += R2;
          fer[5] += M1;
          fer[11] += -M1;
          break;
        }
        case 'FZ': {
          const R1 = w * loadLen * (L - (a + b) / 2) / L;
          const R2 = w * loadLen - R1;
          fer[2] += R1;
          fer[8] += R2;
          break;
        }
        case 'FX': {
          const R1 = w * loadLen * (L - (a + b) / 2) / L;
          const R2 = w * loadLen - R1;
          fer[0] += R1;
          fer[6] += R2;
          break;
        }
      }
    }
  }

  /**
   * 선형 분포하중에 대한 고정단 반력
   */
  private addLinearLoadFER(
    fer: number[],
    direction: string,
    w1: number,
    w2: number,
    x1: number,
    x2: number,
    L: number
  ): void {
    // 균등 부분 + 삼각형 부분으로 분리
    const wMin = Math.min(w1, w2);
    const wDiff = Math.abs(w2 - w1);

    // 균등 부분
    this.addUniformLoadFER(fer, direction, wMin, x1, x2, L);

    // 삼각형 부분 (근사)
    const wAvg = wDiff / 2;
    this.addUniformLoadFER(fer, direction, wAvg, x1, x2, L);
  }

  /**
   * 점하중에 대한 고정단 반력
   */
  private addPointLoadFER(
    fer: number[],
    direction: string,
    P: number,
    a: number,
    L: number
  ): void {
    const b = L - a;
    const L2 = L * L;
    const L3 = L2 * L;

    switch (direction) {
      case 'FY':
        fer[1] += P * b * b * (3 * a + b) / L3;
        fer[5] += P * a * b * b / L2;
        fer[7] += P * a * a * (a + 3 * b) / L3;
        fer[11] += -P * a * a * b / L2;
        break;
      case 'FZ':
        fer[2] += P * b * b * (3 * a + b) / L3;
        fer[4] += -P * a * b * b / L2;
        fer[8] += P * a * a * (a + 3 * b) / L3;
        fer[10] += P * a * a * b / L2;
        break;
      case 'FX':
        fer[0] += P * b / L;
        fer[6] += P * a / L;
        break;
      case 'MZ':
        fer[1] += 6 * P * a * b / L3;
        fer[5] += P * b * (2 * a - b) / L2;
        fer[7] += -6 * P * a * b / L3;
        fer[11] += P * a * (2 * b - a) / L2;
        break;
      case 'MY':
        fer[2] += -6 * P * a * b / L3;
        fer[4] += P * b * (2 * a - b) / L2;
        fer[8] += 6 * P * a * b / L3;
        fer[10] += P * a * (2 * b - a) / L2;
        break;
      case 'MX':
        fer[3] += P * b / L;
        fer[9] += P * a / L;
        break;
    }
  }

  /**
   * 부재력 계산 (해석 후)
   */
  computeMemberForces(
    displacements: number[],
    memberLoads: MemberLoad[],
    numPoints: number = 11
  ): { x: number; forces: number[] }[] {
    const T = this.transformationMatrix();
    const kLocal = this.localStiffnessMatrix();

    // 전역 변위 → 국부 변위
    const dGlobal = Matrix.fromArray([displacements]).transpose();
    const dLocal = T.multiply(dGlobal);

    // 국부 좌표계에서의 부재단 내력
    const fLocal = kLocal.multiply(dLocal);

    // 고정단 반력 추가
    const fer = this.fixedEndReactions(memberLoads);
    const ferLocal = Matrix.fromArray([fer]).transpose();
    const ferLocalTransformed = T.multiply(ferLocal);

    // 결과 저장
    const results: { x: number; forces: number[] }[] = [];

    for (let i = 0; i <= numPoints; i++) {
      const x = (i / numPoints) * this.length;
      // 간단한 선형 보간 (더 정확한 계산은 세그먼트별 적분 필요)
      const ratio = x / this.length;

      results.push({
        x,
        forces: [
          fLocal.get(0, 0) * (1 - ratio) + fLocal.get(6, 0) * ratio,  // 축력
          fLocal.get(1, 0) * (1 - ratio) + fLocal.get(7, 0) * ratio,  // Y 전단력
          fLocal.get(2, 0) * (1 - ratio) + fLocal.get(8, 0) * ratio,  // Z 전단력
          fLocal.get(3, 0) * (1 - ratio) + fLocal.get(9, 0) * ratio,  // 비틀림
          fLocal.get(4, 0) * (1 - ratio) + fLocal.get(10, 0) * ratio, // Y 모멘트
          fLocal.get(5, 0) * (1 - ratio) + fLocal.get(11, 0) * ratio  // Z 모멘트
        ]
      });
    }

    return results;
  }
}
