// AI Prompt Generator App
class PromptGenerator {
    constructor() {
        this.promptLibrary = JSON.parse(localStorage.getItem('promptLibrary')) || [];
        this.uploadedDocuments = JSON.parse(localStorage.getItem('uploadedDocuments')) || [];
        this.manualInformation = localStorage.getItem('manualInformation') || '';
        this.srefLibrary = JSON.parse(localStorage.getItem('srefLibrary')) || [];
        
        // Initialize tooltip explanations
        this.tooltipExplanations = this.initTooltipExplanations();
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadPromptLibrary();
        this.loadManualInformation();
        this.loadUploadedFiles();
        this.loadSrefLibrary();
        this.initTooltips();
    }

    setupEventListeners() {
        // Form submission
        document.getElementById('promptForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.generatePrompt();
        });

        // Clear form
        document.getElementById('clearForm').addEventListener('click', () => {
            this.clearForm();
        });

        // Save prompt to library
        document.getElementById('savePrompt').addEventListener('click', () => {
            this.savePromptToLibrary();
        });

        // Copy output
        document.getElementById('copyOutput').addEventListener('click', () => {
            this.copyToClipboard();
        });

        // File upload
        const fileInput = document.getElementById('fileInput');
        const uploadZone = document.getElementById('uploadZone');

        fileInput.addEventListener('change', (e) => {
            this.handleFileUpload(e.target.files);
        });

