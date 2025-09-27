// 全局变量
let editor;
let currentConfig = '';
let githubToken = '';
let currentSha = '';
let editorLoaded = false;
let isTokenVisible = false;

// GitHub配置
const GITHUB_CONFIG = {
    owner: 'hafrey1',
    repo: 'LunaTV-config',
    path: 'luna-tv-config.json',
    branch: 'main'
};

// JSON错误信息中文映射
const JSON_ERROR_TRANSLATIONS = {
    'Unexpected token': '意外的标记',
    'Unexpected end of JSON input': 'JSON输入意外结束',
    'Expected property name': '预期属性名称',
    'Expected': '预期',
    'or': '或',
    'after': '在...之后',
    'before': '在...之前',
    'at position': '在位置',
    'line': '第',
    'column': '列',
    'Invalid': '无效的',
    'Missing': '缺少',
    'Unterminated string': '未结束的字符串',
    'Trailing comma': '多余的逗号',
    'Duplicate key': '重复的键'
};

// 工具类
class Utils {
    static decodeBase64Unicode(str) {
        try {
            const bytes = Uint8Array.from(atob(str.replace(/\s/g, '')), c => c.charCodeAt(0));
            return new TextDecoder('utf-8').decode(bytes);
        } catch (error) {
            console.error('UTF-8解码失败:', error);
            return decodeURIComponent(escape(atob(str)));
        }
    }
    
    static encodeBase64Unicode(str) {
        try {
            const encoder = new TextEncoder();
            const bytes = encoder.encode(str);
            return btoa(String.fromCharCode(...bytes));
        } catch (error) {
            console.error('UTF-8编码失败:', error);
            return btoa(unescape(encodeURIComponent(str)));
        }
    }
    
    static translateJsonError(error) {
        let message = error.message;
        
        Object.entries(JSON_ERROR_TRANSLATIONS).forEach(([en, zh]) => {
            message = message.replace(new RegExp(en, 'gi'), zh);
        });
        
        message = message.replace(/at position (\d+)/gi, '在位置 $1');
        message = message.replace(/line (\d+)/gi, '第$1行');
        message = message.replace(/column (\d+)/gi, '第$1列');
        
        return message;
    }
    
    static formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    static getTimestamp() {
        return new Date().toLocaleString('zh-CN', {
            timeZone: 'Asia/Shanghai',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }
}

// 消息管理类
class MessageManager {
    static show(message, type = 'info', duration = 3000) {
        const toast = document.getElementById('message-toast');
        if (toast) {
            toast.textContent = message;
            toast.className = `message-toast ${type} show`;
            
            setTimeout(() => {
                toast.classList.remove('show');
            }, duration);
        } else {
            console.log(`[${type}] ${message}`);
        }
    }
    
    static confirm(message, callback) {
        const modal = document.getElementById('confirm-dialog');
        if (modal) {
            const messageEl = document.getElementById('confirm-message');
            const yesBtn = document.getElementById('confirm-yes');
            const noBtn = document.getElementById('confirm-no');
            
            messageEl.textContent = message;
            modal.classList.add('show');
            
            const handleYes = () => {
                modal.classList.remove('show');
                yesBtn.removeEventListener('click', handleYes);
                noBtn.removeEventListener('click', handleNo);
                callback(true);
            };
            
            const handleNo = () => {
                modal.classList.remove('show');
                yesBtn.removeEventListener('click', handleYes);
                noBtn.removeEventListener('click', handleNo);
                callback(false);
            };
            
            yesBtn.addEventListener('click', handleYes);
            noBtn.addEventListener('click', handleNo);
        } else {
            callback(confirm(message));
        }
    }
}

// Token管理类 - 支持浏览器密码保存
class TokenManager {
    static init() {
        // 监听表单提交事件，触发浏览器密码保存
        const form = document.getElementById('login-form');
        const tokenInput = document.getElementById('github-token');
        
        if (form && tokenInput) {
            // 当Token输入后自动提交表单（但阻止实际提交）
            tokenInput.addEventListener('input', (e) => {
                githubToken = e.target.value.trim();
                
                // 延迟触发，确保浏览器检测到表单"提交"
                setTimeout(() => {
                    if (githubToken && githubToken.length > 10) {
                        this.triggerPasswordSave();
                    }
                }, 500);
            });
            
            // 监听表单提交
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.triggerPasswordSave();
            });
        }
    }
    
