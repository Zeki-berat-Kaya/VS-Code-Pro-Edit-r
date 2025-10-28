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
        logToTerminal(`Otomatik Kaydetme: ${enabled ? 'AÇIK' : 'KAPALI'}`, 'info', 'terminal');
    }

    function formatCode() {
        if (editor) {
            // Biçimlendirme komutunu tetikle (Monaco'da yerleşik özellik)
            editor.trigger('format', 'editor.action.formatDocument', {});
            logToTerminal(`Kodu biçimlendirildi.`, 'info');
        }
    }

    function toggleMaximize() { // YENİ: Tam Ekran Fonksiyonu
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            document.documentElement.requestFullscreen();
        }
    }
    
    window.addEventListener('fullscreenchange', () => {
        const isMaximized = !!document.fullscreenElement;
        body.classList.toggle('maximized', isMaximized);
        maximizeButton.querySelector('.mdi').className = isMaximized ? 'mdi mdi-fullscreen-exit' : 'mdi mdi-fullscreen';
        maximizeButton.title = isMaximized ? 'Tam Ekrandan Çık (F11)' : 'Tam Ekran Yap (F11)';
        // Tam ekran durumu değiştiğinde editörü yeniden boyutlandır
        if (editor) {
            setTimeout(() => {
                editor.layout();
            }, 100);
        }
    });


    // YENİ: Kodu çalıştırma fonksiyonu (Simülasyon)
    function runCode() {
        saveAllContents(true); 
        logToTerminal(`--- KOD ÇALIŞTIRILIYOR: ${currentFile} ---`, 'info', 'terminal');
        outputElement.innerHTML = ''; // Çıktı panelini temizle
        consoleElement.innerHTML = '<span>> Konsol temizlendi.</span>'; // Konsol panelini temizle

        const fileExtension = currentFile ? currentFile.split('.').pop() : '';

        if (fileExtension === 'html' || fileExtension === 'css' || fileExtension === 'js') {
            // Canlı önizleme modunu başlat
            openLivePreview('full_stack');
            logToTerminal(`HTML/CSS/JS projesi Canlı Önizlemede başlatıldı.`, 'success', 'terminal');
        } else if (fileExtension === 'js') {
            try {
                // Sadece JS kodu çalıştırma simülasyonu
                const code = editor.getValue();
                const mockConsole = {
                    log: (...args) => logToTerminal(args.join(' '), 'message', 'console'),
                    error: (...args) => logToTerminal(`HATA: ${args.join(' ')}`, 'error', 'console'),
                    warn: (...args) => logToTerminal(`UYARI: ${args.join(' ')}`, 'warn', 'console')
                };
                
                // Kodu bir fonksiyon içinde sararak çalıştırma (Global kapsamı kirletmemek için basit bir simülasyon)
                new Function('console', code)(mockConsole);

                logToTerminal(`JavaScript kodu başarıyla çalıştırıldı.`, 'success', 'terminal');
                
            } catch (e) {
                logToTerminal(`JavaScript Çalıştırma Hatası: ${e.message}`, 'error', 'terminal');
                logToTerminal(`Hata: ${e.message}`, 'error', 'console');
            }
        } else if (fileExtension === 'py') { // YENİ: Python Desteği
            try {
                const code = editor.getValue();
                
                // Basit bir çıktı simülasyonu
                let mockOutput = "Python kodu başarıyla çalıştırıldı. (Simüle Edildi)";
                let isError = false;

                if (code.includes('print(')) {
                    // print() çağrılarını simüle et. Basitçe tırnak içindeki ilk ifadeyi yakalarız.
                    const printRegex = /print\(['"]([^'"]*)['"]\)/g;
                    const matches = [...code.matchAll(printRegex)];
                    if (matches.length > 0) {
                        mockOutput = matches.map(m => m[1]).join('\n');
                    } else if (code.includes('print(') && !code.includes('\'')) {
                        // Tırnaksız değişken basma gibi senaryolar için uyarı
                        mockOutput = "print() komutu bulundu, ancak çıktısı simüle edilemedi. Genel başarı mesajı gösteriliyor.";
                    }
                } else if (code.includes('def') || code.includes('class')) {
                    mockOutput = "Python modülü/sınıfı yüklendi (Simülasyon). Çıktı yok.";
                } else if (code.includes('error') || code.includes('hata') || code.includes('exception')) {
                    isError = true;
                    mockOutput = "Hata: Python kodunda bir hata yakalandı (Simülasyon).";
                }
                
                if (isError) {
                    logToTerminal(mockOutput, 'error', 'output');
                    logToTerminal(`Python Çalıştırma Hatası: Kod başarıyla derlenemedi (Simülasyon).`, 'error', 'terminal');
                } else {
                    logToTerminal(mockOutput, 'message', 'output');
                    logToTerminal(`Python kodu başarıyla çalıştırıldı.`, 'success', 'terminal');
                }

            } catch (e) {
                // Bu kısım normalde tarayıcıda çalışmaz, ama önlem olarak kalabilir.
                logToTerminal(`Python Çalıştırma Hatası (Simülasyon): ${e.message}`, 'error', 'terminal');
            }
        } else {
            // Desteklenmeyen dosya türü
            logToTerminal(`Desteklenmeyen dosya türü: .${fileExtension}`, 'error', 'terminal');
            logToTerminal(`Lütfen bir .html, .css, .js veya .py dosyası seçin.`, 'warn', 'terminal');
        }
    }
    
    // Canlı Önizleme fonksiyonu (HTML, CSS, JS dahil)
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

        previewWindow.document.open();
        previewWindow.document.write(finalHTML);
        previewWindow.document.close();
        
        previewWindow.focus();
        
        // Modal durumunu güncelle
        const modeIndicator = document.getElementById('preview-mode-indicator');
        modeIndicator.textContent = `Mod: ${mode.toUpperCase()}`;
        previewOptionsModal.style.display = 'none';

        logToTerminal(`Canlı Önizleme '${mode.toUpperCase()}' modunda güncellendi.`, 'info', 'terminal');
    }

    function closeLivePreview() {
        if (previewWindow) {
            previewWindow.close();
            previewWindow = null;
        }
    }


    // --- MONACO EDITOR VE BAŞLANGIÇ AYARLARI ---
    
    function initializeEditor(fileName, content) {
        require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.29.1/min/vs' }});
        require(['vs/editor/editor.main'], function() {
            editor = monaco.editor.create(document.getElementById('editor'), {
                value: content,
                language: 'plaintext',
                theme: savedTheme,
                automaticLayout: true,
                fontFamily: savedFontFamily,
                fontSize: parseInt(savedFontSize),
                minimap: {
                    enabled: true
                }
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
        });
        document.querySelector(`.activity-item[data-target="${targetId}"]`).classList.add('active');
    }

    // --- KOMUT PALETİ MANTIĞI ---

    const commands = [
        // Dosya Yönetimi
        { id: 'newFile', name: 'Yeni Dosya Oluştur (Ctrl+N)', action: () => document.getElementById('new-file-button').click(), shortcut: 'Ctrl+N' },
        { id: 'saveFile', name: 'Mevcut Dosyayı Kaydet (Ctrl+S)', action: () => saveAllContents(), shortcut: 'Ctrl+S' },
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
        const allItems = [...commands, ...Object.keys(fileContents).map(path => ({ 
            id: path, 
            name: `Dosya Aç: ${path}`, 
            action: () => switchFile(path), 
            shortcut: '' 
        }))];

        const filtered = allItems.filter(item => 
            item.name.toLowerCase().includes(lowerQuery) || 
            (item.shortcut && item.shortcut.toLowerCase().includes(lowerQuery))
        ).slice(0, 10);
        
        filtered.forEach((item, index) => {
            const li = document.createElement('li');
            li.dataset.id = item.id;
            li.dataset.index = index;
            li.className = index === 0 ? 'active' : ''; // İlk öğeyi aktif yap
            
            const iconClass = item.id.includes('.') ? getFileIconClass(item.id) : 'mdi mdi-play-circle-outline'; // Dosya ise dosya ikonu, değilse komut ikonu
            
            const shortcutDisplay = item.shortcut ? `<span style="float: right; opacity: 0.6;">${item.shortcut}</span>` : '';
            
            li.innerHTML = `<span class="${iconClass}"></span> ${item.name} ${shortcutDisplay}`;
            commandListElement.appendChild(li);
        });

        if (filtered.length === 0) {
             commandListElement.innerHTML = '<li style="padding: 8px 15px; opacity: 0.6;">Eşleşen komut/dosya bulunamadı.</li>';
        }
    }

    function executeCommand(id) {
        const item = [...commands, ...Object.keys(fileContents).map(path => ({ id: path, name: `Dosya Aç: ${path}`, action: () => switchFile(path), shortcut: '' }))].find(c => c.id === id);
        
        if (item && item.action) {
            item.action();
            commandPaletteModal.style.display = 'none';
        }
    }


    // --- BAŞLATMA FONKSİYONU ---

    function init() {
        // Yerel depolamadan dosyaları yükle
        const savedContents = localStorage.getItem('fileContents');
        const lastOpenFile = localStorage.getItem('lastOpenFile');
        
        if (savedContents) {
            fileContents = JSON.parse(savedContents);
            currentFile = fileContents[lastOpenFile] !== undefined ? lastOpenFile : Object.keys(fileContents).sort()[0] || null;
        } else {
            // Varsayılan dosyaları ayarla (Eğer hiç dosya yoksa)
            fileContents = {
                'index.html': `<!DOCTYPE html>\n<html lang="tr">\n<head>\n    <meta charset="UTF-8">\n    <title>Deneme Projesi</title>\n    <link rel="stylesheet" href="style.css">\n</head>\n<body>\n    <h1>Merhaba Dünya!</h1>\n    <script src="script.js"></script>\n</body>\n</html>`,
                'style.css': `body {\n    font-family: sans-serif;\n    color: #007acc;\n}`,
                'script.js': '// JavaScript kodunu buraya yazın\n\nfunction merhaba() {\n console.log("Kral!");\n}\nmerhaba();',
                // YENİ: Python dosyasını varsayılan olarak ekle
                'main.py': '# Python kodunu buraya yazın\nprint("Merhaba, Python Editörü!")\n\n# Not: Bu çıktı simüle edilmiştir.'
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
                const nestedList = folderEntry.parentElement.querySelector('.nested-list');
                folderEntry.classList.toggle('open');
                
                if (folderEntry.classList.contains('open')) {
                    nestedList.style.display = 'block';
                    localStorage.setItem(folderEntry.dataset.path + '_open', 'true');
                } else {
                    nestedList.style.display = 'none';
                    localStorage.setItem(folderEntry.dataset.path + '_open', 'false');
                }
            } else if (fileEntry) {
                switchFile(fileEntry.dataset.file);
            }
        });
        
        tabsContainer.addEventListener('click', (e) => {
            const tab = e.target.closest('.tab-item');
            if (!tab) return;
            
            const fileToHandle = tab.dataset.file;
            
            if (e.target.classList.contains('close-tab-button')) {
                // Kapatma butonuna tıklandı
                closeFile(fileToHandle);
            } else if (e.target.classList.contains('unsaved-dot')) {
                // Kaydetme noktasına tıklandı, kaydetme işlemini simüle et
                saveAllContents();
            } else {
                // Sekmeye tıklandı, dosyayı değiştir
                switchFile(fileToHandle);
            }
        });
        
        // --- KLASÖR SİSTEMİ BUTONLARI ---
        document.getElementById('new-file-button').addEventListener('click', () => createNewFile());
        document.getElementById('new-file-button-activity').addEventListener('click', () => createNewFile());
        // Klasör simülasyon butonu
        document.getElementById('new-folder-button').addEventListener('click', () => {
             logToTerminal('Yeni Klasör Ekleme simülasyonu. Klasörler dosya yolları üzerinden otomatik oluşturulur.', 'info');
        });
        
        // --- KONTROL BUTONLARI ---
        if (runButton) runButton.addEventListener('click', runCode);
        if (previewButton) previewButton.addEventListener('click', () => previewOptionsModal.style.display = 'block');
        if (formatButton) formatButton.addEventListener('click', formatCode);
        if (maximizeButton) { maximizeButton.addEventListener('click', toggleMaximize); }

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

        document.addEventListener('click', () => {
            contextMenu.style.display = 'none';
        });
        
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
                    logToTerminal(`'${targetFile}' manuel olarak kaydedildi.`, 'info');
                    break;
                case 'new-file':
                    const folderPrefix = targetFile.includes('.') ? targetFile.substring(0, targetFile.lastIndexOf('/') + 1) : targetFile + '/';
                    createNewFile(folderPrefix);
                    break;
            }
        });


        // --- AYARLAR MODALI İŞLEMLERİ ---
        themeSelect.addEventListener('change', (e) => applyTheme(e.target.value));
        terminalThemeSelect.addEventListener('change', (e) => applyTerminalTheme(e.target.value));
        
        autosaveCheckbox.addEventListener('change', (e) => toggleAutosave(e.target.checked));
        autosaveToggle.addEventListener('click', () => toggleAutosave(!isAutosaveEnabled));
        
        fontFamilySelect.addEventListener('change', (e) => {
            localStorage.setItem('editorFontFamily', e.target.value);
            editor.updateOptions({ fontFamily: e.target.value });
        });
        fontSizeInput.addEventListener('change', (e) => {
            localStorage.setItem('editorFontSize', e.target.value);
            editor.updateOptions({ fontSize: parseInt(e.target.value) });
        });

        // Canlı Önizleme Modu Seçimi
        document.getElementById('preview-html-css-button').addEventListener('click', () => openLivePreview('html_css'));
        document.getElementById('preview-full-stack-button').addEventListener('click', () => openLivePreview('full_stack'));
        document.getElementById('open-preview-newtab').addEventListener('click', () => {
            if (previewWindow) {
                previewWindow.focus();
            } else {
                previewOptionsModal.style.display = 'block'; // Henüz açılmamışsa modu seçtir
            }
        });


        // --- KLAVYE KISAYOLLARI ---
        window.addEventListener('keydown', (event) => {
            if (editor && event.key === 'F5') {
                event.preventDefault();
                runCode();
            } else if (event.key === 'F11') {
                event.preventDefault();
                toggleMaximize();
            } else if (event.ctrlKey && event.key.toLowerCase() === 'n') { // Ctrl + N (Yeni Dosya)
                event.preventDefault();
                document.getElementById('new-file-button').click();
            } else if (event.ctrlKey && event.key.toLowerCase() === 's') { // Ctrl + S (Kaydet)
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
            } else if (event.altKey && event.shiftKey && event.key.toLowerCase() === 'f') { // Alt + Shift + F (Format)
                event.preventDefault();
                formatCode();
            }
        });

        // Komut Paleti Giriş/Gezinti
        commandPaletteInput.addEventListener('input', (e) => filterCommands(e.target.value));
        commandPaletteModal.addEventListener('keydown', (e) => {
            const activeItem = commandListElement.querySelector('li.active');
            let nextItem;
            
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (activeItem) {
                    activeItem.classList.remove('active');
                    if (e.key === 'ArrowDown') {
                        nextItem = activeItem.nextElementSibling;
                        if (!nextItem) nextItem = commandListElement.firstElementChild; // Başa dön
                    } else { // ArrowUp
                        nextItem = activeItem.previousElementSibling;
                        if (!nextItem) nextItem = commandListElement.lastElementChild; // Sona dön
                    }
                } else {
                    nextItem = commandListElement.firstElementChild;
                }
                if (nextItem && nextItem.tagName === 'LI') {
                    nextItem.classList.add('active');
                    nextItem.scrollIntoView({ block: 'nearest' }); // Seçili öğeyi görünür yap
                }
            } else if (e.key === 'Enter') {
                if (activeItem) {
                    executeCommand(activeItem.dataset.id);
                }
            }
        });
        
        commandListElement.addEventListener('click', (e) => {
            const listItem = e.target.closest('li');
            if (listItem) {
                executeCommand(listItem.dataset.id);
            }
        });

        // --- PROJE İÇE/DIŞA AKTARMA ---
        exportProjectButton.addEventListener('click', () => {
            saveAllContents(true);
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(fileContents, null, 4));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", "vs_code_pro_project.json");
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
            logToTerminal(`Proje 'vs_code_pro_project.json' olarak dışa aktarıldı.`, 'success');
        });
        
        // Proje İçe Aktarma Simülasyonu
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
