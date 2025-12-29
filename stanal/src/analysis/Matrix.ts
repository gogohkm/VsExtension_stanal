/**
 * STANAL Matrix Operations
 * 행렬 연산을 위한 유틸리티 클래스
 */

export class Matrix {
  private data: number[][];
  public readonly rows: number;
  public readonly cols: number;

  constructor(rows: number, cols: number, initialValue: number = 0) {
    this.rows = rows;
    this.cols = cols;
    this.data = Array(rows).fill(null).map(() => Array(cols).fill(initialValue));
  }

  /**
   * 2차원 배열로부터 행렬 생성
   */
  static fromArray(arr: number[][]): Matrix {
    const rows = arr.length;
    const cols = arr[0]?.length || 0;
    const m = new Matrix(rows, cols);
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        m.set(i, j, arr[i][j] || 0);
      }
    }
    return m;
  }

  /**
   * 단위 행렬 생성
   */
  static identity(n: number): Matrix {
    const m = new Matrix(n, n);
    for (let i = 0; i < n; i++) {
      m.set(i, i, 1);
    }
    return m;
  }

  /**
   * 영 행렬 생성
   */
  static zeros(rows: number, cols: number): Matrix {
    return new Matrix(rows, cols, 0);
  }

  /**
   * 값 가져오기
   */
  get(row: number, col: number): number {
    return this.data[row][col];
  }

  /**
   * 값 설정
   */
  set(row: number, col: number, value: number): void {
    this.data[row][col] = value;
  }

  /**
   * 값 더하기
   */
  add(row: number, col: number, value: number): void {
    this.data[row][col] += value;
  }

  /**
   * 행렬 덧셈
   */
  plus(other: Matrix): Matrix {
    if (this.rows !== other.rows || this.cols !== other.cols) {
      throw new Error('Matrix dimensions must match for addition');
    }
    const result = new Matrix(this.rows, this.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.set(i, j, this.get(i, j) + other.get(i, j));
      }
    }
    return result;
  }

  /**
   * 행렬 뺄셈
   */
  minus(other: Matrix): Matrix {
    if (this.rows !== other.rows || this.cols !== other.cols) {
      throw new Error('Matrix dimensions must match for subtraction');
    }
    const result = new Matrix(this.rows, this.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.set(i, j, this.get(i, j) - other.get(i, j));
      }
    }
    return result;
  }

  /**
   * 스칼라 곱
   */
  scale(scalar: number): Matrix {
    const result = new Matrix(this.rows, this.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.set(i, j, this.get(i, j) * scalar);
      }
    }
    return result;
  }

  /**
   * 행렬 곱셈
   */
  multiply(other: Matrix): Matrix {
    if (this.cols !== other.rows) {
      throw new Error(`Cannot multiply ${this.rows}x${this.cols} with ${other.rows}x${other.cols}`);
    }
    const result = new Matrix(this.rows, other.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < other.cols; j++) {
        let sum = 0;
        for (let k = 0; k < this.cols; k++) {
          sum += this.get(i, k) * other.get(k, j);
        }
        result.set(i, j, sum);
      }
    }
    return result;
  }

  /**
   * 벡터와의 곱셈
   */
  multiplyVector(vec: number[]): number[] {
    if (this.cols !== vec.length) {
      throw new Error('Vector length must match matrix columns');
    }
    const result: number[] = new Array(this.rows).fill(0);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result[i] += this.get(i, j) * vec[j];
      }
    }
    return result;
  }

  /**
   * 전치 행렬
   */
  transpose(): Matrix {
    const result = new Matrix(this.cols, this.rows);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.set(j, i, this.get(i, j));
      }
    }
    return result;
  }

  /**
   * 부분 행렬 추출
   */
  subMatrix(rowIndices: number[], colIndices: number[]): Matrix {
    const result = new Matrix(rowIndices.length, colIndices.length);
    for (let i = 0; i < rowIndices.length; i++) {
      for (let j = 0; j < colIndices.length; j++) {
        result.set(i, j, this.get(rowIndices[i], colIndices[j]));
      }
    }
    return result;
  }

  /**
   * 벡터 부분 추출
   */
  static extractVector(vec: number[], indices: number[]): number[] {
    return indices.map(i => vec[i]);
  }

  /**
   * 벡터 값 설정
   */
  static setVector(vec: number[], indices: number[], values: number[]): void {
    for (let i = 0; i < indices.length; i++) {
      vec[indices[i]] = values[i];
    }
  }

  /**
   * LU 분해를 이용한 선형 시스템 해법 (Ax = b)
   * Partial pivoting 사용
   */
  solve(b: number[]): number[] {
    if (this.rows !== this.cols) {
      throw new Error('Matrix must be square for solving');
    }
    if (this.rows !== b.length) {
      throw new Error('Vector b length must match matrix rows');
    }

    const n = this.rows;
    const A = this.clone();
    const x = [...b];

    // LU 분해 with partial pivoting
    const pivot: number[] = new Array(n).fill(0).map((_, i) => i);

    for (let k = 0; k < n - 1; k++) {
      // Find pivot
      let maxVal = Math.abs(A.get(k, k));
      let maxRow = k;
      for (let i = k + 1; i < n; i++) {
        if (Math.abs(A.get(i, k)) > maxVal) {
          maxVal = Math.abs(A.get(i, k));
          maxRow = i;
        }
      }

      // Swap rows
      if (maxRow !== k) {
        for (let j = 0; j < n; j++) {
          const temp = A.get(k, j);
          A.set(k, j, A.get(maxRow, j));
          A.set(maxRow, j, temp);
        }
        const temp = x[k];
        x[k] = x[maxRow];
        x[maxRow] = temp;
        const tempPivot = pivot[k];
        pivot[k] = pivot[maxRow];
        pivot[maxRow] = tempPivot;
      }

      // Elimination
      const akk = A.get(k, k);
      if (Math.abs(akk) < 1e-12) {
        throw new Error('Matrix is singular or nearly singular');
      }

      for (let i = k + 1; i < n; i++) {
        const factor = A.get(i, k) / akk;
        A.set(i, k, factor);
        for (let j = k + 1; j < n; j++) {
          A.set(i, j, A.get(i, j) - factor * A.get(k, j));
        }
        x[i] = x[i] - factor * x[k];
      }
    }

    // Check last diagonal
    if (Math.abs(A.get(n - 1, n - 1)) < 1e-12) {
      throw new Error('Matrix is singular or nearly singular');
    }

    // Back substitution
    for (let i = n - 1; i >= 0; i--) {
      for (let j = i + 1; j < n; j++) {
        x[i] -= A.get(i, j) * x[j];
      }
      x[i] /= A.get(i, i);
    }

    return x;
  }

  /**
   * 행렬 복사
   */
  clone(): Matrix {
    const result = new Matrix(this.rows, this.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.set(i, j, this.get(i, j));
      }
    }
    return result;
  }

  /**
   * 2차원 배열로 변환
   */
  toArray(): number[][] {
    return this.data.map(row => [...row]);
  }

  /**
   * 콘솔 출력
   */
  print(precision: number = 4): void {
    console.log(`Matrix ${this.rows}x${this.cols}:`);
    for (let i = 0; i < this.rows; i++) {
      console.log(this.data[i].map(v => v.toFixed(precision)).join('\t'));
    }
  }
}

