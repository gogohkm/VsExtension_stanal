/**
 * STANAL Preview Panel
 * WebView 기반 3D 미리보기 패널
 */

import * as vscode from 'vscode';
import { StanalModel, AnalysisResult } from '../model/types';

export class PreviewPanel {
  public static currentPanel: PreviewPanel | undefined;
  private static readonly viewType = 'stanalPreview';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _model: StanalModel;
  private _results: Map<string, AnalysisResult>;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(
    extensionUri: vscode.Uri,
    model: StanalModel,
    results: Map<string, AnalysisResult>
  ) {
    const column = vscode.ViewColumn.Beside;

    if (PreviewPanel.currentPanel) {
      PreviewPanel.currentPanel._panel.reveal(column);
      PreviewPanel.currentPanel.updateModel(model);
      PreviewPanel.currentPanel.updateResults(results);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      PreviewPanel.viewType,
      'STANAL 3D Preview',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri]
      }
    );

    PreviewPanel.currentPanel = new PreviewPanel(panel, extensionUri, model, results);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    model: StanalModel,
    results: Map<string, AnalysisResult>
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._model = model;
    this._results = results;

    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      message => {
        console.log('Received message from webview:', message);
        switch (message.command) {
          case 'ready':
            console.log('WebView ready, sending model...');
            this._sendModelToWebview();
            if (this._results.size > 0) {
              this._sendResultsToWebview();
            }
            break;
          case 'selectElement':
            vscode.window.showInformationMessage(`Selected: ${message.elementType} ${message.elementId}`);
            break;
          case 'log':
            console.log('WebView log:', message.data);
            break;
        }
      },
      null,
      this._disposables
    );
  }

  public updateModel(model: StanalModel) {
    this._model = model;
    this._sendModelToWebview();
  }

  public updateResults(results: Map<string, AnalysisResult>) {
    this._results = results;
    this._sendResultsToWebview();
  }

  private _sendModelToWebview() {
    this._panel.webview.postMessage({
      type: 'updateModel',
      payload: this._model
    });
  }

  private _sendResultsToWebview() {
    const resultsObj: { [key: string]: AnalysisResult } = {};
    this._results.forEach((value, key) => {
      resultsObj[key] = value;
    });

    this._panel.webview.postMessage({
      type: 'updateResults',
      payload: resultsObj
    });
  }

  private _update() {
    this._panel.webview.html = this._getHtmlForWebview();
  }

  private _getHtmlForWebview(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com;">
  <title>STANAL 3D Preview</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      overflow: hidden;
      background: #1e1e1e;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    #container {
      width: 100vw;
      height: 100vh;
    }
    #controls {
      position: absolute;
      top: 10px;
      left: 10px;
      background: rgba(30, 30, 30, 0.9);
      padding: 10px;
      border-radius: 5px;
      color: #ccc;
      font-size: 12px;
      z-index: 100;
    }
    #controls button {
      background: #0e639c;
      color: white;
      border: none;
      padding: 5px 10px;
      margin: 2px;
      border-radius: 3px;
      cursor: pointer;
    }
    #controls button:hover {
      background: #1177bb;
    }
    #controls button.active {
      background: #14a32a;
    }
    #info {
      position: absolute;
      bottom: 10px;
      left: 10px;
      background: rgba(30, 30, 30, 0.9);
      padding: 10px;
      border-radius: 5px;
      color: #ccc;
      font-size: 11px;
      max-width: 300px;
    }
    #loading {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: #ccc;
      font-size: 18px;
    }
    .control-group {
      margin-bottom: 8px;
    }
    .control-group label {
      display: block;
      margin-bottom: 4px;
      color: #888;
    }
    select {
      background: #3c3c3c;
      color: #ccc;
      border: 1px solid #555;
      padding: 4px 8px;
      border-radius: 3px;
      width: 100%;
    }
    input[type="range"] {
      width: 100%;
    }
  </style>
