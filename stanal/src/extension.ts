/**
 * STANAL - Structural Analysis Extension
 * VSCode Extension for 3D Structural Analysis
 */

import * as vscode from 'vscode';
import { parseStanalFile, createDefaultModel, serializeModel } from './utils/parser';
import { StanalModel, AnalysisResult } from './model/types';
import { PreviewPanel } from './visualization/PreviewPanel';
import { Analyzer } from './analysis/Analyzer';

// 전역 상태
let currentModel: StanalModel | undefined;
let currentResults: Map<string, AnalysisResult> = new Map();
let diagnosticCollection: vscode.DiagnosticCollection;

export function activate(context: vscode.ExtensionContext) {
	console.log('STANAL Extension is now active!');

	// 진단 컬렉션 생성
	diagnosticCollection = vscode.languages.createDiagnosticCollection('stanal');
	context.subscriptions.push(diagnosticCollection);

	// 명령어 등록
	context.subscriptions.push(
		vscode.commands.registerCommand('stanal.showPreview', () => showPreview(context)),
		vscode.commands.registerCommand('stanal.runAnalysis', () => runAnalysis()),
		vscode.commands.registerCommand('stanal.showResults', () => showResults()),
		vscode.commands.registerCommand('stanal.newModel', () => createNewModel())
	);

	// 문서 변경 시 자동 검증
	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument(event => {
			if (event.document.languageId === 'stanal') {
				validateDocument(event.document);
			}
		})
	);

	// 문서 열기 시 검증
	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument(document => {
			if (document.languageId === 'stanal') {
				validateDocument(document);
			}
		})
	);

	// 현재 열린 .stanal 파일 검증
	vscode.workspace.textDocuments.forEach(doc => {
		if (doc.languageId === 'stanal') {
			validateDocument(doc);
		}
	});
}

/**
 * 문서 유효성 검사 및 진단 업데이트
 */
function validateDocument(document: vscode.TextDocument) {
	const result = parseStanalFile(document.getText());
	const diagnostics: vscode.Diagnostic[] = [];

	result.errors.forEach(error => {
		const line = (error.line || 1) - 1;
		const range = new vscode.Range(
			new vscode.Position(line, 0),
			new vscode.Position(line, Number.MAX_VALUE)
		);

		const diagnostic = new vscode.Diagnostic(
			range,
			error.message,
			vscode.DiagnosticSeverity.Error
		);
		diagnostic.source = 'stanal';
		diagnostics.push(diagnostic);
	});

	diagnosticCollection.set(document.uri, diagnostics);

	if (result.success && result.model) {
		currentModel = result.model;
	}
}

/**
 * 3D 미리보기 패널 표시
 */
async function showPreview(context: vscode.ExtensionContext) {
	const editor = vscode.window.activeTextEditor;

	if (!editor || editor.document.languageId !== 'stanal') {
		vscode.window.showWarningMessage('Please open a .stanal file first.');
		return;
	}

	const result = parseStanalFile(editor.document.getText());

	if (!result.success || !result.model) {
		vscode.window.showErrorMessage('Failed to parse model. Please fix errors first.');
		return;
	}

	currentModel = result.model;
	PreviewPanel.createOrShow(context.extensionUri, currentModel, currentResults);
}

/**
 * 구조 해석 실행
 */