    // 触发浏览器密码保存提示
    static triggerPasswordSave() {
        const form = document.getElementById('login-form');
        if (form && githubToken) {
            // 创建一个隐藏的提交事件来触发浏览器密码保存
            const event = new Event('submit', { bubbles: true, cancelable: true });
            form.dispatchEvent(event);
            
            MessageManager.show('Token已输入，浏览器应该会提示保存密码', 'success');
        }
    }
    
    // 切换Token显示/隐藏
    static toggleTokenVisibility() {
        const tokenInput = document.getElementById('github-token');
        const toggleBtn = document.getElementById('toggle-token-btn');
        
        if (tokenInput && toggleBtn) {
            isTokenVisible = !isTokenVisible;
            
            tokenInput.type = isTokenVisible ? 'text' : 'password';
            toggleBtn.textContent = isTokenVisible ? '🙈 隐藏' : '👁️ 显示';
            toggleBtn.title = isTokenVisible ? '隐藏Token' : '显示Token';
        }
    }
    
    static clearToken() {
        const tokenInput = document.getElementById('github-token');
        if (tokenInput) {
            tokenInput.value = '';
        }
        githubToken = '';
        MessageManager.show('Token已清除', 'info');
    }
    
    // 从浏览器密码管理器恢复Token
    static restoreFromBrowser() {
        const tokenInput = document.getElementById('github-token');
        if (tokenInput && tokenInput.value) {
            githubToken = tokenInput.value.trim();
            if (githubToken) {
                MessageManager.show('已从浏览器恢复Token', 'success');
                return true;
            }
        }
        return false;
    }
}

// 状态管理类
class StatusManager {
    static setLoading(loading) {
        const buttons = ['load-btn', 'save-btn', 'format-btn', 'minify-btn', 'validate-btn'];
        buttons.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.disabled = loading;
                if (loading) {
                    btn.classList.add('loading');
                } else {
                    btn.classList.remove('loading');
                }
            }
        });
    }
    
    static updateFileInfo(info) {
        if (info.size !== undefined) {
            const sizeEl = document.getElementById('file-size');
            if (sizeEl) sizeEl.textContent = Utils.formatFileSize(info.size);
        }
        
        if (info.lastSaved) {
            const savedEl = document.getElementById('last-saved');
            if (savedEl) savedEl.textContent = `最后保存: ${info.lastSaved}`;
        }
        
        if (info.lastModified) {
            const statusEl = document.getElementById('file-status');
            if (statusEl) statusEl.textContent = `SHA: ${info.lastModified.substring(0, 7)}`;
        }
    }
    
    static updateValidationStatus(isValid, message = '') {
        const statusEl = document.getElementById('validation-status');
        if (statusEl) {
            if (isValid) {
                statusEl.textContent = '✅ JSON格式正确';
                statusEl.className = 'validation-status valid';
            } else {
                statusEl.textContent = `❌ ${message}`;
                statusEl.className = 'validation-status invalid';
            }
        }
    }
    
    static updateStats() {
        if (!editorLoaded || !editor) return;
        
        const content = editor.getValue();
        const lines = content.split('\n').length;
        const chars = content.length;
        
        const charEl = document.getElementById('character-count');
        const lineEl = document.getElementById('line-count');
        
        if (charEl) charEl.textContent = `字符: ${chars}`;
        if (lineEl) lineEl.textContent = `行数: ${lines}`;
        
        const blob = new Blob([content]);
        StatusManager.updateFileInfo({ size: blob.size });
    }
}