</head>
<body>
  <div id="loading">Loading 3D Viewer...</div>
  <div id="container"></div>
  <div id="controls">
    <div class="control-group">
      <label>View Mode</label>
      <button id="btnModel" class="active">Model</button>
      <button id="btnDeformed">Deformed</button>
    </div>
    <div class="control-group">
      <label>Load Combination</label>
      <select id="comboSelect">
        <option value="">-- Select --</option>
      </select>
    </div>
    <div class="control-group" id="scaleGroup" style="display:none;">
      <label>Deformation Scale: <span id="scaleValue">10</span></label>
      <input type="range" id="scaleSlider" min="1" max="100" value="10">
    </div>
    <div class="control-group">
      <button id="btnResetView">Reset View</button>
      <button id="btnFit">Fit All</button>
    </div>
  </div>
  <div id="info">
    <div id="modelInfo">No model loaded</div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
  <script>
    (function() {
    const vscode = acquireVsCodeApi();

    // 디버그 로깅
    function log(msg) {
      console.log('[STANAL WebView]', msg);
      vscode.postMessage({ command: 'log', data: msg });
    }

    let scene, camera, renderer, controls;
    let modelGroup, deformedGroup;
    let currentModel = null;
    let currentResults = null;
    let viewMode = 'model';
    let deformationScale = 10;
    let selectedCombo = '';

    // 초기화
    function init() {
      const container = document.getElementById('container');
      const loading = document.getElementById('loading');

      // Scene
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x1e1e1e);

      // Camera
      camera = new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        0.1,
        100000
      );
      camera.position.set(5000, 5000, 5000);

      // Renderer
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(window.devicePixelRatio);
      container.appendChild(renderer.domElement);

      // Controls
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;

      // Lights
      const ambientLight = new THREE.AmbientLight(0x404040, 2);
      scene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
      directionalLight.position.set(1, 1, 1);
      scene.add(directionalLight);

      // Grid
      const gridHelper = new THREE.GridHelper(10000, 20, 0x444444, 0x333333);
      gridHelper.rotation.x = Math.PI / 2;
      scene.add(gridHelper);

      // Axes
      const axesHelper = new THREE.AxesHelper(1000);
      scene.add(axesHelper);

      // Groups
      modelGroup = new THREE.Group();
      deformedGroup = new THREE.Group();
      scene.add(modelGroup);
      scene.add(deformedGroup);

      // Event listeners
      window.addEventListener('resize', onWindowResize);
      setupUIEvents();

      loading.style.display = 'none';

      animate();

      log('Three.js initialized, sending ready message...');

      // 준비 완료 알림
      vscode.postMessage({ command: 'ready' });
    }

    function setupUIEvents() {
      document.getElementById('btnModel').addEventListener('click', () => setViewMode('model'));
      document.getElementById('btnDeformed').addEventListener('click', () => setViewMode('deformed'));
      document.getElementById('btnResetView').addEventListener('click', resetView);
      document.getElementById('btnFit').addEventListener('click', fitAll);

      document.getElementById('comboSelect').addEventListener('change', (e) => {
        selectedCombo = e.target.value;
        updateView();
      });

      document.getElementById('scaleSlider').addEventListener('input', (e) => {
        deformationScale = parseInt(e.target.value);
        document.getElementById('scaleValue').textContent = deformationScale;
        if (viewMode === 'deformed') {
          updateDeformedShape();
        }
      });
    }

    function setViewMode(mode) {
      viewMode = mode;

      document.getElementById('btnModel').classList.toggle('active', mode === 'model');
      document.getElementById('btnDeformed').classList.toggle('active', mode === 'deformed');
      document.getElementById('scaleGroup').style.display = mode === 'deformed' ? 'block' : 'none';

      updateView();
    }

    function updateView() {
      modelGroup.visible = viewMode === 'model';
      deformedGroup.visible = viewMode === 'deformed';

      if (viewMode === 'deformed' && currentResults && selectedCombo) {
        updateDeformedShape();
      }
    }

    function onWindowResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }

    function resetView() {
      camera.position.set(5000, 5000, 5000);
      camera.lookAt(0, 0, 0);
      controls.reset();
    }

    function fitAll() {
      if (!currentModel || !currentModel.nodes || currentModel.nodes.length === 0) return;

      const box = new THREE.Box3();
      currentModel.nodes.forEach(node => {
        box.expandByPoint(new THREE.Vector3(node.x, node.y, node.z));
      });

      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const fov = camera.fov * (Math.PI / 180);
      const distance = maxDim / (2 * Math.tan(fov / 2)) * 1.5;

      camera.position.set(center.x + distance, center.y + distance, center.z + distance);
      camera.lookAt(center);
      controls.target.copy(center);
    }

    // 모델 렌더링
    function renderModel(model) {
      log('renderModel called with: ' + JSON.stringify(model ? { nodes: model.nodes?.length, members: model.members?.length } : null));

      // 기존 객체 제거
      while (modelGroup.children.length > 0) {
        modelGroup.remove(modelGroup.children[0]);
      }

      if (!model || !model.nodes) {
        log('No model or no nodes to render');
        return;
      }

      log('Rendering ' + model.nodes.length + ' nodes and ' + (model.members?.length || 0) + ' members');

      const nodeMap = new Map();

      // 절점 렌더링
      const nodeGeometry = new THREE.SphereGeometry(50, 16, 16);
      const nodeMaterial = new THREE.MeshPhongMaterial({ color: 0x4fc3f7 });

      model.nodes.forEach(node => {
        const mesh = new THREE.Mesh(nodeGeometry, nodeMaterial);
        mesh.position.set(node.x, node.y, node.z);
        mesh.userData = { type: 'node', id: node.id };
        modelGroup.add(mesh);
        nodeMap.set(node.id, node);
      });

      // 부재 렌더링
      const memberMaterial = new THREE.LineBasicMaterial({ color: 0x81c784, linewidth: 2 });

      (model.members || []).forEach(member => {
        const iNode = nodeMap.get(member.iNode);
        const jNode = nodeMap.get(member.jNode);

        if (iNode && jNode) {
          const geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(iNode.x, iNode.y, iNode.z),
            new THREE.Vector3(jNode.x, jNode.y, jNode.z)
          ]);
          const line = new THREE.Line(geometry, memberMaterial);
          line.userData = { type: 'member', id: member.id };
          modelGroup.add(line);
        }
      });

      // 지지 조건 렌더링
      const supportGeometry = new THREE.ConeGeometry(80, 150, 4);
      const supportMaterial = new THREE.MeshPhongMaterial({ color: 0xffa726 });

      (model.supports || []).forEach(support => {
        const node = nodeMap.get(support.node);
        if (node) {
          const mesh = new THREE.Mesh(supportGeometry, supportMaterial);
          mesh.position.set(node.x, node.y - 75, node.z);
          mesh.rotation.x = Math.PI;
          modelGroup.add(mesh);
        }
      });

      // 정보 업데이트
      updateModelInfo(model);

      // 뷰 맞춤
      setTimeout(fitAll, 100);
    }

    function updateDeformedShape() {
      // 기존 변형 객체 제거
      while (deformedGroup.children.length > 0) {
        deformedGroup.remove(deformedGroup.children[0]);
      }

      if (!currentModel || !currentResults || !selectedCombo) return;

      const result = currentResults[selectedCombo];
      if (!result || !result.success) return;

      const nodeMap = new Map();
      currentModel.nodes.forEach(node => nodeMap.set(node.id, node));

      const displacementMap = new Map();
      result.nodes.forEach(nr => {
        displacementMap.set(nr.nodeId, nr.displacement);
      });

      // 변형된 절점
      const nodeGeometry = new THREE.SphereGeometry(50, 16, 16);
      const nodeMaterial = new THREE.MeshPhongMaterial({ color: 0xef5350 });

      currentModel.nodes.forEach(node => {
        const disp = displacementMap.get(node.id) || { dx: 0, dy: 0, dz: 0 };
        const mesh = new THREE.Mesh(nodeGeometry, nodeMaterial);
        mesh.position.set(
          node.x + disp.dx * deformationScale,
          node.y + disp.dy * deformationScale,
          node.z + disp.dz * deformationScale
        );
        deformedGroup.add(mesh);
      });

      // 변형된 부재
      const memberMaterial = new THREE.LineBasicMaterial({ color: 0xef5350, linewidth: 2 });

      (currentModel.members || []).forEach(member => {
        const iNode = nodeMap.get(member.iNode);
        const jNode = nodeMap.get(member.jNode);
        const iDisp = displacementMap.get(member.iNode) || { dx: 0, dy: 0, dz: 0 };
        const jDisp = displacementMap.get(member.jNode) || { dx: 0, dy: 0, dz: 0 };

        if (iNode && jNode) {
          const geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(
              iNode.x + iDisp.dx * deformationScale,
              iNode.y + iDisp.dy * deformationScale,
              iNode.z + iDisp.dz * deformationScale
            ),
            new THREE.Vector3(
              jNode.x + jDisp.dx * deformationScale,
              jNode.y + jDisp.dy * deformationScale,
              jNode.z + jDisp.dz * deformationScale
            )
          ]);
          const line = new THREE.Line(geometry, memberMaterial);
          deformedGroup.add(line);
        }
      });
    }

    function updateModelInfo(model) {
      const info = document.getElementById('modelInfo');
      if (!model) {
        info.textContent = 'No model loaded';
        return;
      }

      info.innerHTML = \`
        <strong>\${model.model?.name || 'Unnamed Model'}</strong><br>
        Nodes: \${model.nodes?.length || 0}<br>
        Members: \${model.members?.length || 0}<br>
        Load Cases: \${model.loadCases?.length || 0}<br>
        Load Combos: \${model.loadCombinations?.length || 0}
      \`;
    }

    function updateComboSelect() {
      const select = document.getElementById('comboSelect');
      select.innerHTML = '<option value="">-- Select --</option>';

      if (currentResults) {
        Object.keys(currentResults).forEach(comboName => {
          const option = document.createElement('option');
          option.value = comboName;
          option.textContent = comboName;
          select.appendChild(option);
        });
      }
    }

    // VS Code 메시지 수신
    window.addEventListener('message', event => {
      const message = event.data;
      log('Received message: ' + message.type);

      switch (message.type) {
        case 'updateModel':
          log('Updating model...');
          currentModel = message.payload;
          renderModel(currentModel);
          break;

        case 'updateResults':
          log('Updating results...');
          currentResults = message.payload;
          updateComboSelect();
          if (viewMode === 'deformed' && selectedCombo) {
            updateDeformedShape();
          }
          break;
      }
    });

    // 초기화 실행
    log('Starting initialization...');
    init();
    })();
  </script>
</body>
</html>`;
  }

  private _getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  public dispose() {
    PreviewPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }
}
