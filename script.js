document.addEventListener('DOMContentLoaded', () => {
    let editor;
    let previewWindow = null; 
    let currentFile;
    let isAutosaveEnabled = false; 

    // DOM Bileşenleri
    const body = document.body;
    const terminalElement = document.getElementById('terminal-content');
    const consoleElement = document.getElementById('console-content'); 
    const outputElement = document.getElementById('output-content'); 
    const tabsContainer = document.getElementById('file-tabs-container');
    const fileListElement = document.getElementById('file-list');
    const titleBar = document.querySelector('.title-bar'); 
    const statusLineCol = document.getElementById('status-line-col');
    const runButton = document.getElementById('run-button');
    const previewButton = document.getElementById('preview-button');
    const formatButton = document.getElementById('format-button');
    const maximizeButton = document.getElementById('maximize-button'); // YENİ: Maximize Butonu

    // Modallar
    const settingsModal = document.getElementById('settings-modal');
    const previewOptionsModal = document.getElementById('preview-options-modal');
    const commandPaletteModal = document.getElementById('command-palette-modal');
    const commandPaletteInput = document.getElementById('command-palette-input');
    const commandListElement = document.getElementById('command-list');
    const contextMenu = document.getElementById('context-menu');
    
    // Ayar ve Kontrol Bileşenleri
    const themeSelect = document.getElementById('theme-select');
    const terminalThemeSelect = document.getElementById('terminal-theme-select');
    const autosaveCheckbox = document.getElementById('autosave-checkbox');
    const autosaveToggle = document.getElementById('autosave-toggle');
    const fontFamilySelect = document.getElementById('font-family-select');
    const fontSizeInput = document.getElementById('font-size-input');
    const exportProjectButton = document.getElementById('export-project-button');
    const importProjectButton = document.getElementById('import-project-button');
    const importProjectInput = document.getElementById('import-project-input');
    const cloudSaveButton = document.getElementById('cloud-save-button'); 
    
    // Panel Başlıkları
    const panelTitles = { 'explorer': 'GEZGİN', 'search': 'ARAMA', 'source-control': 'SÜRÜM KONTROLÜ', 'extensions': 'EKLENTİLER' };

    // Varsayılan ve Kayıtlı Ayarlar
    const savedFontFamily = localStorage.getItem('editorFontFamily') || 'monospace';
    const savedFontSize = localStorage.getItem('editorFontSize') || 14;
    const savedTheme = localStorage.getItem('editorTheme') || 'vs-dark';
    const savedTerminalTheme = localStorage.getItem('terminalTheme') || 'dark';
    const savedAutosave = localStorage.getItem('autosaveEnabled') === 'true';
    let fileContents; // Dosya içeriği depolama alanı

    // --- TEMEL FONKSİYONLAR ---
    
    function logToTerminal(message, type = 'message', target = 'terminal') {
        const targetElement = { 'terminal': terminalElement, 'console': consoleElement, 'output': outputElement }[target];
        if (!targetElement) return;
        
        const span = document.createElement('span');
        span.className = `output-${type}`;
        span.innerHTML = `> ${message}`;
        targetElement.appendChild(span);
        targetElement.scrollTop = targetElement.scrollHeight;
    }
    
    function getFileIconClass(fileName) {
        const ext = fileName.split('.').pop();
        switch (ext) {
            case 'html': return 'mdi mdi-language-html5';
            case 'css': return 'mdi mdi-language-css3';
            case 'js': return 'mdi mdi-language-javascript';
            case 'py': return 'mdi mdi-language-python';
            case 'json': return 'mdi mdi-code-json';
            case 'md': return 'mdi mdi-markdown';
            case 'txt': return 'mdi mdi-file-document-outline';
            default: return 'mdi mdi-file-document-outline';
        }
    }
    
    function saveAllContents(skipRender = false) {
        if (editor && currentFile) {
            fileContents[currentFile] = editor.getValue();
            editor.isModified = false; 
        }
        localStorage.setItem('fileContents', JSON.stringify(fileContents));
        localStorage.setItem('lastOpenFile', currentFile); 
        
        if (!skipRender) {
            renderTabs();
            renderFileList();
        }
    }
    
    function cloudSaveSimulation() {
        saveAllContents(true); // Önce tüm içeriği kaydet
        localStorage.setItem('cloudBackup', JSON.stringify(fileContents));
        logToTerminal(`Proje anlık olarak Cloud'a (Yerel Depolama) yedeklendi.`, 'info');
        // İsteğe bağlı ses efekti simülasyonu
        // new Audio('assets/save_sound.mp3').play();
    }


    // --- KLASÖR SİSTEMİ (TREE VIEW) MANTIĞI ---

    function convertToTree(fileContents) {
        const tree = {};
        Object.keys(fileContents).forEach(path => {
            const parts = path.split('/');
            let current = tree;
            parts.forEach((part, index) => {
                // Eğer path boşsa (örn: "a//b" -> parts=["a", "", "b"] gibi) veya parça boşsa atla
                if (!part) return; 

                if (!current[part]) {
                    current[part] = { 
                        type: index === parts.length - 1 ? 'file' : 'folder',
                        children: index === parts.length - 1 ? null : {}
                    };
                }
                
                // Eğer son parça değilse ve type "file" olarak yanlış ayarlanmadıysa (bu olmamalı)
                if (index < parts.length - 1) {
                    current[part].type = 'folder'; // Yolun ortasındaki parçalar her zaman klasördür
                    current = current[part].children;
                }
            });
        });
        return tree;
    }
    
    function renderTree(tree, parentElement) {
        if (parentElement.id === 'file-list-root') parentElement.innerHTML = '';
        
        Object.keys(tree).sort((a, b) => {
            if (tree[a].type === 'folder' && tree[b].type === 'file') return -1;
            if (tree[a].type === 'file' && tree[b].type === 'folder') return 1;
            return a.localeCompare(b);
        }).forEach(name => {
            const item = tree[name];
            // Klasör ise children kontrolünü yapıyoruz
            if (item.type === 'folder' && item.children && Object.keys(item.children).length > 0) { 
                
                const parentPath = parentElement.dataset.path || '';
                const fullPath = (parentPath ? parentPath + '/' : '') + name;
                
                const li = document.createElement('li');
                
                // Klasör içeriği
                const folderEntry = document.createElement('div');
                folderEntry.className = 'folder-entry';
                folderEntry.dataset.path = fullPath;
                
                // Klasör ikon rengi (Sarı)
                const folderIconClass = localStorage.getItem(fullPath + '_open') === 'true' ? 'mdi-folder-open' : 'mdi-folder';
                
                folderEntry.innerHTML = `<span class="mdi ${folderIconClass}" style="color: #ffd700;"></span> ${name}`;
                li.appendChild(folderEntry);
                
                const nestedList = document.createElement('ul');
                nestedList.className = 'nested-list';
                nestedList.dataset.path = fullPath;
                li.appendChild(nestedList);

                renderTree(item.children, nestedList);
                
                // Klasör durumunu hatırla
                if (localStorage.getItem(fullPath + '_open') === 'true') {
                    folderEntry.classList.add('open');
                    nestedList.style.display = 'block';
                }
                
                parentElement.appendChild(li);

            } else { // type === 'file' veya içi boş klasör (bu senaryo olmamalı ama önlem alalım)
                const parentPath = parentElement.dataset.path || '';
                const fullPath = (parentPath ? parentPath + '/' : '') + name;

                // Eğer path fileContents'ta yoksa, muhtemelen boş bir klasör parçasıdır, atla
                if (fileContents[fullPath] === undefined) return; 

                const isModified = (fullPath === currentFile && editor && editor.isModified);
                const li = document.createElement('li');
                li.dataset.file = fullPath;
                li.className = fullPath === currentFile ? 'active' : '';
                
                const iconClass = getFileIconClass(fullPath);
                // YENİ: Kaydedilmemiş nokta gösterimi
                const modifiedDot = isModified ? `<span class="mdi mdi-circle-small unsaved-dot" title="Kaydedilmedi"></span>` : '';
                
                li.innerHTML = `<div class="file-entry" data-file="${fullPath}">
                                    <span class="${iconClass}"></span> ${name}${modifiedDot}
                                </div>`;
                parentElement.appendChild(li);
            }
        });
    }

    function renderFileList() {
        const tree = convertToTree(fileContents);
        
        // Önceki root elementini kaldır
        const existingRoot = document.getElementById('file-list-root');
        if (existingRoot) existingRoot.remove();
        
        const rootUL = document.createElement('ul');
        rootUL.className = 'file-list';
        rootUL.id = 'file-list-root';
        fileListElement.appendChild(rootUL);
        
        renderTree(tree, rootUL);
        
        if (Object.keys(fileContents).length === 0) {
             rootUL.innerHTML = '<li id="empty-message" style="color: var(--inactive-text); margin-top: 10px; padding-left: 10px;">Dosya yok. Yeni dosya ekleyin.</li>';
        }
    }
    
    function renderTabs() {
        tabsContainer.innerHTML = ''; 
        const fileNames = Object.keys(fileContents).sort();
        
        fileNames.forEach(fileName => {
            if (fileContents[fileName] === undefined) return; // Geçersiz dosyaları atla
            
            const tab = document.createElement('div');
            tab.className = 'tab-item';
            
            const isModified = (fileName === currentFile && editor && editor.isModified);
            
            if (fileName === currentFile) {
                tab.classList.add('active');
                // YENİ: Pencere Başlığı Güncellemesi
                const shortName = fileName.includes('/') ? fileName.substring(fileName.lastIndexOf('/') + 1) : fileName;
                titleBar.querySelector('.title-text').textContent = `VS Code Pro - ${shortName}${isModified ? ' •' : ''}`;
            }

            tab.dataset.file = fileName;
            const iconClass = getFileIconClass(fileName);
            
            // Eğer kaydedilmemişse nokta göster, değilse X göster
            const statusIcon = isModified ? `<span class="mdi mdi-circle-small unsaved-dot" data-file="${fileName}"></span>` : `<span class="mdi mdi-close close-tab-button" data-file="${fileName}"></span>`;

            const shortName = fileName.includes('/') ? fileName.substring(fileName.lastIndexOf('/') + 1) : fileName;
            tab.innerHTML = `<span class="${iconClass}"></span> ${shortName} ${statusIcon}`;
            tabsContainer.appendChild(tab);
        });
        
        // Eğer hiç dosya yoksa başlığı sıfırla
        if (fileNames.length === 0) {
            titleBar.querySelector('.title-text').textContent = `VS Code Pro - (Başlıksız Çalışma Alanı)`;
        }
    }

    function renderUI() {
        renderTabs();
        renderFileList();
    }


    function switchFile(newFile) {
        if (!newFile || newFile === currentFile || fileContents[newFile] === undefined) return;
        
        if (editor && currentFile) {
            if (isAutosaveEnabled || editor.isModified) {
                saveAllContents(true);
            } else {
                fileContents[currentFile] = editor.getValue();
            }
        }

        currentFile = newFile;
        editor.setValue(fileContents[newFile]);
        
        const monacoLangMap = { 'html': 'html', 'css': 'css', 'js': 'javascript', 'py': 'python', 'json': 'json', 'md': 'markdown', 'txt': 'plaintext' };
        const fileExtension = newFile.split('.').pop();
        const monacoLang = monacoLangMap[fileExtension] || 'plaintext';
        
        monaco.editor.setModelLanguage(editor.getModel(), monacoLang);
        
        editor.focus();
        editor.isModified = false; 

        renderUI();
    }
    
    function closeFile(fileName) {
        if (fileContents[fileName] === undefined) return;
        
        if (confirm(`'${fileName}' dosyasını kapatmak ve silmek istediğinizden emin misiniz?`)) {
            delete fileContents[fileName];
            
            if (currentFile === fileName) {
                const remainingFiles = Object.keys(fileContents).sort();
                if (remainingFiles.length > 0) {
                    // Kapatılan dosyanın sağındaki (veya ilk) dosyaya geç
                    const currentIndex = remainingFiles.indexOf(fileName);
                    const nextFile = remainingFiles[currentIndex + 1] || remainingFiles[currentIndex - 1] || remainingFiles[0];
                    switchFile(nextFile);
                } else {
                    currentFile = null;
                    editor.setValue('// Yeni dosya oluşturun veya Projeyi İçe Aktarın');
                    monaco.editor.setModelLanguage(editor.getModel(), 'plaintext');
                    editor.isModified = false;
                    titleBar.querySelector('.title-text').textContent = `VS Code Pro - (Başlıksız Çalışma Alanı)`;
                }
            }
            saveAllContents(); 
            logToTerminal(`Dosya '${fileName}' silindi.`, 'warn');
        }
    }
    
    function renameFile(oldFile, newName) {
        // HATA DÜZELTMESİ 1: Yeni adı temizle
        const normalizedNewName = newName.trim().replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
        if (!normalizedNewName) return;

        // Klasör yolunu bul
        const lastSlashIndex = oldFile.lastIndexOf('/');
        const folderPath = lastSlashIndex !== -1 ? oldFile.substring(0, lastSlashIndex + 1) : '';
        
        const fullNewPath = folderPath + normalizedNewName;
        
        if (oldFile === fullNewPath || fileContents[fullNewPath]) {
            logToTerminal(`Hata: '${fullNewPath}' zaten mevcut veya aynı isim.`, 'error');
            return;
        }
        
        // Yeniden adlandırma işlemini yap
        fileContents[fullNewPath] = fileContents[oldFile];
        delete fileContents[oldFile];
        
        if (currentFile === oldFile) {
            currentFile = fullNewPath;
        }
        saveAllContents();
        logToTerminal(`Dosya '${oldFile}' -> '${fullNewPath}' olarak yeniden adlandırıldı.`, 'success');
    }

    function createNewFile(fileName) {
        let name = fileName || prompt("Yeni dosya adı (örn: src/main.js):");
        if (!name) return;
        
        // HATA DÜZELTMESİ 2: Girilen adı temizle (Boşluklar, çift slasher vb.)
        let normalizedName = name.trim().replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
        if (!normalizedName) return;
        
        if (fileContents[normalizedName]) {
            logToTerminal(`Hata: '${normalizedName}' zaten mevcut.`, 'error');
            return;
        }

        fileContents[normalizedName] = ''; 
        saveAllContents();
        logToTerminal(`Dosya '${normalizedName}' oluşturuldu.`, 'success');
        // İsteğe bağlı ses efekti simülasyonu
        // new Audio('assets/file_create_sound.mp3').play();
        switchFile(normalizedName);
    }
    
    function applyTheme(newTheme) {
        if (editor) {
            monaco.editor.setTheme(newTheme); 
        }
        // Monaco temasından CSS temasına eşleme (YENİ)
        const themeMap = {
            'vs-dark': 'dark',
            'vs-light': 'light',
            'hc-black': 'dark' 
        };
        body.dataset.theme = themeMap[newTheme] || 'dark';
        localStorage.setItem('editorTheme', newTheme);
        renderUI();
    }
    
    function applyTerminalTheme(newTheme) {
        body.dataset.terminalTheme = newTheme;
        localStorage.setItem('terminalTheme', newTheme);
        logToTerminal(`Terminal teması ${newTheme.toUpperCase()} olarak ayarlandı.`, 'info');
    }

    function toggleAutosave(enabled) {
        isAutosaveEnabled = enabled;
        localStorage.setItem('autosaveEnabled', enabled);
        
        autosaveToggle.classList.toggle('active', enabled);
        autosaveCheckbox.checked = enabled; // Ayarlar modalını senkronize et
        autosaveToggle.title = enabled ? 'Otomatik Kaydetme Açık' : 'Kaydet (Ctrl+S)';
        
        if (enabled) {
            autosaveToggle.querySelector('.mdi').classList.remove('mdi-content-save-outline');
            autosaveToggle.querySelector('.mdi').classList.add('mdi-content-save-all-outline');
        } else {
            autosaveToggle.querySelector('.mdi').classList.remove('mdi-content-save-all-outline');
            autosaveToggle.querySelector('.mdi').classList.add('mdi-content-save-outline');
        }
    }
    
    /**
     * YENİ FONKSİYON: Tam Ekran Modunu Açıp Kapatır.
     */
    function toggleMaximize() {
        const isMaximized = body.classList.toggle('maximized');
        
        // Buton ikonunu ve başlığını güncelle
        const icon = maximizeButton.querySelector('.mdi');
        if (isMaximized) {
             icon.classList.remove('mdi-fullscreen');
             icon.classList.add('mdi-fullscreen-exit');
             maximizeButton.title = 'Ekranı Küçült';
             logToTerminal('Tam Ekran modu aktif.', 'info');
        } else {
             icon.classList.remove('mdi-fullscreen-exit');
             icon.classList.add('mdi-fullscreen');
             maximizeButton.title = 'Tam Ekran Yap';
             logToTerminal('Tam Ekran modu deaktif.', 'info');
        }

        // Düzenleyiciyi yeniden boyutlandır (Monaco için kritik)
        if (editor) {
            editor.layout();
        }
    }


    // --- MONACO VE ARAYÜZ KONTROLÜ ---
    
    function initializeEditor(fileName, content) {
        require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.46.0/min/vs' }});
        require(['vs/editor/editor.main'], function() {
            
            editor = monaco.editor.create(document.getElementById('editor'), {
                value: content,
                language: 'plaintext', 
                theme: savedTheme,      
                automaticLayout: true,
                fontFamily: savedFontFamily, 
                fontSize: parseInt(savedFontSize),
                minimap: { enabled: true } 
            });

            window.editor = editor; 
            
            editor.getModel().onDidChangeContent(() => {
                editor.isModified = true;
                if (isAutosaveEnabled) {
                    saveAllContents(false);
                }
                updateStatus();
                renderUI(); 
            });
            
            editor.onDidChangeCursorPosition(updateStatus);

            editor.isModified = false;
            updateStatus();
            setupEventListeners();
            
            // Başlangıçta dosyaya geçiş yaparak dil ve içeriği ayarla
            if (currentFile) switchFile(currentFile);
        });
    }

    function updateStatus() {
        if (!editor) return;
        const position = editor.getPosition();
        statusLineCol.textContent = `Satır ${position.lineNumber}, Sütun ${position.column}`;
    }

    function switchSidebarPanel(targetId) {
        const sidebarHeaderTitle = document.getElementById('sidebar-header-title');
        
        document.querySelectorAll('.sidebar-panel').forEach(panel => {
            panel.style.display = 'none';
        });

        const targetElement = document.getElementById(targetId + '-panel');
        if (targetElement) {
            targetElement.style.display = 'flex'; // Flex olarak ayarlandı
            sidebarHeaderTitle.textContent = panelTitles[targetId];
        } else {
            // Ayarlar aktivite bar öğesine tıklanırsa ayarlar modalını aç
            if (targetId === 'settings') {
                 settingsModal.style.display = 'block';
                 sidebarHeaderTitle.textContent = "AYARLAR"; // Başlığı yine de ayarla
                 // Explorer'a geri dön
                 document.querySelectorAll('.activity-item').forEach(item => {
                    item.classList.remove('active');
                 });
                 document.querySelector('.activity-item[data-target="explorer"]').classList.add('active');
                 document.getElementById('explorer-panel').style.display = 'flex';
                 sidebarHeaderTitle.textContent = panelTitles['explorer'];
                 return;
            }
        }

        document.querySelectorAll('.activity-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.target === targetId) {
                item.classList.add('active');
            }
        });
    }


    // --- KOD ÇALIŞTIRMA VE BİÇİMLENDİRME ---
    
    function runCode() {
        if (!window.editor) return;
        
        saveAllContents();
        const language = window.editor.getModel().getLanguageId();
        
        // Console sekmesine geç
        document.querySelector('.panel-tab[data-tab="console"]').click();
        consoleElement.innerHTML = `<span>> Çalıştırılıyor: ${language.toUpperCase()} (${new Date().toLocaleTimeString()})</span>`;

        if (language === 'javascript') {
            const jsCode = fileContents['script.js'] || fileContents['src/script.js'] || ''; 
            
            const originalLog = console.log;
            const originalError = console.error;
            
            // Console.log'u konsol sekmesine yönlendir
            console.log = function(...args) {
                const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
                logToTerminal(message, 'message', 'console');
            };
            
            // Console.error'u konsol sekmesine yönlendir
            console.error = function(...args) {
                const message = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
                logToTerminal(message, 'error', 'console');
            };
            
            try {
                // Kodu çalıştırmak için yeni bir fonksiyon oluştur
                new Function(jsCode)(); 
                logToTerminal("Kod başarıyla tamamlandı.", 'success', 'console');
            } catch (e) {
                logToTerminal(`HATA: ${e.message}`, 'error', 'console');
            } finally {
                // Console fonksiyonlarını eski haline getir
                console.log = originalLog;
                console.error = originalError;
            }

        } else if (language === 'html' || language === 'css') {
            logToTerminal("HTML/CSS kodu için Canlı Önizleme'yi kullanın.", 'warn', 'console');
        } else {
            logToTerminal(`Dil: ${language}. Bu kod tarayıcıda doğrudan çalıştırılamaz.`, 'info', 'console');
        }
    }
    
    // Canlı Önizlemeyi Yeni Sekmede Açma (Pop-up engelleyici kontrolü dahil)
    function openLivePreview(mode) {
        saveAllContents(); // Tüm dosyaları kaydet

        // index.html, style.css ve script.js dosyalarının varlığını kontrol et
        const htmlContent = fileContents['index.html'] || fileContents['src/index.html'] || '<h1>index.html dosyası bulunamadı.</h1>';
        const cssContent = fileContents['style.css'] || fileContents['src/style.css'] || '/* style.css dosyası bulunamadı */';
        const jsContent = fileContents['script.js'] || fileContents['src/script.js'] || '// script.js dosyası bulunamadı';

        let finalHTML = htmlContent;

        // Gömülü CSS ve JS için hazırlık
        const styleTag = `<style>\n${cssContent}\n</style>`;
        const scriptTag = `<script>\n${jsContent}\n</script>`;
        
        // Link ve Script etiketlerini bulup yerine yeni gömülü etiketleri koy
        // Bu, index.html'deki mevcut referansları geçersiz kılar.
        finalHTML = finalHTML.replace(/<link[^>]*?href=['"](.*?\.css)['"][^>]*?>/i, '');
        finalHTML = finalHTML.replace(/<script[^>]*?src=['"](.*?\.js)['"][^>]*?><\/script>/i, '');

        // <head> ve <body> etiketlerini bul
        const headMatch = finalHTML.match(/<\/head>/i);
        const bodyMatch = finalHTML.match(/<\/body>/i);

        if (mode === 'full_stack' || mode === 'html_css') {
            if (headMatch) {
                finalHTML = finalHTML.replace(headMatch[0], styleTag + '\n' + headMatch[0]);
            }
        }

        if (mode === 'full_stack') {
            if (bodyMatch) {
                finalHTML = finalHTML.replace(bodyMatch[0], scriptTag + '\n' + bodyMatch[0]);
            }
        }
        
        previewWindow = window.open('', '_blank', 'noopener=yes');
        
        if (!previewWindow || previewWindow.closed || typeof previewWindow.closed === 'undefined') {
            logToTerminal("HATA: Canlı Önizleme başlatılamadı. Tarayıcınızın **Pop-up Engelleyicisini** kontrol edin.", 'error');
            previewOptionsModal.style.display = 'none';
            return;
        }

        previewWindow.document.write(finalHTML);
        previewWindow.document.close();
        logToTerminal(`Canlı Önizleme yeni sekmede başlatıldı (${mode}).`, 'success');
        previewOptionsModal.style.display = 'none';
    }


    function formatCode() {
        if (!editor || !currentFile) return;

        const originalCode = editor.getValue();
        let formattedCode = originalCode;
        const lang = editor.getModel().getLanguageId();

        // BASİT PRETTIER FORMATLAMA SİMÜLASYONU
        if (lang === 'javascript' || lang === 'html' || lang === 'css') {
            const indent = '    '; // 4 boşluk
            formattedCode = originalCode.split('\n').map(line => {
                const trimmed = line.trim();
                if (trimmed.length === 0) return '';
                // Basit girinti simülasyonu: Her satırın başına 1 indent ekle
                return indent + trimmed; 
            }).join('\n').replace(/\n\s*\n/g, '\n\n'); // Çift boş satırları koru
            
            editor.setValue(formattedCode.trim());
            saveAllContents();
            logToTerminal(`Dosya '${currentFile}' Biçimlendirildi (Prettier Simülasyonu).`, 'success');
        } else {
            logToTerminal("Bu dosya türü için biçimlendirme simülasyonu desteklenmiyor.", 'warn');
        }
    }
    
    // --- KLAVYE KISAYOLU İŞLEVLERİ VE KOMUT PALETİ ---
    const commands = [
        // Dosya Yönetimi
        { id: 'newFile', name: 'Yeni Dosya Oluştur', action: () => createNewFile(), shortcut: 'Ctrl+N' },
        { id: 'saveFile', name: 'Kaydet', action: () => saveAllContents(), shortcut: 'Ctrl+S' },
        { id: 'importProject', name: 'Projeyi İçe Aktar (.json)', action: () => importProjectInput.click(), shortcut: 'Ctrl+Shift+I' },
        { id: 'exportProject', name: 'Projeyi Dışa Aktar (.json)', action: () => exportProjectButton.click(), shortcut: 'Ctrl+Shift+E' },
        
        // Çalıştırma
        { id: 'runCode', name: 'Kodu Çalıştır', action: runCode, shortcut: 'F5 / Ctrl+Enter' },
        { id: 'livePreview', name: 'Canlı Önizlemeyi Başlat', action: () => previewOptionsModal.style.display = 'block', shortcut: 'Ctrl+Shift+R' },
        
        // Ayarlar ve Arayüz
        { id: 'showSettings', name: 'Ayarları Aç', action: () => settingsModal.style.display = 'block', shortcut: 'Ctrl+,' },
        { id: 'formatCode', name: 'Kodu Biçimlendir (Prettier)', action: formatCode, shortcut: 'Alt+Shift+F' },
        { id: 'toggleAutosave', name: 'Otomatik Kaydetmeyi Aç/Kapat', action: () => toggleAutosave(!isAutosaveEnabled), shortcut: '' },
        { id: 'toggleMaximize', name: 'Tam Ekran/Küçült', action: toggleMaximize, shortcut: 'F11' }, // YENİ Komut
        { id: 'switchExplorer', name: 'Gezgin (Explorer) Paneline Git', action: () => switchSidebarPanel('explorer'), shortcut: '' },
        
        // Kalıcılık Simülasyonu
        { id: 'cloudSave', name: 'Cloud\'a Kaydet (Yedek)', action: cloudSaveSimulation, shortcut: 'Ctrl+Shift+U' }
    ];

    function showCommandPalette() {
        commandPaletteModal.style.display = 'block';
        commandPaletteInput.value = '';
        commandPaletteInput.focus();
        filterCommands('');
    }

    // Komut listesini ve dosya listesini filtrele
    function filterCommands(query) {
        commandListElement.innerHTML = '';
        const lowerQuery = query.toLowerCase();
        
        // Komutlar ve dosya açma eylemlerini birleştir
        const allItems = [...commands, ...Object.keys(fileContents).map(path => ({ id: path, name: `Dosya Aç: ${path}`, action: () => switchFile(path), shortcut: '' }))];
        
        const filtered = allItems.filter(item => 
            item.name.toLowerCase().includes(lowerQuery) || 
            (item.shortcut && item.shortcut.toLowerCase().includes(lowerQuery))
        ).slice(0, 10);

        filtered.forEach((item, index) => {
            const li = document.createElement('li');
            const shortcutDisplay = item.shortcut ? `<span style="float:right; opacity: 0.6;">${item.shortcut}</span>` : '';
            li.innerHTML = `${item.name.split(': ')[0] === 'Dosya Aç' ? `<span class="${getFileIconClass(item.id)}"></span> ${item.name}` : item.name} ${shortcutDisplay}`;
            li.dataset.commandId = item.id;
            li.tabIndex = -1; 
            if (index === 0) li.classList.add('active'); 
            commandListElement.appendChild(li);
        });
        
        if (filtered.length === 0) {
            commandListElement.innerHTML = `<li>Sonuç bulunamadı: "${query}"</li>`;
        }
    }


    // --- BAŞLANGIÇ YÜKLEMESİ VE OLAYLAR ---
    
    function init() {
        const savedContents = JSON.parse(localStorage.getItem('fileContents'));
        const lastOpenFile = localStorage.getItem('lastOpenFile');
        
        if (savedContents && Object.keys(savedContents).length > 0) {
            fileContents = savedContents;
            // YENİ: Son açılan dosyayı hatırla
            const initialFile = lastOpenFile && fileContents[lastOpenFile] ? lastOpenFile : Object.keys(fileContents).sort()[0];
            currentFile = initialFile;
        } else {
            // Hoşgeldin Ekranı Simülasyonu - Varsayılan dosyaları oluştur
            fileContents = {
                'index.html': '<html>\n<head>\n    <title>Canlı Önizleme</title>\n    <link rel="stylesheet" href="style.css">\n</head>\n<body>\n    <h1>VS Code Pro Editöre Hoş Geldiniz!</h1>\n    <p>Yeni bir dosya oluşturmak için Ctrl+N kullanın.</p>\n    <script src="script.js"></script>\n</body>\n</html>',
                'style.css': 'body { background-color: var(--editor-bg); color: var(--main-text); font-family: sans-serif; padding: 20px; }\n\n/* Daha fazla stil ekleyin */',
                'script.js': 'console.log("Konsolun çalışıyor!");\n// JS kodunuzu buraya yazın\n\nfunction merhaba() {\n    console.log("Kral!");\n}\nmerhaba();'
            };
            currentFile = 'script.js'; 
        }
        
        toggleAutosave(savedAutosave); 
        
        // Editor'ü başlat
        const initialContent = fileContents[currentFile] !== undefined ? fileContents[currentFile] : '// VS Code Pro Editörüne Hoş Geldiniz!\n// Yeni bir dosya oluşturmak için Ctrl+N veya Sol menüyü kullanın.';
        initializeEditor(currentFile, initialContent);
        
        // Temaları ve terminal temasını uygula
        themeSelect.value = savedTheme;
        terminalThemeSelect.value = savedTerminalTheme;
        applyTheme(savedTheme); 
        applyTerminalTheme(savedTerminalTheme); 
        
        switchSidebarPanel('explorer'); 
        renderFileList(); 
    }
    
    function setupEventListeners() {
        // Modal Kapatma
        document.querySelectorAll('.close-button').forEach(button => {
            button.addEventListener('click', (e) => {
                e.target.closest('.modal').style.display = 'none';
            });
        });
        window.addEventListener('click', (e) => {
             if (e.target.classList.contains('modal')) {
                 e.target.style.display = 'none';
             }
        });
        
        // Sol Panel Geçişleri
        document.querySelectorAll('.activity-item').forEach(item => {
            item.addEventListener('click', (e) => switchSidebarPanel(e.currentTarget.dataset.target));
        });
        
        // Terminal Panel Sekmeleri
        document.querySelectorAll('.panel-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                
                document.querySelectorAll('.terminal-content').forEach(c => c.style.display = 'none');
                document.querySelector(`[data-tab-content="${e.target.dataset.tab}"]`).style.display = 'block';
            });
        });
        document.getElementById('clear-terminal').addEventListener('click', () => {
             terminalElement.innerHTML = `<span>> Terminal temizlendi.</span>`;
             consoleElement.innerHTML = `<span>> Konsol temizlendi.</span>`;
             outputElement.innerHTML = `<span>> Çıktı temizlendi.</span>`;
        });

        // Dosya ve Sekme Tıklamaları (Olay Yetkilendirmesi)
        fileListElement.addEventListener('click', (e) => {
            const folderEntry = e.target.closest('.folder-entry');
            const fileEntry = e.target.closest('.file-entry');
            
            if (folderEntry) {
                folderEntry.classList.toggle('open');
                const nestedList = folderEntry.nextElementSibling;
                const isOpen = folderEntry.classList.contains('open');
                nestedList.style.display = isOpen ? 'block' : 'none';
                localStorage.setItem(folderEntry.dataset.path + '_open', isOpen);
                
                // İkonu değiştir
                const icon = folderEntry.querySelector('.mdi');
                icon.classList.remove(isOpen ? 'mdi-folder' : 'mdi-folder-open');
                icon.classList.add(isOpen ? 'mdi-folder-open' : 'mdi-folder');


            } else if (fileEntry && fileEntry.dataset.file) {
                switchFile(fileEntry.dataset.file);
            }
        });

        tabsContainer.addEventListener('click', (e) => {
            const tabItem = e.target.closest('.tab-item');
            const closeButton = e.target.closest('.close-tab-button');
            const unsavedDot = e.target.closest('.unsaved-dot');

            if (tabItem && tabItem.dataset.file) {
                if (closeButton || unsavedDot) {
                    closeFile(tabItem.dataset.file);
                } else {
                    switchFile(tabItem.dataset.file);
                }
            }
        });
        
        // YENİ DOSYA OLUŞTURMA
        document.getElementById('new-file-button').addEventListener('click', () => createNewFile());
        document.getElementById('new-file-button-activity').addEventListener('click', () => createNewFile());
        document.getElementById('new-folder-button').addEventListener('click', () => {
             logToTerminal("Klasör oluşturma simülasyonu: Yeni dosya oluştururken adında '/' kullanın (örn: assets/image.png).", 'info', 'terminal');
             createNewFile();
        });


        // AYARLAR MANTIĞI
        document.getElementById('settings-button').addEventListener('click', () => settingsModal.style.display = 'block');
        document.getElementById('save-settings-button').addEventListener('click', () => {
            // Tema ve Terminal Tema
            applyTheme(themeSelect.value);
            applyTerminalTheme(terminalThemeSelect.value);

            // Autosave
            toggleAutosave(autosaveCheckbox.checked);
            
            // Font Ayarları
            const newFamily = fontFamilySelect.value;
            const newSize = parseInt(fontSizeInput.value);
            editor.updateOptions({ fontFamily: newFamily, fontSize: newSize });
            localStorage.setItem('editorFontFamily', newFamily);
            localStorage.setItem('editorFontSize', newSize);
            
            settingsModal.style.display = 'none';
        });

        // RUN/PREVIEW/FORMAT
        runButton.addEventListener('click', runCode);
        formatButton.addEventListener('click', formatCode);
        
        // CANLI ÖNİZLEME Seçenekleri
        previewButton.addEventListener('click', () => previewOptionsModal.style.display = 'block');
        
        document.querySelectorAll('.preview-option-button').forEach(button => {
            button.addEventListener('click', (e) => openLivePreview(e.target.dataset.mode));
        });
        
        // YENİ: Tam Ekran Düğmesi Olay Dinleyicisi
        if (maximizeButton) {
            maximizeButton.addEventListener('click', toggleMaximize);
        }

        // Eklenti Simülasyonu
        document.querySelectorAll('.install-button').forEach(button => {
            button.addEventListener('click', (e) => {
                const extension = e.target.dataset.extension;
                logToTerminal(`'${extension.toUpperCase()}' eklentisi yüklendi (Simülasyon).`, 'success', 'terminal');
                e.target.textContent = 'Yüklü';
                e.target.disabled = true;
            });
        });

        // YENİ: Context Menu (Sağ Tık)
        fileListElement.addEventListener('contextmenu', (e) => {
            const entry = e.target.closest('.file-entry') || e.target.closest('.folder-entry');
            if (entry) {
                e.preventDefault();
                contextMenu.style.display = 'block';
                contextMenu.style.left = `${e.pageX}px`;
                contextMenu.style.top = `${e.pageY}px`;
                contextMenu.dataset.targetFile = entry.dataset.file || entry.dataset.path;
            }
        });
        
        document.addEventListener('click', () => { contextMenu.style.display = 'none'; });
        
        contextMenu.addEventListener('click', (e) => {
            const action = e.target.closest('li')?.dataset.action;
            const targetFile = contextMenu.dataset.targetFile;
            contextMenu.style.display = 'none';

            if (!targetFile || !action) return;

            switch (action) {
                case 'rename':
                    const oldFileName = targetFile.includes('/') ? targetFile.substring(targetFile.lastIndexOf('/') + 1) : targetFile;
                    const newName = prompt(`'${oldFileName}' için yeni isim girin:`, oldFileName);
                    if (newName && newName !== oldFileName) renameFile(targetFile, newName);
                    break;
                case 'delete':
                    closeFile(targetFile);
                    break;
                case 'save':
                    saveAllContents();
                    logToTerminal(`'${targetFile}' kaydedildi.`, 'info');
                    break;
                case 'new-file':
                    const subFileName = prompt(`Yeni alt dosya adı (örn: yeni.js):`);
                    if (subFileName) {
                        // Belirlenen dosyanın klasör yolu
                        const isFolder = fileContents[targetFile] === undefined; 
                        let basePath;
                        
                        if (isFolder) { 
                             basePath = targetFile.endsWith('/') ? targetFile : targetFile + '/';
                        } else { 
                             const lastSlash = targetFile.lastIndexOf('/');
                             basePath = lastSlash !== -1 ? targetFile.substring(0, lastSlash + 1) : '';
                        }
                        
                        // Dosya adı temizleme
                        const normalizedSubFileName = subFileName.trim().replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
                        
                        const fullPath = basePath + normalizedSubFileName;
                        
                        createNewFile(fullPath);
                    }
                    break;
            }
        });
        
        // KOMUT PALETİ Dinleyicileri
        commandPaletteInput.addEventListener('input', (e) => filterCommands(e.target.value));
        
        commandPaletteInput.addEventListener('keydown', (e) => {
            const activeItem = commandListElement.querySelector('li.active');
            let nextItem = null;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                nextItem = activeItem ? activeItem.nextElementSibling : commandListElement.firstChild;
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                nextItem = activeItem ? activeItem.previousElementSibling : commandListElement.lastChild;
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (activeItem) activeItem.click();
            }

            if (nextItem && nextItem.tagName === 'LI') {
                if (activeItem) activeItem.classList.remove('active');
                nextItem.classList.add('active');
            }
        });
        
        commandListElement.addEventListener('click', (e) => {
            const li = e.target.closest('li');
            if (li) {
                const command = commands.find(c => c.id === li.dataset.commandId);
                if (command) {
                    command.action();
                } else if (li.textContent.includes('Dosya Aç:')) {
                    // Dosya açma komutlarını id üzerinden direkt al
                    switchFile(li.dataset.commandId); 
                }
                commandPaletteModal.style.display = 'none';
            }
        });

        // KLAVYE KISAYOLLARI
        document.addEventListener('keydown', (event) => {
            if (event.ctrlKey && event.key === 's') { // Ctrl + S (Kaydet)
                event.preventDefault();
                if (!isAutosaveEnabled) {
                    saveAllContents();
                    logToTerminal(`'${currentFile}' kaydedildi.`, 'info');
                } else {
                    logToTerminal("Otomatik kaydetme açık, manuel kayda gerek yok.", 'warn');
                }
            } else if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'p') { // Ctrl + Shift + P (Komut Paleti)
                event.preventDefault();
                showCommandPalette();
            } else if (event.ctrlKey && event.key.toLowerCase() === 'p' && document.activeElement !== commandPaletteInput) { // Ctrl + P (Dosya Arama - Komut Paleti olarak simüle edildi)
                event.preventDefault();
                 showCommandPalette();
                 commandPaletteInput.value = '@'; // Opsiyonel: Dosya arama moduna geçiş simülasyonu
                 filterCommands('@');
            } else if (event.ctrlKey && event.key === ',') { // Ctrl + , (Ayarlar)
                event.preventDefault();
                settingsModal.style.display = 'block';
            } else if (event.key === 'F5' || (event.ctrlKey && event.key === 'Enter')) { // F5 veya Ctrl + Enter (Çalıştır)
                event.preventDefault(); 
                runCode();
            } else if (event.altKey && event.shiftKey && event.key.toLowerCase() === 'f') { // Alt + Shift + F (Format)
                event.preventDefault();
                formatCode();
            } else if (event.key === 'F11') { // F11 (Tam Ekran)
                event.preventDefault();
                toggleMaximize();
            } else if (event.key === 'Escape') { // ESC
                if (commandPaletteModal.style.display === 'block') commandPaletteModal.style.display = 'none';
                if (settingsModal.style.display === 'block') settingsModal.style.display = 'none';
                if (previewOptionsModal.style.display === 'block') previewOptionsModal.style.display = 'none';
                if (body.classList.contains('maximized')) toggleMaximize(); // Tam Ekrandan çıkış
            }
        });
        
        // JSON Export/Import
        exportProjectButton.addEventListener('click', () => {
            saveAllContents(); 
            const dataStr = JSON.stringify(fileContents, null, 2);
            const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);

            const linkElement = document.createElement('a');
            linkElement.setAttribute('href', dataUri);
            linkElement.setAttribute('download', 'vs_code_pro_project.json');
            linkElement.click();
            logToTerminal("Proje JSON olarak başarıyla dışa aktarıldı.", 'success');
        });
        
        importProjectButton.addEventListener('click', () => importProjectInput.click());
        importProjectInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file || !file.name.endsWith('.json')) {
                logToTerminal("Lütfen bir .json proje dosyası seçin.", 'error');
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const importedContents = JSON.parse(e.target.result);
                    if (typeof importedContents === 'object' && importedContents !== null) {
                        if (confirm("Mevcut çalışma alanınızdaki tüm dosyalar silinecektir. Devam etmek istiyor musunuz?")) {
                            fileContents = importedContents;
                            currentFile = Object.keys(fileContents).sort()[0] || null;
                            saveAllContents(); 
                            window.location.reload(); 
                        }
                    } else {
                        throw new Error("Geçersiz JSON yapısı.");
                    }
                } catch (error) {
                    logToTerminal(`HATA: Proje içe aktarılamadı: ${error.message}`, 'error');
                }
            };
            reader.readAsText(file);
        });
        
        // CLOUD SAVE SIMÜLASYONU
        cloudSaveButton.addEventListener('click', cloudSaveSimulation);
    }

    init(); 
});