// GitHub API类
class GitHubAPI {
    static async loadConfig() {
        if (!githubToken) {
            MessageManager.show('请先输入GitHub Token', 'error');
            return false;
        }
        
        if (!editorLoaded) {
            MessageManager.show('编辑器尚未加载完成，请稍后再试', 'warning');
            return false;
        }
        
        try {
            StatusManager.setLoading(true);
            MessageManager.show('正在从GitHub加载配置...', 'info');
            
            const url = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.path}`;
            
            const response = await fetch(url, {
                headers: {
                    'Authorization': `token ${githubToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Luna-TV-Config-Editor/1.0'
                }
            });
            
            if (!response.ok) {
                throw new Error(this.getErrorMessage(response.status));
            }
            
            const data = await response.json();
            currentSha = data.sha;
            
            const content = Utils.decodeBase64Unicode(data.content);
            
            try {
                JSON.parse(content);
                currentConfig = content;
                
                if (editor && editor.setValue) {
                    editor.setValue(content);
                    
                    setTimeout(() => {
                        if (editor.getAction) {
                            editor.getAction('editor.action.formatDocument').run();
                        }
                    }, 100);
                }
                
                StatusManager.updateFileInfo({ size: data.size, lastModified: data.sha });
                MessageManager.show('配置文件加载成功！', 'success');
                return true;
                
            } catch (jsonError) {
                const translatedError = Utils.translateJsonError(jsonError);
                MessageManager.show(`JSON格式错误: ${translatedError}`, 'error');
                if (editor && editor.setValue) {
                    editor.setValue(content);
                }
                return false;
            }
            
        } catch (error) {
            MessageManager.show(`加载失败: ${error.message}`, 'error');
            return false;
        } finally {
            StatusManager.setLoading(false);
        }
    }
    
    static async saveConfig() {
        if (!githubToken) {
            MessageManager.show('请先加载配置文件', 'error');
            return false;
        }
        
        if (!editorLoaded || !editor) {
            MessageManager.show('编辑器尚未加载完成', 'error');
            return false;
        }
        
        const content = editor.getValue();
        
        try {
            JSON.parse(content);
        } catch (error) {
            const translatedError = Utils.translateJsonError(error);
            MessageManager.show(`保存失败：${translatedError}`, 'error');
            return false;
        }
        
        if (content === currentConfig) {
            MessageManager.show('文件未发生变化，无需保存', 'info');
            return false;
        }
        
        try {
            StatusManager.setLoading(true);
            MessageManager.show('正在保存到GitHub...', 'info');
            
            const url = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.path}`;
            const encodedContent = Utils.encodeBase64Unicode(content);
            
            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${githubToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Luna-TV-Config-Editor/1.0',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: `🌙 通过Web编辑器更新配置 - ${Utils.getTimestamp()}`,
                    content: encodedContent,
                    sha: currentSha,
                    branch: GITHUB_CONFIG.branch
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`保存失败 (${response.status}): ${errorData.message || response.statusText}`);
            }
            
            const savedData = await response.json();
            currentSha = savedData.content.sha;
            currentConfig = content;
            
            StatusManager.updateFileInfo({
                size: new Blob([content]).size,
                lastSaved: Utils.getTimestamp()
            });
            
            MessageManager.show('配置文件保存成功！', 'success');
            return true;
            
        } catch (error) {
            MessageManager.show(`保存失败: ${error.message}`, 'error');
            return false;
        } finally {
            StatusManager.setLoading(false);
        }
    }
    
    static getErrorMessage(status) {
        const messages = {
            401: 'Token验证失败，请检查Token权限是否包含repo访问权限',
            403: 'API访问被拒绝，可能是访问频率限制',
            404: '文件未找到，请确认仓库和文件路径正确',
            422: '请求参数无效',
            500: 'GitHub服务器错误'
        };
        
        return messages[status] || `请求失败 (${status})`;
    }
}

// JSON操作类
class JSONOperations {
    static format() {
        if (!editorLoaded || !editor) {
            MessageManager.show('编辑器尚未加载完成', 'error');
            return;
        }
        
        try {
            const content = editor.getValue();
            const parsed = JSON.parse(content);
            const formatted = JSON.stringify(parsed, null, 2);
            editor.setValue(formatted);
            MessageManager.show('JSON格式化完成', 'success');
        } catch (error) {
            const translatedError = Utils.translateJsonError(error);
            MessageManager.show(`格式化失败: ${translatedError}`, 'error');
        }
    }
    
    static minify() {
        if (!editorLoaded || !editor) {
            MessageManager.show('编辑器尚未加载完成', 'error');
            return;
        }
        
        try {
            const content = editor.getValue();
            const parsed = JSON.parse(content);
            const minified = JSON.stringify(parsed);
            editor.setValue(minified);
            MessageManager.show('JSON压缩完成', 'success');
        } catch (error) {
            const translatedError = Utils.translateJsonError(error);
            MessageManager.show(`压缩失败: ${translatedError}`, 'error');
        }
    }
    
    static validate() {
        if (!editorLoaded || !editor) {
            MessageManager.show('编辑器尚未加载完成', 'error');
            return false;
        }
        
        try {
            const content = editor.getValue();
            JSON.parse(content);
            StatusManager.updateValidationStatus(true);
            MessageManager.show('JSON格式验证通过', 'success');
            return true;
        } catch (error) {
            const translatedError = Utils.translateJsonError(error);
            StatusManager.updateValidationStatus(false, translatedError);
            MessageManager.show(`JSON格式错误: ${translatedError}`, 'error');
            return false;
        }
    }
    
    static clear() {
        if (!editorLoaded || !editor) {
            MessageManager.show('编辑器尚未加载完成', 'error');
            return;
        }
        
        MessageManager.confirm('确认清空编辑器内容吗？', (confirmed) => {
            if (confirmed) {
                editor.setValue('{}');
                MessageManager.show('编辑器已清空', 'info');
            }
        });
    }
}

// 文件操作类
class FileOperations {
    static upload() {
        const input = document.getElementById('file-input');
        input.click();
    }
    
    static handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        if (!file.name.endsWith('.json')) {
            MessageManager.show('请选择JSON文件', 'error');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target.result;
                JSON.parse(content);
                editor.setValue(content);
                MessageManager.show(`文件 "${file.name}" 上传成功`, 'success');
            } catch (error) {
                const translatedError = Utils.translateJsonError(error);
                MessageManager.show(`文件格式错误: ${translatedError}`, 'error');
            }
        };
        
        reader.readAsText(file);
        event.target.value = '';
    }
    
    static download() {
        if (!editorLoaded || !editor) {
            MessageManager.show('编辑器尚未加载完成', 'error');
            return;
        }
        
        try {
            const content = editor.getValue();
            JSON.parse(content);
            
            const blob = new Blob([content], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `luna-tv-config-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            URL.revokeObjectURL(url);
            MessageManager.show('文件下载成功', 'success');
        } catch (error) {
            const translatedError = Utils.translateJsonError(error);
            MessageManager.show(`下载失败: ${translatedError}`, 'error');
        }
    }
}