/**
 * 3x3 회전 행렬 생성 (국부 좌표계 → 전역 좌표계)
 */
export function createRotationMatrix(
  iNode: { x: number; y: number; z: number },
  jNode: { x: number; y: number; z: number },
  rotation: number = 0  // degrees
): Matrix {
  // 부재 방향 벡터
  const dx = jNode.x - iNode.x;
  const dy = jNode.y - iNode.y;
  const dz = jNode.z - iNode.z;
  const L = Math.sqrt(dx * dx + dy * dy + dz * dz);

  if (L < 1e-10) {
    throw new Error('Member has zero length');
  }

  // 방향 코사인
  const cx = dx / L;
  const cy = dy / L;
  const cz = dz / L;

  // 국부 x축 (부재 축)
  const xLocal = [cx, cy, cz];

  // 국부 y축 계산
  let yLocal: number[];
  const horizontalLength = Math.sqrt(cx * cx + cz * cz);

  if (horizontalLength < 1e-10) {
    // 수직 부재
    yLocal = cy > 0 ? [-1, 0, 0] : [1, 0, 0];
  } else {
    // 일반 부재 - 전역 Y축과의 외적
    yLocal = [
      -cy * cx / horizontalLength,
      horizontalLength,
      -cy * cz / horizontalLength
    ];
  }

  // 국부 z축 (x × y)
  const zLocal = [
    xLocal[1] * yLocal[2] - xLocal[2] * yLocal[1],
    xLocal[2] * yLocal[0] - xLocal[0] * yLocal[2],
    xLocal[0] * yLocal[1] - xLocal[1] * yLocal[0]
  ];

  // 회전 적용 (부재 축 주위)
  if (Math.abs(rotation) > 1e-10) {
    const rad = rotation * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const yNew = [
      yLocal[0] * cos + zLocal[0] * sin,
      yLocal[1] * cos + zLocal[1] * sin,
      yLocal[2] * cos + zLocal[2] * sin
    ];
    const zNew = [
      -yLocal[0] * sin + zLocal[0] * cos,
      -yLocal[1] * sin + zLocal[1] * cos,
      -yLocal[2] * sin + zLocal[2] * cos
    ];

    yLocal = yNew;
    zLocal.splice(0, 3, ...zNew);
  }

  // 3x3 회전 행렬 (행: 전역, 열: 국부)
  return Matrix.fromArray([
    xLocal,
    yLocal,
    zLocal
  ]).transpose();
}

/**
 * 12x12 좌표 변환 행렬 생성 (부재용)
 */
export function createTransformationMatrix(
  iNode: { x: number; y: number; z: number },
  jNode: { x: number; y: number; z: number },
  rotation: number = 0
): Matrix {
  const R = createRotationMatrix(iNode, jNode, rotation);
  const T = Matrix.zeros(12, 12);

  // 4개의 3x3 블록 대각 행렬
  for (let block = 0; block < 4; block++) {
    const offset = block * 3;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        T.set(offset + i, offset + j, R.get(i, j));
      }
    }
  }

  return T;
}