async function runAnalysis() {
	const editor = vscode.window.activeTextEditor;

	if (!editor || editor.document.languageId !== 'stanal') {
		vscode.window.showWarningMessage('Please open a .stanal file first.');
		return;
	}

	const result = parseStanalFile(editor.document.getText());

	if (!result.success || !result.model) {
		vscode.window.showErrorMessage('Failed to parse model. Please fix errors first.');
		return;
	}

	currentModel = result.model;

	// 해석 실행
	await vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: 'Running Structural Analysis',
		cancellable: false
	}, async (progress) => {
		progress.report({ message: 'Assembling stiffness matrix...' });

		try {
			const analyzer = new Analyzer(currentModel!);
			currentResults = new Map();

			// 각 하중 조합에 대해 해석
			const combinations = currentModel!.loadCombinations || [];

			for (let i = 0; i < combinations.length; i++) {
				const combo = combinations[i];
				progress.report({
					message: `Analyzing ${combo.name}...`,
					increment: (100 / combinations.length)
				});

				const analysisResult = analyzer.analyze(combo.name);
				currentResults.set(combo.name, analysisResult);
			}

			vscode.window.showInformationMessage(`Analysis completed for ${combinations.length} load combination(s). Use "Show Results" to see details.`);

			// 미리보기 패널 업데이트
			if (PreviewPanel.currentPanel) {
				PreviewPanel.currentPanel.updateResults(currentResults);
			}

			// 자동으로 결과 표시
			showResults();

		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			vscode.window.showErrorMessage(`Analysis failed: ${errorMessage}`);
		}
	});
}

/**
 * 결과 패널 표시
 */
function showResults() {
	if (currentResults.size === 0) {
		vscode.window.showWarningMessage('No analysis results available. Run analysis first.');
		return;
	}

	// 결과 요약 표시 (간단한 출력 채널 사용)
	const outputChannel = vscode.window.createOutputChannel('STANAL Results');
	outputChannel.clear();
	outputChannel.show();

	currentResults.forEach((result, comboName) => {
		outputChannel.appendLine(`\n${'='.repeat(50)}`);
		outputChannel.appendLine(`Load Combination: ${comboName}`);
		outputChannel.appendLine('='.repeat(50));

		if (!result.success) {
			outputChannel.appendLine(`Error: ${result.error}`);
			return;
		}

		outputChannel.appendLine('\n--- Node Displacements ---');
		result.nodes.forEach(node => {
			const d = node.displacement;
			outputChannel.appendLine(
				`${node.nodeId}: dx=${d.dx.toExponential(3)}, dy=${d.dy.toExponential(3)}, dz=${d.dz.toExponential(3)}`
			);
		});

		outputChannel.appendLine('\n--- Node Reactions ---');
		result.nodes.forEach(node => {
			const r = node.reaction;
			if (Math.abs(r.dx) > 1e-10 || Math.abs(r.dy) > 1e-10 || Math.abs(r.dz) > 1e-10) {
				outputChannel.appendLine(
					`${node.nodeId}: Fx=${r.dx.toFixed(3)}, Fy=${r.dy.toFixed(3)}, Fz=${r.dz.toFixed(3)}`
				);
			}
		});

		outputChannel.appendLine('\n--- Summary ---');
		const s = result.summary;
		outputChannel.appendLine(`Max Displacement: ${s.maxDisplacement.value.toExponential(3)} at ${s.maxDisplacement.nodeId} (${s.maxDisplacement.direction})`);
		outputChannel.appendLine(`Max Reaction: ${s.maxReaction.value.toFixed(3)} at ${s.maxReaction.nodeId} (${s.maxReaction.direction})`);
	});
}

/**
 * 새 모델 생성
 */
async function createNewModel() {
	const fileName = await vscode.window.showInputBox({
		prompt: 'Enter file name for new model',
		value: 'new_model.stanal'
	});

	if (!fileName) {
		return;
	}

	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders) {
		vscode.window.showErrorMessage('Please open a folder first.');
		return;
	}

	const filePath = vscode.Uri.joinPath(workspaceFolders[0].uri, fileName);
	const defaultModel = createDefaultModel();
	const content = serializeModel(defaultModel);

	await vscode.workspace.fs.writeFile(filePath, Buffer.from(content, 'utf8'));

	const document = await vscode.workspace.openTextDocument(filePath);
	await vscode.window.showTextDocument(document);

	vscode.window.showInformationMessage(`Created new model: ${fileName}`);
}

export function deactivate() {
	if (diagnosticCollection) {
		diagnosticCollection.dispose();
	}
}