        // Drag and drop functionality
        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.classList.add('dragover');
        });

        uploadZone.addEventListener('dragleave', () => {
            uploadZone.classList.remove('dragover');
        });

        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('dragover');
            this.handleFileUpload(e.dataTransfer.files);
        });

        uploadZone.addEventListener('click', () => {
            fileInput.click();
        });

        // Manual information save
        document.getElementById('saveManualInfo').addEventListener('click', () => {
            this.saveManualInformation();
        });

        // Clear library
        document.getElementById('clearLibrary').addEventListener('click', () => {
            this.clearPromptLibrary();
        });

        // URL fetching
        document.getElementById('fetchUrlBtn').addEventListener('click', () => {
            this.fetchWebContent();
        });

        // Enter key support for URL input
        document.getElementById('urlInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.fetchWebContent();
            }
        });

        // Sref functionality
        document.getElementById('saveSref').addEventListener('click', () => {
            this.saveSrefToLibrary();
        });

        document.getElementById('clearSref').addEventListener('click', () => {
            this.clearSrefForm();
        });

        document.getElementById('clearSrefLibrary').addEventListener('click', () => {
            this.clearSrefLibrary();
        });
    }

    generatePrompt() {
        const formData = this.getFormData();
        
        if (!this.validateForm(formData)) {
            return;
        }

        const generatedPrompt = this.buildPrompt(formData);
        const outputFormat = formData.outputFormat;
        
        let output;
        if (outputFormat === 'json') {
            output = this.formatAsJSON(formData, generatedPrompt);
        } else {
            output = generatedPrompt;
        }

        this.displayOutput(output, outputFormat);
        this.enableCopyButton();
    }

    getFormData() {
        return {
            model: document.getElementById('modelSelect').value,
            type: document.getElementById('promptType').value,
            startingPrompt: document.getElementById('startingPrompt').value,
            cameraAngle: document.getElementById('cameraAngle').value,
            perspective: document.getElementById('perspective').value,
            mood: document.getElementById('mood').value,
            colorScheme: document.getElementById('colorScheme').value,
            lighting: document.getElementById('lighting').value,
            artStyle: document.getElementById('artStyle').value,
            composition: document.getElementById('composition').value,
            quality: document.getElementById('quality').value,
            srefUrl: document.getElementById('srefUrl').value,
            srefWeight: document.getElementById('srefWeight').value,
            srefExplanation: document.getElementById('srefExplanation').value,
            outputFormat: document.getElementById('outputFormat').value
        };
    }

    validateForm(formData) {
        const requiredFields = ['model', 'type', 'startingPrompt'];
        const missingFields = requiredFields.filter(field => !formData[field]);
        
        if (missingFields.length > 0) {
            alert(`Please fill in the following required fields: ${missingFields.join(', ')}`);
            return false;
        }
        
        return true;
    }

    buildPrompt(formData) {
        let prompt = formData.startingPrompt;

        // Build an array of enhancements to add
        const enhancements = [];

        // Add camera angle if specified
        if (formData.cameraAngle) {
            enhancements.push(`${formData.cameraAngle} view`);
        }

        // Add perspective if specified
        if (formData.perspective) {
            enhancements.push(`${formData.perspective} perspective`);
        }

        // Add mood/emotion if specified
        if (formData.mood) {
            enhancements.push(`${formData.mood} mood`);
        }

        // Add color scheme if specified
        if (formData.colorScheme) {
            enhancements.push(`${formData.colorScheme.replace('-', ' ')} color palette`);
        }

        // Add lighting if specified
        if (formData.lighting) {
            enhancements.push(`${formData.lighting.replace('-', ' ')} lighting`);
        }

        // Add art style if specified
        if (formData.artStyle) {
            enhancements.push(`${formData.artStyle.replace('-', ' ')} style`);
        }

        // Add composition if specified
        if (formData.composition) {
            enhancements.push(`${formData.composition.replace('-', ' ')} composition`);
        }

        // Add quality parameters if specified
        if (formData.quality) {
            enhancements.push(`${formData.quality.replace('-', ' ')}`);
        }

        // Add model-specific enhancements based on uploaded documents
        const modelEnhancements = this.getModelEnhancements(formData.model);
        if (modelEnhancements) {
            enhancements.push(modelEnhancements);
        }

        // Combine prompt with enhancements
        if (enhancements.length > 0) {
            prompt += `, ${enhancements.join(', ')}`;
        }

        // Add style reference (sref) if specified
        if (formData.srefUrl) {
            const srefWeight = formData.srefWeight || 100;
            prompt += ` --sref ${formData.srefUrl}`;
            if (srefWeight !== 100) {
                prompt += ` --sw ${srefWeight}`;
            }
        }

        // Add manual information if available
        if (this.manualInformation) {
            prompt += `. Additional context: ${this.manualInformation}`;
        }

        return prompt;
    }

    getModelEnhancements(model) {
        // Check if we have specific enhancements for this model from uploaded documents
        const modelDoc = this.uploadedDocuments.find(doc => 
            doc.name.toLowerCase().includes(model.toLowerCase()) ||
            doc.content.toLowerCase().includes(model.toLowerCase())
        );
        
        if (modelDoc && modelDoc.enhancements) {
            return modelDoc.enhancements;
        }

        // Default enhancements based on model type
        const defaultEnhancements = {
            // Image Generation Models
            'midjourney': 'highly detailed, professional photography, 8k resolution, --style raw --quality 2',
            'dalle3': 'photorealistic, high quality, detailed, sharp focus, professional lighting',
            'stable-diffusion': 'masterpiece, best quality, ultra detailed, sharp focus, highly detailed',
            'flux1': 'high quality, detailed, professional, sharp, vibrant colors',
            'ideogram2': 'high resolution, detailed, professional design, clean composition',
            'leonardo-ai': 'cinematic lighting, high quality, detailed, professional photography',
            'nano-banana': 'natural editing, character consistency, scene preservation, high quality',
            'firefly': 'professional, high quality, detailed, Adobe quality, commercial grade',
            'imagen3': 'photorealistic, high quality, detailed, Google quality, sharp focus',
            
            // Video Generation Models
            'sora': 'cinematic, high quality video, smooth motion, professional cinematography, 4k',
            'veo2': 'high resolution video, smooth motion, professional quality, cinematic',
            'runway': 'cinematic video, high quality, professional, smooth transitions',
            'pika': 'creative video, high quality, engaging, smooth motion',
            'luma-dream': 'dreamy, cinematic, high quality video, smooth motion',
            'kling-ai': 'high quality video, cinematic, professional, smooth animation',
            'hailuo': 'cinematic, high quality video, detailed, professional motion',
            'haiper': 'high quality video, smooth motion, professional, detailed',
            
            // Text & Multimodal Models
            'gpt4': 'detailed, comprehensive, well-structured, professional',
            'claude': 'thorough, analytical, well-reasoned, detailed',
            'gemini': 'comprehensive, detailed, multi-faceted analysis',
            'llama': 'detailed, informative, well-structured'
        };

        return defaultEnhancements[model] || '';
    }

    formatAsJSON(formData, generatedPrompt) {
        const jsonOutput = {
            metadata: {
                model: formData.model,
                type: formData.type,
                timestamp: new Date().toISOString(),
                version: "1.0"
            },
            prompt: {
                original: formData.startingPrompt,
                enhanced: generatedPrompt,
                parameters: {
                    camera_angle: formData.cameraAngle || null,
                    perspective: formData.perspective || null,
                    mood: formData.mood || null,
                    color_scheme: formData.colorScheme || null,
                    lighting: formData.lighting || null,
                    art_style: formData.artStyle || null,
                    composition: formData.composition || null,
                    quality: formData.quality || null,
                    style_reference: {
                        url: formData.srefUrl || null,
                        weight: formData.srefWeight || null,
                        description: formData.srefExplanation || null
                    }
                }
            },
            context: {
                manual_information: this.manualInformation || null,
                uploaded_documents: this.uploadedDocuments.length,
                library_size: this.promptLibrary.length
            }
        };

        return JSON.stringify(jsonOutput, null, 2);
    }

    displayOutput(output, format) {
        const outputSection = document.getElementById('outputSection');
        
        if (format === 'json') {
            outputSection.innerHTML = `<pre><code>${output}</code></pre>`;
        } else {
            outputSection.innerHTML = `<p>${output}</p>`;
        }
        
        // Store the output for copying
        this.currentOutput = output;
    }

    enableCopyButton() {
        const copyButton = document.getElementById('copyOutput');
        copyButton.disabled = false;
    }

    copyToClipboard() {
        if (this.currentOutput) {
            navigator.clipboard.writeText(this.currentOutput).then(() => {
                // Show success feedback
                const button = document.getElementById('copyOutput');
                const originalText = button.innerHTML;
                button.innerHTML = '<i class="bi bi-check"></i> Copied!';
                button.classList.add('btn-success');
                button.classList.remove('btn-outline-primary');
                
                setTimeout(() => {
                    button.innerHTML = originalText;
                    button.classList.remove('btn-success');
                    button.classList.add('btn-outline-primary');
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy: ', err);
                alert('Failed to copy to clipboard');
            });
        }
    }

    clearForm() {
        document.getElementById('promptForm').reset();
        document.getElementById('srefUrl').value = '';
        document.getElementById('srefWeight').value = '';
        document.getElementById('srefExplanation').value = '';
        document.getElementById('outputSection').innerHTML = 
            '<p class="text-muted text-center mb-0"><i class="bi bi-arrow-up"></i> Fill out the form above and click "Generate Prompt" to see your output here</p>';
        document.getElementById('copyOutput').disabled = true;
        this.currentOutput = null;
    }

    savePromptToLibrary() {
        const formData = this.getFormData();
        
        if (!this.validateForm(formData)) {
            return;
        }

        const promptData = {
            id: Date.now(),
            name: formData.startingPrompt.substring(0, 50) + (formData.startingPrompt.length > 50 ? '...' : ''),
            model: formData.model,
            type: formData.type,
            startingPrompt: formData.startingPrompt,
            cameraAngle: formData.cameraAngle,
            perspective: formData.perspective,
            mood: formData.mood,
            colorScheme: formData.colorScheme,
            lighting: formData.lighting,
            artStyle: formData.artStyle,
            composition: formData.composition,
            quality: formData.quality,
            createdAt: new Date().toISOString()
        };

        this.promptLibrary.unshift(promptData);
        this.saveToLocalStorage('promptLibrary', this.promptLibrary);
        this.loadPromptLibrary();
        
        // Show success message
        this.showToast('Prompt saved to library successfully!', 'success');
    }

    loadPromptLibrary() {
        const libraryContainer = document.getElementById('promptLibrary');
        
        if (this.promptLibrary.length === 0) {
            libraryContainer.innerHTML = '<p class="text-muted text-center">No saved prompts yet</p>';
            return;
        }

        const libraryHTML = this.promptLibrary.map(prompt => `
            <div class="library-item" data-id="${prompt.id}">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <h6 class="mb-1">${prompt.name}</h6>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary btn-sm" onclick="app.loadPrompt(${prompt.id})">
                            <i class="bi bi-arrow-up-circle"></i>
                        </button>
                        <button class="btn btn-outline-danger btn-sm" onclick="app.deletePrompt(${prompt.id})">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
                <small class="text-muted">
                    <i class="bi bi-tag"></i> ${prompt.model} | ${prompt.type}
                    <br><i class="bi bi-clock"></i> ${new Date(prompt.createdAt).toLocaleDateString()}
                </small>
                <p class="mt-2 mb-0 small">${prompt.startingPrompt.substring(0, 100)}${prompt.startingPrompt.length > 100 ? '...' : ''}</p>
            </div>
        `).join('');

        libraryContainer.innerHTML = libraryHTML;
    }

    loadPrompt(id) {
        const prompt = this.promptLibrary.find(p => p.id === id);
        if (prompt) {
            document.getElementById('modelSelect').value = prompt.model;
            document.getElementById('promptType').value = prompt.type;
            document.getElementById('startingPrompt').value = prompt.startingPrompt;
            document.getElementById('cameraAngle').value = prompt.cameraAngle || '';
            document.getElementById('perspective').value = prompt.perspective || '';
            document.getElementById('mood').value = prompt.mood || '';
            document.getElementById('colorScheme').value = prompt.colorScheme || '';
            document.getElementById('lighting').value = prompt.lighting || '';
            document.getElementById('artStyle').value = prompt.artStyle || '';
            document.getElementById('composition').value = prompt.composition || '';
            document.getElementById('quality').value = prompt.quality || '';
            
            this.showToast('Prompt loaded successfully!', 'info');
        }
    }

    deletePrompt(id) {
        if (confirm('Are you sure you want to delete this prompt?')) {
            this.promptLibrary = this.promptLibrary.filter(p => p.id !== id);
            this.saveToLocalStorage('promptLibrary', this.promptLibrary);
            this.loadPromptLibrary();
            this.showToast('Prompt deleted successfully!', 'warning');
        }
    }

    clearPromptLibrary() {
        if (confirm('Are you sure you want to clear all saved prompts? This action cannot be undone.')) {
            this.promptLibrary = [];
            this.saveToLocalStorage('promptLibrary', this.promptLibrary);
            this.loadPromptLibrary();
            this.showToast('Prompt library cleared!', 'warning');
        }
    }

    handleFileUpload(files) {
        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target.result;
                const documentData = {
                    id: Date.now() + Math.random(),
                    name: file.name,
                    type: file.type,
                    size: file.size,
                    content: content,
                    uploadedAt: new Date().toISOString(),
                    source: 'file',
                    enhancements: this.extractEnhancements(content, file.name)
                };

                this.uploadedDocuments.push(documentData);
                this.saveToLocalStorage('uploadedDocuments', this.uploadedDocuments);
                this.loadUploadedFiles();
                this.showToast(`File "${file.name}" uploaded successfully!`, 'success');
            };
            reader.readAsText(file);
        });
    }

    async fetchWebContent() {
        const urlInput = document.getElementById('urlInput');
        const fetchBtn = document.getElementById('fetchUrlBtn');
        const url = urlInput.value.trim();

        if (!url) {
            this.showToast('Please enter a valid URL', 'warning');
            return;
        }

        if (!this.isValidUrl(url)) {
            this.showToast('Please enter a valid URL format', 'warning');
            return;
        }

        // Show loading state
        const originalBtnContent = fetchBtn.innerHTML;
        fetchBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Fetching...';
        fetchBtn.disabled = true;

        try {
            // Since we can't directly fetch from other domains due to CORS,
            // we'll use a CORS proxy service or implement a fallback method
            const content = await this.fetchUrlContent(url);
            
            if (content) {
                const documentData = {
                    id: Date.now() + Math.random(),
                    name: this.extractTitleFromUrl(url),
                    type: 'text/html',
                    size: content.length,
                    content: content,
                    url: url,
                    uploadedAt: new Date().toISOString(),
                    source: 'web',
                    enhancements: this.extractEnhancements(content, url)
                };

                this.uploadedDocuments.push(documentData);
                this.saveToLocalStorage('uploadedDocuments', this.uploadedDocuments);
                this.loadUploadedFiles();
                this.showToast(`Content from "${this.extractTitleFromUrl(url)}" added successfully!`, 'success');
                urlInput.value = '';
            }
        } catch (error) {
            console.error('Error fetching URL:', error);
            this.showToast('Failed to fetch content. Please check the URL or try again later.', 'danger');
        } finally {
            // Restore button state
            fetchBtn.innerHTML = originalBtnContent;
            fetchBtn.disabled = false;
        }
    }

    async fetchUrlContent(url) {
        // Method 1: Try direct fetch (will work for same-origin or CORS-enabled sites)
        try {
            const response = await fetch(url);
            if (response.ok) {
                const content = await response.text();
                return this.extractTextFromHtml(content);
            }
        } catch (error) {
            console.log('Direct fetch failed, trying alternative methods...');
        }

        // Method 2: Use a CORS proxy service
        const corsProxies = [
            'https://api.allorigins.win/get?url=',
            'https://cors-anywhere.herokuapp.com/',
            'https://thingproxy.freeboard.io/fetch/'
        ];

        for (const proxy of corsProxies) {
            try {
                const proxyUrl = proxy + encodeURIComponent(url);
                const response = await fetch(proxyUrl);
                
                if (response.ok) {
                    let content;
                    if (proxy.includes('allorigins')) {
                        const data = await response.json();
                        content = data.contents;
                    } else {
                        content = await response.text();
                    }
                    return this.extractTextFromHtml(content);
                }
            } catch (error) {
                console.log(`Proxy ${proxy} failed:`, error);
                continue;
            }
        }

        // Method 3: Fallback - ask user to manually copy content
        const userContent = prompt(
            `Unable to automatically fetch content from the URL due to browser security restrictions.\n\n` +
            `Please:\n` +
            `1. Open the URL in a new tab: ${url}\n` +
            `2. Copy the relevant text content\n` +
            `3. Paste it below:\n\n` +
            `(Or click Cancel to skip)`
        );

        if (userContent && userContent.trim()) {
            return userContent.trim();
        }

        throw new Error('Unable to fetch content');
    }

    extractTextFromHtml(html) {
        // Create a temporary DOM element to parse HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;

        // Remove script and style elements
        const scripts = tempDiv.querySelectorAll('script, style, nav, header, footer');
        scripts.forEach(el => el.remove());

        // Get text content and clean it up
        let text = tempDiv.textContent || tempDiv.innerText || '';
        
        // Clean up whitespace and normalize
        text = text.replace(/\s+/g, ' ').trim();
        
        // Limit length to avoid storage issues
        if (text.length > 10000) {
            text = text.substring(0, 10000) + '...';
        }

        return text;
    }

    extractTitleFromUrl(url) {
        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname.replace('www.', '');
            const pathname = urlObj.pathname.split('/').filter(p => p).join('-');
            return `${hostname}${pathname ? '-' + pathname : ''}`.substring(0, 50);
        } catch {
            return url.substring(0, 50);
        }
    }

    isValidUrl(string) {
        try {
            const url = new URL(string);
            return url.protocol === 'http:' || url.protocol === 'https:';
        } catch {
            return false;
        }
    }

    extractEnhancements(content, filename) {
        // Simple enhancement extraction logic
        // Look for common prompt enhancement keywords
        const enhancementKeywords = [
            'high quality', 'detailed', 'professional', 'cinematic', 'photorealistic',
            'masterpiece', '8k', '4k', 'ultra detailed', 'best quality', 'sharp focus',
            'highly detailed', 'intricate', 'elegant', 'smooth', 'vibrant colors'
        ];

        const foundEnhancements = enhancementKeywords.filter(keyword => 
            content.toLowerCase().includes(keyword.toLowerCase())
        );

        return foundEnhancements.length > 0 ? foundEnhancements.join(', ') : null;
    }

    loadUploadedFiles() {
        const container = document.getElementById('uploadedFiles');
        
        if (this.uploadedDocuments.length === 0) {
            container.innerHTML = '';
            return;
        }

        const filesHTML = this.uploadedDocuments.map(doc => `
            <div class="uploaded-file d-flex justify-content-between align-items-center p-2 border rounded mb-2">
                <div class="flex-grow-1">
                    <div class="d-flex align-items-center mb-1">
                        <i class="bi bi-${doc.source === 'web' ? 'globe' : 'file-text'} me-2 text-${doc.source === 'web' ? 'info' : 'primary'}"></i>
                        <small class="fw-semibold">${doc.name}</small>
                    </div>
                    <small class="text-muted">
                        ${this.formatFileSize(doc.size)} | ${new Date(doc.uploadedAt).toLocaleDateString()}
                        ${doc.url ? `<br><a href="${doc.url}" target="_blank" class="text-decoration-none small"><i class="bi bi-box-arrow-up-right"></i> View Source</a>` : ''}
                    </small>
                </div>
                <button class="btn btn-outline-danger btn-sm" onclick="app.deleteDocument(${doc.id})">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        `).join('');

        container.innerHTML = filesHTML;
    }

    deleteDocument(id) {
        if (confirm('Are you sure you want to delete this document?')) {
            this.uploadedDocuments = this.uploadedDocuments.filter(doc => doc.id !== id);
            this.saveToLocalStorage('uploadedDocuments', this.uploadedDocuments);
            this.loadUploadedFiles();
            this.showToast('Document deleted successfully!', 'warning');
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    saveManualInformation() {
        const manualInfo = document.getElementById('manualInfo').value;
        this.manualInformation = manualInfo;
        localStorage.setItem('manualInformation', manualInfo);
        this.showToast('Manual information saved!', 'success');
    }

    loadManualInformation() {
        document.getElementById('manualInfo').value = this.manualInformation;
    }

    saveToLocalStorage(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
    }

    showToast(message, type = 'info') {
        // Create a simple toast notification
        const toast = document.createElement('div');
        toast.className = `alert alert-${type} position-fixed top-0 end-0 m-3`;
        toast.style.zIndex = '9999';
        toast.innerHTML = `
            <div class="d-flex align-items-center">
                <i class="bi bi-${type === 'success' ? 'check-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'} me-2"></i>
                ${message}
                <button type="button" class="btn-close ms-auto" onclick="this.parentElement.parentElement.remove()"></button>
            </div>
        `;
        
        document.body.appendChild(toast);
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 3000);
    }

    // Sref Library Management Methods
    saveSrefToLibrary() {
        const srefUrl = document.getElementById('srefUrl').value.trim();
        const srefWeight = document.getElementById('srefWeight').value;
        const srefExplanation = document.getElementById('srefExplanation').value.trim();

        if (!srefUrl) {
            this.showToast('Please enter a style reference URL', 'warning');
            return;
        }

        if (!this.isValidUrl(srefUrl)) {
            this.showToast('Please enter a valid URL', 'warning');
            return;
        }

        const srefData = {
            id: Date.now(),
            url: srefUrl,
            weight: srefWeight || 100,
            explanation: srefExplanation || 'No description provided',
            name: this.extractNameFromUrl(srefUrl),
            createdAt: new Date().toISOString()
        };

        this.srefLibrary.unshift(srefData);
        this.saveToLocalStorage('srefLibrary', this.srefLibrary);
        this.loadSrefLibrary();
        this.showToast('Style reference saved to library!', 'success');
    }

    loadSrefLibrary() {
        const libraryContainer = document.getElementById('srefLibrary');
        
        if (this.srefLibrary.length === 0) {
            libraryContainer.innerHTML = '<p class="text-muted text-center">No saved style references yet</p>';
            return;
        }

        const libraryHTML = this.srefLibrary.map(sref => `
            <div class="library-item" data-id="${sref.id}">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <div class="flex-grow-1">
                        <h6 class="mb-1">${sref.name}</h6>
                        <small class="text-muted">
                            <i class="bi bi-sliders"></i> Weight: ${sref.weight}
                            <br><i class="bi bi-clock"></i> ${new Date(sref.createdAt).toLocaleDateString()}
                        </small>
                        <p class="mt-2 mb-2 small">${sref.explanation}</p>
                        <a href="${sref.url}" target="_blank" class="text-decoration-none small">
                            <i class="bi bi-box-arrow-up-right"></i> View Reference
                        </a>
                    </div>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary btn-sm" onclick="app.loadSref(${sref.id})">
                            <i class="bi bi-arrow-up-circle"></i>
                        </button>
                        <button class="btn btn-outline-danger btn-sm" onclick="app.deleteSref(${sref.id})">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

        libraryContainer.innerHTML = libraryHTML;
    }

    loadSref(id) {
        const sref = this.srefLibrary.find(s => s.id === id);
        if (sref) {
            document.getElementById('srefUrl').value = sref.url;
            document.getElementById('srefWeight').value = sref.weight;
            document.getElementById('srefExplanation').value = sref.explanation;
            this.showToast('Style reference loaded!', 'info');
        }
    }

    deleteSref(id) {
        if (confirm('Are you sure you want to delete this style reference?')) {
            this.srefLibrary = this.srefLibrary.filter(s => s.id !== id);
            this.saveToLocalStorage('srefLibrary', this.srefLibrary);
            this.loadSrefLibrary();
            this.showToast('Style reference deleted!', 'warning');
        }
    }

    clearSrefLibrary() {
        if (confirm('Are you sure you want to clear all style references? This action cannot be undone.')) {
            this.srefLibrary = [];
            this.saveToLocalStorage('srefLibrary', this.srefLibrary);
            this.loadSrefLibrary();
            this.showToast('Style reference library cleared!', 'warning');
        }
    }

    clearSrefForm() {
        document.getElementById('srefUrl').value = '';
        document.getElementById('srefWeight').value = '';
        document.getElementById('srefExplanation').value = '';
        this.showToast('Style reference form cleared', 'info');
    }

    extractNameFromUrl(url) {
        try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;
            const filename = pathname.split('/').pop();
            const nameWithoutExt = filename.split('.')[0];
            return nameWithoutExt || urlObj.hostname;
        } catch {
            return url.substring(0, 30) + (url.length > 30 ? '...' : '');
        }
    }

    initTooltipExplanations() {
        return {
            // Models
            'midjourney': 'AI art generator known for high-quality, artistic images with unique aesthetic styles',
            'dalle3': 'OpenAI\'s latest image generator with improved photorealism and text understanding',
            'stable-diffusion': 'Open-source image generator with extensive customization and fine-tuning options',
            'flux1': 'Advanced image generation model with excellent prompt following and realistic outputs',
            'ideogram2': 'Specialized in text-in-image generation and graphic design elements',
            'leonardo-ai': 'AI art platform focused on game assets, concept art, and creative imagery',
            'nano-banana': 'Character-consistent image editor for maintaining subjects across variations',
            'firefly': 'Adobe\'s commercial-safe AI image generator integrated with Creative Cloud',
            'imagen3': 'Google\'s photorealistic image generator with strong text adherence',
            'sora': 'OpenAI\'s video generation model capable of creating realistic 60-second videos',
            'veo2': 'Google\'s advanced video generation model with high-resolution output',
            'runway': 'Creative AI platform for video generation and editing with professional tools',
            'pika': 'AI video generator focused on creative and artistic video content',
            'luma-dream': 'Dream Machine for generating cinematic and surreal video content',
            'kling-ai': 'Chinese video generation model with strong motion and physics understanding',
            'hailuo': 'MiniMax\'s video generation model with good character consistency',
            'haiper': 'Video generation platform with focus on realistic motion and effects',
            'gpt4': 'OpenAI\'s most advanced language model for complex reasoning and analysis',
            'claude': 'Anthropic\'s AI assistant known for helpful, harmless, and honest responses',
            'gemini': 'Google\'s multimodal AI model capable of processing text, images, and code',
            'llama': 'Meta\'s open-source language model family with strong performance',
            'custom': 'Use this for any model not listed above',

            // Prompt Types
            'text-to-image': 'Generate images from text descriptions - most common AI art creation',
            'image-to-video': 'Animate existing images into video sequences with motion',
            'text-to-video': 'Create videos directly from text descriptions without source images',
            'text-to-text': 'Generate, edit, or transform text content using language models',
            'image-to-image': 'Transform or edit existing images while maintaining structure',

            // Camera Angles
            'eye-level': 'Natural perspective at human eye height - most relatable and common view',
            'high-angle': 'Camera positioned above subject looking down - creates vulnerability or overview',
            'low-angle': 'Camera positioned below subject looking up - creates power or dominance',
            'bird-eye': 'Extreme high angle from directly above - shows layout and spatial relationships',
            'worm-eye': 'Extreme low angle from ground level - creates dramatic scale and impact',
            'dutch-angle': 'Tilted camera angle - adds tension, unease, or dynamic energy',
            'over-shoulder': 'Camera behind one subject looking at another - creates intimacy and context',
            'close-up': 'Very tight framing on subject\'s face or details - emphasizes emotion',
            'medium-shot': 'Frames subject from waist up - balanced view showing person and environment',
            'wide-shot': 'Shows full subject and environment - establishes context and scale',

            // Perspectives
            'macro': 'Extreme close-up showing tiny details invisible to naked eye',
            'close-up': 'Tight framing focusing on specific details or facial expressions',
            'medium': 'Balanced view showing subject and some surrounding environment',
            'wide': 'Broad view establishing full scene context and spatial relationships',
            'panoramic': 'Ultra-wide horizontal view capturing expansive landscapes or scenes',
            'first-person': 'Viewpoint from subject\'s eyes - immersive and personal perspective',
            'third-person': 'External observer viewpoint - most common storytelling perspective',
            'isometric': '3D perspective with parallel lines - common in technical and game art',
            'orthographic': 'Flat projection without perspective distortion - technical drawings',

            // Moods
            'happy': 'Bright, cheerful, and uplifting emotional tone',
            'joyful': 'Exuberant celebration and pure happiness',
            'peaceful': 'Calm, tranquil, and serene atmosphere',
            'serene': 'Undisturbed calm and quiet beauty',
            'uplifting': 'Inspiring and emotionally elevating mood',
            'energetic': 'Dynamic, vibrant, and full of movement',
            'vibrant': 'Rich, lively, and full of life',
            'optimistic': 'Hopeful and positive outlook',
            'dramatic': 'Intense emotional impact with strong contrasts',
            'intense': 'Powerful, focused, and emotionally charged',
            'powerful': 'Strong, commanding, and impactful presence',
            'epic': 'Grand scale with heroic or legendary qualities',
            'heroic': 'Noble, brave, and inspiring courage',
            'majestic': 'Dignified grandeur and impressive beauty',
            'mysterious': 'Enigmatic and intriguingly unknown',
            'dark': 'Somber, brooding, or ominous atmosphere',
            'moody': 'Atmospheric with emotional depth and complexity',
            'eerie': 'Strange and unsettling in a supernatural way',
            'haunting': 'Persistently memorable and emotionally affecting',
            'suspenseful': 'Building tension and anticipation',
            'calm': 'Peaceful and undisturbed tranquility',
            'tranquil': 'Quietly peaceful and free from disturbance',
            'meditative': 'Contemplative and spiritually calming',
            'zen': 'Balanced harmony and mindful presence',
            'minimalist': 'Simple, clean, and uncluttered aesthetic',
            'romantic': 'Expressing love, affection, and intimate beauty',
            'dreamy': 'Soft, ethereal, and imagination-inspiring',
            'whimsical': 'Playfully creative and charmingly unusual',
            'ethereal': 'Otherworldly, delicate, and heavenly',
            'magical': 'Enchanting with supernatural wonder',

            // Color Schemes
            'warm-tones': 'Reds, oranges, yellows creating cozy and energetic feelings',
            'red-orange': 'Fiery palette evoking passion, energy, and warmth',
            'golden-hour': 'Soft golden light colors of sunrise/sunset',
            'sunset-colors': 'Rich oranges, pinks, and purples of evening sky',
            'earth-tones': 'Natural browns, tans, and muted colors from nature',
            'cool-tones': 'Blues, greens, purples creating calm and peaceful feelings',
            'blue-cyan': 'Ocean-inspired blues creating freshness and clarity',
            'ocean-blues': 'Deep sea colors from light aqua to navy blue',
            'winter-colors': 'Cool whites, blues, and grays of snowy landscapes',
            'mint-green': 'Fresh, clean green with cooling effect',
            'black-white': 'Classic monochrome with strong contrast and timeless appeal',
            'sepia': 'Vintage brown-toned look reminiscent of old photographs',
            'monochromatic': 'Single color in various shades and tints',
            'grayscale': 'Black, white, and gray tones without color',
            'neon-colors': 'Bright, electric colors that glow and pop',
            'rainbow': 'Full spectrum of vibrant colors',
            'saturated': 'Rich, intense colors at maximum vibrancy',
            'pastel': 'Soft, muted colors with white mixed in',
            'cyberpunk': 'Electric blues, magentas, and neons of futuristic cities',
            'forest-green': 'Deep natural greens of woodland environments',
            'desert-colors': 'Warm sands, terracottas, and dry earth tones',
            'autumn-colors': 'Rich reds, oranges, yellows of fall foliage',
            'spring-colors': 'Fresh greens, soft pastels of new growth',

            // Lighting
            'golden-hour': 'Warm, soft light during first/last hour of sun - most flattering',
            'blue-hour': 'Cool, even light just after sunset - mysterious and cinematic',
            'natural-light': 'Unmodified sunlight - realistic and authentic appearance',
            'sunlight': 'Direct bright sun - high contrast with strong shadows',
            'overcast': 'Soft, even light from cloudy sky - eliminates harsh shadows',
            'sunset': 'Warm, dramatic light as sun sets - romantic and golden',
            'sunrise': 'Fresh, hopeful light of early morning - clean and energizing',
            'moonlight': 'Cool, mysterious light from moon - ethereal and romantic',
            'soft-lighting': 'Gentle, diffused light - flattering and comfortable',
            'hard-lighting': 'Direct, focused light creating sharp shadows and contrast',
            'dramatic-lighting': 'High contrast light for emotional impact and mood',
            'rim-lighting': 'Light from behind subject creating glowing outline',
            'backlighting': 'Light source behind subject - creates silhouettes and halos',
            'key-lighting': 'Main light source illuminating subject - fundamental portrait lighting',
            'volumetric-lighting': 'Visible light beams through atmosphere - cinematic effect',
            'god-rays': 'Sunbeams streaming through clouds or openings - divine feeling',
            'atmospheric': 'Light interacting with air particles - creates depth and mood',
            'cinematic-lighting': 'Professional movie-style lighting with dramatic shadows',
            'moody-lighting': 'Low-key lighting creating atmosphere and emotion',
            'neon-lighting': 'Artificial colored light from neon signs - urban nightlife',
            'led-lighting': 'Modern artificial lighting - clean and controllable',
            'fluorescent': 'Cool artificial light - office or clinical feeling',
            'candlelight': 'Warm, flickering light - intimate and romantic',
            'fire-light': 'Dancing orange light from flames - primal and cozy',

            // Art Styles
            'photorealistic': 'Extremely realistic like a high-quality photograph',
            'portrait-photography': 'Professional headshots and people photography techniques',
            'landscape-photography': 'Natural scenery and outdoor photography styles',
            'street-photography': 'Candid urban life and documentary-style imagery',
            'macro-photography': 'Extreme close-up photography revealing tiny details',
            'digital-art': 'Created with digital tools - modern and versatile',
            'concept-art': 'Preliminary artwork for games, movies, and design projects',
            'matte-painting': 'Digital painted backgrounds for films and games',
            '3d-render': 'Computer-generated 3D imagery with realistic materials',
            'pixel-art': 'Retro digital art using individual pixels - nostalgic gaming style',
            'oil-painting': 'Traditional paint medium with rich textures and blending',
            'watercolor': 'Transparent paint creating soft, flowing effects',
            'acrylic-painting': 'Versatile paint medium with vibrant colors',
            'pencil-drawing': 'Graphite sketches with detailed shading and lines',
            'charcoal': 'Deep blacks and dramatic contrasts in traditional medium',
            'ink-drawing': 'Bold lines and stark contrasts using ink',
            'impressionist': 'Loose brushwork capturing light and moment - like Monet',
            'surrealist': 'Dreamlike and fantastical imagery - like Dalí',
            'abstract': 'Non-representational art focusing on color, form, and emotion',
            'minimalist': 'Simple, clean design with essential elements only',
            'baroque': 'Ornate, dramatic style with rich details and movement',
            'art-nouveau': 'Decorative style with natural forms and flowing lines',
            'anime-style': 'Japanese animation art with distinctive character designs',
            'cartoon': 'Simplified, exaggerated style for humor and clarity',
            'comic-book': 'Bold lines, bright colors, and dramatic action poses',
            'cyberpunk': 'Futuristic dystopian style with neon and technology',
            'steampunk': 'Victorian-era technology with brass and steam power',
            'vaporwave': 'Retro-futuristic aesthetic with pastels and 80s nostalgia',

            // Composition
            'rule-of-thirds': 'Place subjects on grid lines for balanced, pleasing composition',
            'centered': 'Subject in exact center - formal and symmetrical balance',
            'symmetrical': 'Balanced elements mirrored on both sides - harmony and order',
            'asymmetrical': 'Unbalanced elements creating dynamic tension and interest',
            'leading-lines': 'Lines guide viewer\'s eye to main subject - creates depth',
            'framing': 'Use environmental elements to frame subject - focuses attention',
            'diagonal': 'Angled elements create movement and dynamic energy',
            'golden-ratio': 'Mathematical proportion found in nature - naturally pleasing',
            'triangular': 'Three-point composition creating stability and strength',
            'spiral': 'Curved composition leading eye in spiral motion - creates flow',

            // Quality
            'ultra-high-quality': 'Maximum detail and technical excellence',
            'high-quality': 'Professional standard with excellent detail and clarity',
            'professional': 'Commercial-grade quality suitable for professional use',
            'detailed': 'Rich in fine details and intricate elements',
            'ultra-detailed': 'Extremely high level of detail in every aspect',
            'sharp-focus': 'Crisp, clear definition without blur',
            '8k-resolution': 'Ultra-high resolution (7680×4320 pixels) - extreme detail',
            '4k-resolution': 'High resolution (3840×2160 pixels) - excellent quality',
            'masterpiece': 'Exceptional artistic achievement and technical skill',
            'award-winning': 'Competition-quality work deserving recognition'
        };
    }

    initTooltips() {
        // Create tooltip element
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'custom-tooltip';
        document.body.appendChild(this.tooltip);

        // Find all select elements and add tooltip functionality
        const selects = document.querySelectorAll('.form-select');
        
        selects.forEach(select => {
            // Add event listeners to the select element for showing tooltips on hover
            select.addEventListener('mouseenter', (e) => {
                const selectedValue = e.target.value;
                if (selectedValue && this.tooltipExplanations[selectedValue]) {
                    this.showTooltip(e.target, this.tooltipExplanations[selectedValue]);
                }
            });

            select.addEventListener('mouseleave', () => {
                this.hideTooltip();
            });

            // Add change event to update tooltip when selection changes
            select.addEventListener('change', (e) => {
                if (this.tooltip.classList.contains('show')) {
                    const selectedValue = e.target.value;
                    if (selectedValue && this.tooltipExplanations[selectedValue]) {
                        this.showTooltip(e.target, this.tooltipExplanations[selectedValue]);
                    } else {
                        this.hideTooltip();
                    }
                }
            });
        });

        // Add option hover functionality for when dropdown is open
        document.addEventListener('mouseover', (e) => {
            if (e.target.tagName === 'OPTION' && e.target.value) {
                const explanation = this.tooltipExplanations[e.target.value];
                if (explanation) {
                    // For options, show tooltip near the select element
                    const selectElement = e.target.closest('select');
                    if (selectElement) {
                        this.showTooltip(selectElement, explanation);
                    }
                }
            }
        });
    }

    showTooltip(element, text) {
        this.tooltip.textContent = text;
        this.tooltip.classList.add('show');
        
        // Position tooltip
        const rect = element.getBoundingClientRect();
        const tooltipRect = this.tooltip.getBoundingClientRect();
        
        // Calculate position
        let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
        let top = rect.top - tooltipRect.height - 10;
        
        // Adjust if tooltip goes off screen
        if (left < 10) left = 10;
        if (left + tooltipRect.width > window.innerWidth - 10) {
            left = window.innerWidth - tooltipRect.width - 10;
        }
        
        if (top < 10) {
            top = rect.bottom + 10;
        }
        
        this.tooltip.style.left = left + 'px';
        this.tooltip.style.top = top + 'px';
    }

    hideTooltip() {
        this.tooltip.classList.remove('show');
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new PromptGenerator();
});

// Export for global access
window.PromptGenerator = PromptGenerator;