// 初始化Monaco编辑器
function initializeEditor() {
    if (typeof monaco !== 'undefined') {
        createEditor();
        return;
    }
    
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/monaco-editor@latest/min/vs/loader.js';
    script.onload = () => {
        require.config({ 
            paths: { 
                'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@latest/min/vs' 
            } 
        });
        
        require(['vs/editor/editor.main'], function () {
            createEditor();
        });
    };
    
    script.onerror = () => {
        MessageManager.show('Monaco编辑器加载失败，请检查网络连接', 'error');
    };
    
    document.head.appendChild(script);
}

function createEditor() {
    const editorContainer = document.getElementById('json-editor');
    if (!editorContainer) {
        MessageManager.show('编辑器容器未找到', 'error');
        return;
    }
    
    try {
        editor = monaco.editor.create(editorContainer, {
            value: `{
  "message": "欢迎使用Luna TV配置编辑器",
  "description": "请点击'加载配置'按钮开始编辑您的配置文件",
  "features": [
    "JSON格式化和验证",
    "GitHub同步",
    "浏览器密码管理",
    "树状视图",
    "全屏编辑"
  ]
}`,
            language: 'json',
            theme: 'vs-dark',
            automaticLayout: true,
            fontSize: 14,
            lineNumbers: 'on',
            minimap: { enabled: false },
            wordWrap: 'on',
            formatOnPaste: true,
            formatOnType: true,
            scrollBeyondLastLine: false,
            renderWhitespace: 'selection',
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            folding: true,
            bracketPairColorization: { enabled: true }
        });
        
        editor.onDidChangeModelContent(() => {
            if (editorLoaded) {
                JSONOperations.validate();
                StatusManager.updateStats();
                updateSaveButton();
            }
        });
        
        editorLoaded = true;
        MessageManager.show('编辑器初始化完成', 'success');
        
    } catch (error) {
        MessageManager.show(`编辑器创建失败: ${error.message}`, 'error');
        console.error('编辑器创建失败:', error);
    }
}

