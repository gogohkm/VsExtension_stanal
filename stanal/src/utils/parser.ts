/**
 * STANAL JSON Parser
 * .stanal 파일을 파싱하여 StanalModel 객체로 변환
 */

import { StanalModel } from '../model/types';
import { validateModel, ValidationError } from './validator';

export interface ParseResult {
  success: boolean;
  model?: StanalModel;
  errors: ParseError[];
}

export interface ParseError {
  line?: number;
  column?: number;
  message: string;
}

/**
 * JSON 문자열을 StanalModel로 파싱
 */
export function parseStanalFile(content: string): ParseResult {
  const errors: ParseError[] = [];

  // 1. JSON 파싱
  let rawData: unknown;
  try {
    rawData = JSON.parse(content);
  } catch (e) {
    const jsonError = e as SyntaxError;
    // JSON 에러에서 위치 정보 추출 시도
    const posMatch = jsonError.message.match(/position (\d+)/);
    let line = 1;
    let column = 1;

    if (posMatch) {
      const position = parseInt(posMatch[1], 10);
      const lines = content.substring(0, position).split('\n');
      line = lines.length;
      column = lines[lines.length - 1].length + 1;
    }

    return {
      success: false,
      errors: [{
        line,
        column,
        message: `JSON 파싱 오류: ${jsonError.message}`
      }]
    };
  }

  // 2. 기본 구조 검증 및 변환
  const model = rawData as StanalModel;

  // 3. 모델 유효성 검사
  const validationErrors = validateModel(model);

  if (validationErrors.length > 0) {
    return {
      success: false,
      model,
      errors: validationErrors.map(ve => ({
        message: ve.message,
        line: ve.path ? findLineNumber(content, ve.path) : undefined
      }))
    };
  }

  return {
    success: true,
    model,
    errors: []
  };
}

/**
 * JSON 경로로부터 라인 번호 찾기 (간단한 구현)
 */
function findLineNumber(content: string, path: string): number | undefined {
  const pathParts = path.split('.');
  let searchKey = pathParts[pathParts.length - 1];

  // 배열 인덱스 처리
  const arrayMatch = searchKey.match(/\[(\d+)\]/);
  if (arrayMatch) {
    searchKey = pathParts[pathParts.length - 2] || searchKey;
  }

  const regex = new RegExp(`"${searchKey}"\\s*:`);
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i])) {
      return i + 1;
    }
  }

  return undefined;
}

/**
 * StanalModel을 JSON 문자열로 직렬화
 */
export function serializeModel(model: StanalModel): string {
  return JSON.stringify(model, null, 2);
}

/**
 * 기본 모델 템플릿 생성
 */
export function createDefaultModel(): StanalModel {
  return {
    model: {
      name: "New Model",
      units: {
        length: "mm",
        force: "kN"
      }
    },
    materials: [
      {
        id: "Steel",
        E: 210000,
        G: 81000,
        nu: 0.3,
        rho: 7.85e-9
      }
    ],
    sections: [
      {
        id: "Default",
        A: 1000,
        Iy: 1e6,
        Iz: 1e6,
        J: 1e5
      }
    ],
    nodes: [],
    members: [],
    supports: [],
    loadCases: [
      {
        name: "Dead",
        nodeLoads: [],
        memberLoads: []
      }
    ],
    loadCombinations: [
      {
        name: "1.0D",
        factors: { "Dead": 1.0 }
      }
    ]
  };
}