function updateSaveButton() {
    const saveBtn = document.getElementById('save-btn');
    if (!saveBtn || !editor || !githubToken) {
        if (saveBtn) saveBtn.disabled = true;
        return;
    }
    
    const hasChanges = editor.getValue() !== currentConfig;
    saveBtn.disabled = !hasChanges;
    saveBtn.textContent = hasChanges ? '💾 保存配置 *' : '💾 保存配置';
}

// 标签页切换
function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.getElementById(`${tabName}-tab`).classList.add('active');
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    if (tabName === 'editor' && editor) {
        setTimeout(() => editor.layout(), 100);
    }
    
    if (tabName === 'tree') {
        updateTreeView();
    }
    
    if (tabName === 'preview') {
        updatePreview();
    }
}

// 更新树状视图
function updateTreeView() {
    const treeContainer = document.getElementById('json-tree');
    if (!treeContainer || !editor) return;
    
    try {
        const content = editor.getValue();
        const parsed = JSON.parse(content);
        treeContainer.innerHTML = '<pre>' + JSON.stringify(parsed, null, 2) + '</pre>';
    } catch (error) {
        treeContainer.innerHTML = '<div class="error-message">JSON格式错误，无法生成树状视图</div>';
    }
}

// 更新预览内容
function updatePreview() {
    const previewContent = document.getElementById('json-preview-content');
    if (!previewContent || !editor) return;
    
    try {
        const content = editor.getValue();
        const parsed = JSON.parse(content);
        previewContent.textContent = JSON.stringify(parsed, null, 2);
    } catch (error) {
        previewContent.textContent = `JSON格式错误，无法生成预览:\n${error.message}`;
    }
}

// 事件监听器设置
function setupEventListeners() {
    // 按钮事件
    const buttons = [
        { id: 'load-btn', handler: GitHubAPI.loadConfig },
        { id: 'save-btn', handler: GitHubAPI.saveConfig },
        { id: 'clear-token-btn', handler: TokenManager.clearToken },
        { id: 'toggle-token-btn', handler: TokenManager.toggleTokenVisibility },
        { id: 'upload-btn', handler: FileOperations.upload },
        { id: 'download-btn', handler: FileOperations.download },
        { id: 'format-btn', handler: JSONOperations.format },
        { id: 'minify-btn', handler: JSONOperations.minify },
        { id: 'validate-btn', handler: JSONOperations.validate },
        { id: 'clear-btn', handler: JSONOperations.clear }
    ];
    
    buttons.forEach(({ id, handler }) => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', handler);
        }
    });
    
    // 文件上传
    const fileInput = document.getElementById('file-input');
    if (fileInput) {
        fileInput.addEventListener('change', FileOperations.handleFileUpload);
    }
    
    // Token输入框事件
    const tokenInput = document.getElementById('github-token');
    if (tokenInput) {
        tokenInput.addEventListener('input', (e) => {
            githubToken = e.target.value.trim();
        });
        
        // 监听浏览器自动填充
        tokenInput.addEventListener('change', () => {
            setTimeout(() => {
                if (tokenInput.value && !githubToken) {
                    githubToken = tokenInput.value.trim();
                    if (githubToken) {
                        MessageManager.show('已从浏览器恢复Token', 'success');
                    }
                }
            }, 100);
        });
    }
    
    // 标签页切换
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.dataset.tab);
        });
    });
    
    // 编辑器选项
    const wordWrapToggle = document.getElementById('word-wrap-toggle');
    if (wordWrapToggle) {
        wordWrapToggle.addEventListener('change', (e) => {
            if (editor) {
                editor.updateOptions({ wordWrap: e.target.checked ? 'on' : 'off' });
            }
        });
    }
    
    const minimapToggle = document.getElementById('minimap-toggle');
    if (minimapToggle) {
        minimapToggle.addEventListener('change', (e) => {
            if (editor) {
                editor.updateOptions({ minimap: { enabled: e.target.checked } });
            }
        });
    }
    
    const lineNumbersToggle = document.getElementById('line-numbers-toggle');
    if (lineNumbersToggle) {
        lineNumbersToggle.addEventListener('change', (e) => {
            if (editor) {
                editor.updateOptions({ lineNumbers: e.target.checked ? 'on' : 'off' });
            }
        });
    }
    
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) {
        themeSelect.addEventListener('change', (e) => {
            if (typeof monaco !== 'undefined') {
                monaco.editor.setTheme(e.target.value);
            }
        });
    }
    
    const fontSizeSlider = document.getElementById('font-size-slider');
    if (fontSizeSlider) {
        fontSizeSlider.addEventListener('input', (e) => {
            const fontSize = parseInt(e.target.value);
            if (editor) {
                editor.updateOptions({ fontSize });
            }
            const valueSpan = document.getElementById('font-size-value');
            if (valueSpan) {
                valueSpan.textContent = `${fontSize}px`;
            }
        });
    }
    
    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey) {
            switch (e.key.toLowerCase()) {
                case 's':
                    e.preventDefault();
                    if (editorLoaded) GitHubAPI.saveConfig();
                    break;
                case 'o':
                    e.preventDefault();
                    if (editorLoaded) GitHubAPI.loadConfig();
                    break;
                case 'u':
                    e.preventDefault();
                    FileOperations.upload();
                    break;
                case 'd':
                    e.preventDefault();
                    FileOperations.download();
                    break;
            }
        }
    });
}

// 应用初始化
function initializeApp() {
    console.log('🌙 Luna TV配置编辑器启动中...');
    
    // 初始化Token管理
    TokenManager.init();
    
    // 初始化编辑器
    initializeEditor();
    
    // 设置事件监听器
    setupEventListeners();
    
    // 尝试从浏览器恢复Token
    setTimeout(() => {
        TokenManager.restoreFromBrowser();
    }, 1000);
    
    // 显示欢迎消息
    setTimeout(() => {
        MessageManager.show('🌙 欢迎使用Luna TV配置编辑器！支持浏览器密码管理', 'info');
    }, 1500);
}

// 页面卸载前保存状态
window.addEventListener('beforeunload', (e) => {
    if (editor && editor.getValue() !== currentConfig && editor.getValue().trim() !== '') {
        e.preventDefault();
        e.returnValue = '您有未保存的更改，确定要离开吗？';
    }
});

// 页面加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

console.log('🔐 Luna TV配置编辑器已启动，支持浏览器密码保存功能');
