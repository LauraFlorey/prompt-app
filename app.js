// Vanilla modal helper (replaces Bootstrap modals)
const PfModal = {
    show(el) {
        document.body.style.overflow = 'hidden';
        requestAnimationFrame(() => el.classList.add('show'));
    },
    hide(el) {
        el.classList.remove('show');
        document.body.style.overflow = '';
        setTimeout(() => {
            el.dispatchEvent(new Event('pf:hidden'));
            el.remove();
        }, 200);
    },
    create(html) {
        const overlay = document.createElement('div');
        overlay.className = 'pf-modal-overlay';
        overlay.innerHTML = html;
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) PfModal.hide(overlay);
        });
        overlay.querySelectorAll('[data-pf-dismiss="modal"]').forEach(btn => {
            btn.addEventListener('click', () => PfModal.hide(overlay));
        });
        document.body.appendChild(overlay);
        PfModal.show(overlay);
        return overlay;
    }
};

// Prompt Helper App
class PromptGenerator {
    constructor() {
        this.promptLibrary = [];
        this.uploadedDocuments = [];
        this.manualInformation = '';
        this.srefLibrary = [];
        this.textNotes = [];

        this.customOptions = {
            cameraAngle: [],
            perspective: [],
            mood: [],
            colorScheme: [],
            lighting: [],
            artStyle: [],
            composition: [],
            quality: []
        };

        this.llmSettings = {
            enabled: false,
            apiUrl: 'http://localhost:11434/api',
            model: 'llama3.1:8b',
            timeout: 10000
        };

        this.saveSettings = {
            autoSave: true,
            autoSaveInterval: 30000,
            backupOnClose: true,
            showSaveStatus: true,
            lastSaveTime: null
        };

        this.modelRegistry = [];

        this.hasUnsavedChanges = false;
        this.autoSaveTimer = null;
        this._debounceSaveTimer = null;
        this._lastSaveFailed = false;
        this._saveRetryPending = false;
        this.srefImageDataUrl = '';
        this.srefFormImageDataUrl = '';

        this.tooltipExplanations = this.initTooltipExplanations();
        this.promptTemplates = this.initPromptTemplates();
    }

    async init() {
        await this.initStorage();
        await this._loadDismissedMentions();
        this.rebuildModelDropdown();
        this.renderConfigModelTable();
        this.setupEventListeners();
        this.setupLifecycleEvents();
        this.setupAutoSave();
        this.loadPromptLibrary();
        this.loadManualInformation();
        this.loadUploadedFiles();
        this.loadSrefLibrary();
        this.loadCustomOptions();
        this.initTooltips();
        this.updateSaveStatus();
        this.updateStorageHealth();
        this.updateLibraryCounts();
        this._startSaveStatusTicker();
        this._restorePendingBadge();
        this._initTimelineTracking();
    }

    async initStorage() {
        try {
            const data = await StorageManager.loadAll();
            if (data.promptLibrary) this.promptLibrary = data.promptLibrary;
            if (data.srefLibrary) this.srefLibrary = data.srefLibrary;
            if (data.manualInformation) this.manualInformation = data.manualInformation;
            if (data.textNotes) this.textNotes = data.textNotes;
            if (data.customOptions) this.customOptions = { ...this.customOptions, ...data.customOptions };
            if (data.llmSettings) this.llmSettings = { ...this.llmSettings, ...data.llmSettings };
            if (data.modelRegistry) this.modelRegistry = data.modelRegistry;
        } catch (e) {
            console.warn('StorageManager.loadAll() failed, falling back to defaults:', e);
        }

        try {
            const raw = localStorage.getItem('saveSettings');
            if (raw) this.saveSettings = { ...this.saveSettings, ...JSON.parse(raw) };
        } catch { /* keep defaults */ }

        try {
            const raw = localStorage.getItem('uploadedDocuments');
            if (raw) this.uploadedDocuments = JSON.parse(raw) || [];
        } catch { /* keep defaults */ }
    }

    getCurrentAppState() {
        return {
            promptLibrary: this.promptLibrary,
            srefLibrary: this.srefLibrary,
            manualInformation: this.manualInformation,
            textNotes: this.textNotes,
            customOptions: this.customOptions,
            llmSettings: this.llmSettings,
            modelRegistry: ModelRegistry.getAll(),
            dismissedMentions: this._dismissedMentions || {}
        };
    }

    rebuildModelDropdown() {
        const select = document.getElementById('modelSelect');
        if (!select) return;

        const currentValue = select.value;

        while (select.firstChild) select.removeChild(select.firstChild);

        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Select Model';
        select.appendChild(placeholder);

        const items = ModelRegistry.getForDropdown();
        let currentGroup = null;
        let optgroup = null;

        for (const item of items) {
            if (item.groupLabel !== currentGroup) {
                currentGroup = item.groupLabel;
                optgroup = document.createElement('optgroup');
                optgroup.label = currentGroup;
                select.appendChild(optgroup);
            }
            const opt = document.createElement('option');
            opt.value = item.value;
            opt.textContent = item.label;
            optgroup.appendChild(opt);
        }

        if (currentValue) select.value = currentValue;
    }

    _getDismissedMentions() {
        if (!this._dismissedMentions) this._dismissedMentions = {};
        return this._dismissedMentions;
    }

    async _dismissMention(modelId, mentionUrl) {
        const dismissed = this._getDismissedMentions();
        dismissed[modelId] = mentionUrl;
        this._dismissedMentions = dismissed;
        try {
            await StorageManager.save('dismissedMentions', dismissed);
        } catch { /* non-critical */ }
        this.renderConfigModelTable();
        this._updatePendingBadge();
    }

    async _loadDismissedMentions() {
        try {
            const d = await StorageManager.load('dismissedMentions');
            this._dismissedMentions = d || {};
        } catch { this._dismissedMentions = {}; }
    }

    _isNewCandidate(model, result) {
        if (!result || result.status !== 'found' || !result.mentionDate) return false;
        const dismissed = this._getDismissedMentions();
        if (dismissed[model.id] === result.mentionUrl) return false;
        if (!model.releaseDate) return true;
        const mentionTs = new Date(result.mentionDate).getTime();
        const releaseTs = new Date(model.releaseDate).getTime();
        return mentionTs > releaseTs;
    }

    _countNewCandidates() {
        const models = ModelRegistry.getAll();
        let count = 0;
        for (const m of models) {
            const r = VersionChecker.getResultForModel(m.id);
            if (this._isNewCandidate(m, r)) count++;
        }
        return count;
    }

    async _updatePendingBadge() {
        const count = this._countNewCandidates();
        const configPill = document.querySelector('.pf-nav-pill[data-pf-tab="config"]');
        if (!configPill) return;
        let badge = configPill.querySelector('.pf-nav-badge');
        if (count > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'pf-nav-badge';
                configPill.appendChild(badge);
            }
            try { await StorageManager.save('pendingUpdateBadge', true); } catch { /* */ }
        } else {
            if (badge) badge.remove();
            try { await StorageManager.save('pendingUpdateBadge', false); } catch { /* */ }
        }
    }

    async _restorePendingBadge() {
        try {
            const pending = await StorageManager.load('pendingUpdateBadge');
            if (pending) {
                const count = this._countNewCandidates();
                if (count > 0) {
                    const configPill = document.querySelector('.pf-nav-pill[data-pf-tab="config"]');
                    if (configPill && !configPill.querySelector('.pf-nav-badge')) {
                        const badge = document.createElement('span');
                        badge.className = 'pf-nav-badge';
                        configPill.appendChild(badge);
                    }
                }
            }
        } catch { /* non-critical */ }
    }

    _buildMentionCell(model, result) {
        if (!result) return '<span class="pf-mention-ghost">—</span>';
        switch (result.status) {
            case 'found': {
                const rel = this._relativeTime(result.mentionDate);
                return `<a href="${result.mentionUrl || '#'}" target="_blank" rel="noopener" class="pf-mention-link">${rel || 'Recent'}</a>`;
            }
            case 'unchanged':
                return '<span class="pf-mention-ghost">No recent posts</span>';
            case 'unavailable':
                return `<button type="button" class="pf-mention-manual" data-manual-check="${model.id}"><i class="bi bi-box-arrow-up-right"></i> Manual</button>`;
            case 'error':
                return '<span class="pf-mention-amber">Check failed</span>';
            default:
                return '<span class="pf-mention-ghost">—</span>';
        }
    }

    renderConfigModelTable() {
        const tbody = document.getElementById('modelRegistryBody');
        if (!tbody) return;

        const models = ModelRegistry.getAll();
        tbody.innerHTML = '';
        const self = this;
        let newCount = 0;

        for (const m of models) {
            const result = VersionChecker.getResultForModel(m.id);
            const isNew = this._isNewCandidate(m, result);
            if (isNew) newCount++;

            const tr = document.createElement('tr');
            tr.setAttribute('data-model-row', m.id);
            const catLabel = m.category.charAt(0).toUpperCase() + m.category.slice(1);
            const vLabel = m.version.startsWith('v') ? m.version : `v${m.version}`;
            const newBadge = isNew ? `<span class="pf-new-badge" data-new-model="${m.id}">New?</span>` : '';
            const mentionHtml = this._buildMentionCell(m, result);
            const changelogHtml = m.changelogUrl
                ? `<a href="${m.changelogUrl}" target="_blank" rel="noopener" class="pf-changelog-link"><i class="bi bi-box-arrow-up-right"></i> Link</a>`
                : '<span style="color:var(--pf-text-ghost)">—</span>';
            const delCls = m.custom ? 'pf-chip' : 'pf-chip pf-btn-disabled';
            const delStyle = m.custom ? 'font-size:14px;color:var(--pf-text-muted)' : 'font-size:14px';

            tr.innerHTML =
                `<td>${m.name}</td>` +
                `<td><span class="pf-cat-pill" data-cat="${m.category}">${catLabel}</span></td>` +
                `<td><span class="pf-version-badge">${vLabel}</span>${newBadge}</td>` +
                `<td>${mentionHtml}</td>` +
                `<td>${changelogHtml}</td>` +
                `<td><div class="pf-model-actions-cell">` +
                    `<button type="button" class="pf-chip" data-edit-model="${m.id}">Edit</button>` +
                    `<button type="button" class="${delCls}" style="${delStyle}" data-delete-model="${m.id}">` +
                        `<i class="bi bi-trash3"></i></button>` +
                `</div></td>`;
            tbody.appendChild(tr);
        }

        tbody.querySelectorAll('[data-edit-model]').forEach(btn => {
            btn.addEventListener('click', () => {
                self._openModelEditRow(btn.getAttribute('data-edit-model'));
            });
        });

        tbody.querySelectorAll('[data-delete-model]').forEach(btn => {
            if (btn.classList.contains('pf-btn-disabled')) return;
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-delete-model');
                if (!confirm('Delete this custom model?')) return;
                const res = await ModelRegistry.remove(id);
                if (res.success) {
                    self.rebuildModelDropdown();
                    self.renderConfigModelTable();
                    self.showToast('Model removed', 'warning');
                } else {
                    self.showToast(res.error || 'Cannot delete', 'danger');
                }
            });
        });

        tbody.querySelectorAll('[data-new-model]').forEach(badge => {
            badge.addEventListener('click', () => {
                const id = badge.getAttribute('data-new-model');
                self._showNewHint(id);
            });
        });

        tbody.querySelectorAll('[data-manual-check]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-manual-check');
                self._showManualCheckRow(id);
            });
        });

        const summaryEl = document.getElementById('updateSummary');
        if (summaryEl) {
            if (newCount > 0) {
                summaryEl.textContent = `${newCount} model${newCount !== 1 ? 's' : ''} may have updates — review below`;
                summaryEl.style.display = '';
            } else {
                summaryEl.style.display = 'none';
            }
        }

        this._updateCheckTimestamp();
    }

    _updateCheckTimestamp() {
        const el = document.getElementById('checkUpdatesLast');
        if (!el) return;
        const age = VersionChecker.getCacheAge();
        if (age === Infinity) {
            el.textContent = '';
        } else if (age < 1) {
            el.textContent = 'Last checked: just now';
        } else {
            el.textContent = 'Last checked: ' + this._relativeTime(new Date(Date.now() - age * 60000).toISOString());
        }
    }

    _showNewHint(modelId) {
        const existingHint = document.querySelector(`tr.pf-new-hint-row[data-hint-for="${modelId}"]`);
        if (existingHint) { existingHint.remove(); return; }

        document.querySelectorAll('tr.pf-new-hint-row').forEach(r => r.remove());

        const result = VersionChecker.getResultForModel(modelId);
        if (!result) return;
        const dataRow = document.querySelector(`tr[data-model-row="${modelId}"]`);
        if (!dataRow) return;

        const colCount = dataRow.querySelectorAll('td').length;
        const hintRow = document.createElement('tr');
        hintRow.className = 'pf-new-hint-row';
        hintRow.setAttribute('data-hint-for', modelId);

        const td = document.createElement('td');
        td.setAttribute('colspan', colCount);

        const title = (result.latestMention || '').replace(/</g, '&lt;');
        const dateStr = result.mentionDate ? this._relativeTime(result.mentionDate) : '';
        const linkHref = result.mentionUrl || '#';

        td.innerHTML =
            `<div class="pf-new-hint">` +
                `A post newer than your recorded version was found:<br>` +
                `<span class="pf-new-hint-title">"${title}"</span> — ${dateStr}` +
                `<div class="pf-new-hint-actions">` +
                    `<a href="${linkHref}" target="_blank" rel="noopener" class="pf-chip">View post &#8599;</a>` +
                    `<button type="button" class="pf-chip active" data-hint-update="${modelId}">Update version</button>` +
                    `<button type="button" class="pf-chip" data-hint-dismiss="${modelId}">Dismiss</button>` +
                `</div>` +
            `</div>`;

        hintRow.appendChild(td);
        dataRow.after(hintRow);

        const self = this;

        hintRow.querySelector('[data-hint-update]').addEventListener('click', () => {
            hintRow.remove();
            self._openModelEditRow(modelId, true);
        });

        hintRow.querySelector('[data-hint-dismiss]').addEventListener('click', () => {
            hintRow.remove();
            self._dismissMention(modelId, result.mentionUrl);
        });
    }

    _showManualCheckRow(modelId) {
        const existing = document.querySelector(`tr.pf-manual-check-row[data-manual-for="${modelId}"]`);
        if (existing) { existing.remove(); return; }

        document.querySelectorAll('tr.pf-manual-check-row').forEach(r => r.remove());

        const model = ModelRegistry.getAll().find(m => m.id === modelId);
        if (!model) return;

        if (model.checkUrl) window.open(model.checkUrl, '_blank', 'noopener');

        const dataRow = document.querySelector(`tr[data-model-row="${modelId}"]`);
        if (!dataRow) return;

        const colCount = dataRow.querySelectorAll('td').length;
        const manRow = document.createElement('tr');
        manRow.className = 'pf-manual-check-row';
        manRow.setAttribute('data-manual-for', modelId);

        const td = document.createElement('td');
        td.setAttribute('colspan', colCount);
        td.innerHTML =
            `<div class="pf-manual-check-form">` +
                `<span>After checking ${model.name}'s changelog, update the version here if needed:</span>` +
                `<input class="pf-input" data-mc-version value="${(model.version || '').replace(/"/g, '&quot;')}">` +
                `<button type="button" class="pf-chip active" data-mc-save="${modelId}">Save</button>` +
                `<button type="button" class="pf-chip" data-mc-nochange="${modelId}">No change</button>` +
            `</div>`;

        manRow.appendChild(td);
        dataRow.after(manRow);

        const self = this;

        manRow.querySelector('[data-mc-nochange]').addEventListener('click', () => manRow.remove());

        manRow.querySelector('[data-mc-save]').addEventListener('click', async () => {
            const newVersion = manRow.querySelector('[data-mc-version]').value.trim();
            if (!newVersion) return;
            const today = new Date().toISOString().slice(0, 7);
            await ModelRegistry.update(modelId, { version: newVersion, releaseDate: today });
            manRow.remove();
            self.rebuildModelDropdown();
            self.renderConfigModelTable();
            self.showToast('Version updated', 'success');
        });
    }

    _openModelEditRow(id, focusVersion) {
        const existing = document.querySelector(`tr.pf-model-edit-row[data-edit-for="${id}"]`);
        if (existing) { existing.remove(); return; }

        document.querySelectorAll('tr.pf-model-edit-row').forEach(r => r.remove());

        const model = ModelRegistry.getAll().find(m => m.id === id);
        if (!model) return;

        const dataRow = document.querySelector(`tr[data-model-row="${id}"]`);
        if (!dataRow) return;

        const colCount = dataRow.querySelectorAll('td').length;
        const editRow = document.createElement('tr');
        editRow.className = 'pf-model-edit-row';
        editRow.setAttribute('data-edit-for', id);

        const td = document.createElement('td');
        td.setAttribute('colspan', colCount);

        td.innerHTML =
            `<div class="pf-model-edit-form">` +
                `<div class="pf-model-edit-grid">` +
                    `<div class="pf-field"><label>Name</label>` +
                        `<input class="pf-input" data-ef="name" value="${(model.name || '').replace(/"/g, '&quot;')}"></div>` +
                    `<div class="pf-field"><label>Version</label>` +
                        `<input class="pf-input" data-ef="version" value="${(model.version || '').replace(/"/g, '&quot;')}"></div>` +
                    `<div class="pf-field"><label>Release date</label>` +
                        `<input class="pf-input" data-ef="releaseDate" value="${model.releaseDate || ''}" placeholder="e.g. 2025-03"></div>` +
                    `<div class="pf-field"><label>Changelog URL</label>` +
                        `<input class="pf-input" data-ef="changelogUrl" value="${(model.changelogUrl || '').replace(/"/g, '&quot;')}"></div>` +
                    `<div class="pf-field"><label>Check URL</label>` +
                        `<input class="pf-input" data-ef="checkUrl" value="${(model.checkUrl || '').replace(/"/g, '&quot;')}"></div>` +
                    `<div class="pf-field"><label>Notes</label>` +
                        `<textarea class="pf-textarea" data-ef="notes" rows="2">${model.notes || ''}</textarea></div>` +
                `</div>` +
                `<div class="pf-model-edit-actions">` +
                    `<button type="button" class="pf-chip active" data-ef-save>` +
                        `<i class="bi bi-check-circle"></i> Save</button>` +
                    `<button type="button" class="pf-chip" data-ef-cancel>Cancel</button>` +
                `</div>` +
            `</div>`;

        editRow.appendChild(td);
        dataRow.after(editRow);

        if (focusVersion) {
            const versionInput = editRow.querySelector('[data-ef="version"]');
            if (versionInput) { versionInput.focus(); versionInput.select(); }
        }

        const self = this;

        editRow.querySelector('[data-ef-cancel]').addEventListener('click', () => editRow.remove());

        editRow.querySelector('[data-ef-save]').addEventListener('click', async () => {
            const fields = {};
            editRow.querySelectorAll('[data-ef]').forEach(el => {
                const key = el.getAttribute('data-ef');
                fields[key] = el.value.trim();
            });
            await ModelRegistry.update(id, fields);
            self.rebuildModelDropdown();
            self.renderConfigModelTable();
            self.showToast('Model updated', 'success');
        });
    }

    updateLibraryCounts() {
        // Update count badges in the library filter section
        const promptCount = document.getElementById('promptCount');
        const documentCount = document.getElementById('documentCount');
        const srefCount = document.getElementById('srefCount');
        const noteCount = document.getElementById('noteCount');

        if (promptCount) {
            promptCount.textContent = this.promptLibrary.length;
        }
        if (documentCount) {
            documentCount.textContent = this.uploadedDocuments.length;
        }
        if (srefCount) {
            srefCount.textContent = this.srefLibrary.length;
        }
        if (noteCount) {
            noteCount.textContent = this.textNotes.length;
        }
    }

    setupEventListeners() {
        // Form submission
        const promptForm = document.getElementById('promptForm');
        if (promptForm) {
            promptForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.generatePrompt();
            });
        }

        // Clear form
        const clearForm = document.getElementById('clearForm');
        if (clearForm) {
            clearForm.addEventListener('click', () => {
            this.clearForm();
        });
        }

        // Save prompt to library
        const savePrompt = document.getElementById('savePrompt');
        if (savePrompt) {
            savePrompt.addEventListener('click', () => {
            this.savePromptToLibrary();
        });
        }

        const saveToLibraryBtn = document.getElementById('saveToLibraryBtn');
        if (saveToLibraryBtn) {
            saveToLibraryBtn.addEventListener('click', () => {
                this.savePromptToLibrary();
            });
        }

        // Copy output
        const copyOutput = document.getElementById('copyOutput');
        if (copyOutput) {
            copyOutput.addEventListener('click', () => {
            this.copyToClipboard();
        });
        }

        // Download output
        const downloadOutput = document.getElementById('downloadOutput');
        if (downloadOutput) {
            downloadOutput.addEventListener('click', () => {
                this.downloadOutput();
            });
        }

        // Save to library (from output)
        const saveToLibrary = document.getElementById('saveToLibrary');
        if (saveToLibrary) {
            saveToLibrary.addEventListener('click', () => {
                this.savePromptToLibrary();
            });
        }

        // Export all prompts
        const exportAllPrompts = document.getElementById('exportAllPrompts');
        if (exportAllPrompts) {
            exportAllPrompts.addEventListener('click', () => {
                this.showExportAllModal();
            });
        }

        // Batch operations
        const batchOperations = document.getElementById('batchOperations');
        if (batchOperations) {
            batchOperations.addEventListener('click', () => {
                this.showBatchOperationsModal();
            });
        }

        // File upload - these elements are now dynamic, handled in showAddItemForm
        // Original file upload setup moved to dynamic form creation

        // Manual information save - moved to unified interface
        // Original manual info save moved to dynamic form creation

        // Clear library - moved to unified interface as clearAllLibrary
        // Original clear library moved to unified interface

        // URL fetching - moved to dynamic form creation in showAddItemForm
        // Original URL fetch setup moved to dynamic form creation

        // Sref Library form (now on Library tab)
        const srefFormSave = document.getElementById('srefFormSave');
        if (srefFormSave) {
            srefFormSave.addEventListener('click', () => this.saveSrefFromForm());
        }

        const srefFormClear = document.getElementById('srefFormClear');
        if (srefFormClear) {
            srefFormClear.addEventListener('click', () => this.clearSrefLibraryForm());
        }

        // Sref form type switching (URL, Code, Image) — Library tab form
        document.querySelectorAll('input[name="srefFormType"]').forEach(radio => {
            radio.addEventListener('change', (e) => this.switchSrefFormType(e.target.value));
        });

        // Sref form image upload
        const srefFormImageUpload = document.getElementById('srefFormImageUpload');
        if (srefFormImageUpload) {
            srefFormImageUpload.addEventListener('change', (e) => this.handleSrefFormImageUpload(e));
        }

        // Studio compact picker
        const srefPicker = document.getElementById('srefPicker');
        if (srefPicker) {
            srefPicker.addEventListener('change', (e) => this.onSrefPickerChange(e.target.value));
        }

        const srefPickerClear = document.getElementById('srefPickerClear');
        if (srefPickerClear) {
            srefPickerClear.addEventListener('click', () => this.clearActiveSref());
        }

        const srefPickerNew = document.getElementById('srefPickerNew');
        if (srefPickerNew) {
            srefPickerNew.addEventListener('click', () => this.openSrefCreator());
        }

        const srefPickerManage = document.getElementById('srefPickerManage');
        if (srefPickerManage) {
            srefPickerManage.addEventListener('click', () => this.switchToLibraryTab());
        }

        // Template buttons
        setTimeout(() => {
            document.querySelectorAll('[data-template]').forEach(button => {
                button.addEventListener('click', (e) => {
                    const templateType = e.currentTarget.getAttribute('data-template');
                    this.applyTemplate(templateType);
                });
            });
        }, 100);

        // Real-time validation for required fields
        const requiredFields = ['modelSelect', 'promptType', 'startingPrompt'];
        requiredFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.addEventListener('change', () => {
                    this.validateField(fieldId);
                });
                field.addEventListener('input', () => {
                    if (fieldId === 'startingPrompt') {
                        this.validateField(fieldId);
                    }
                });
            }
        });

        // Real-time validation and form enhancement
        setTimeout(() => {
            this.setupRealTimeValidation();
            this.setupFormEnhancements();
        }, 150);

        // Unified library functionality - wait for DOM to be ready
        setTimeout(() => {
            const addItemType = document.getElementById('addItemType');
            if (addItemType) {
                addItemType.addEventListener('change', (e) => {
                    this.showAddItemForm(e.target.value);
                });
            }
        }, 100);

        // Wait for all DOM elements to be ready
        setTimeout(() => {
            const unifiedSearchInput = document.getElementById('unifiedSearchInput');
            if (unifiedSearchInput) {
                unifiedSearchInput.addEventListener('input', (e) => {
                    this.performUnifiedSearch(e.target.value);
                });
            }

            // Search filter checkboxes
            ['searchPrompts', 'searchDocuments', 'searchSref', 'searchNotes'].forEach(id => {
                const element = document.getElementById(id);
                if (element) {
                    element.addEventListener('change', () => {
                        const searchInput = document.getElementById('unifiedSearchInput');
                        if (searchInput) {
                            this.performUnifiedSearch(searchInput.value);
                        }
                    });
                }
            });

            // Save Settings
            const saveSettingsBtn = document.getElementById('saveSettingsBtn');
            if (saveSettingsBtn) {
                saveSettingsBtn.addEventListener('click', () => {
                    this.showSaveSettings();
                });
            }

            // LLM Settings
            const llmSettingsBtn = document.getElementById('llmSettingsBtn');
            if (llmSettingsBtn) {
                llmSettingsBtn.addEventListener('click', () => {
                    this.showLLMSettings();
                });
            }

            // Clear all library
            const clearAllLibrary = document.getElementById('clearAllLibrary');
            if (clearAllLibrary) {
                clearAllLibrary.addEventListener('click', () => {
                    this.clearAllLibrary();
                });
            }
        }, 200);
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
        // Determine which sref type is selected
        const srefType = document.querySelector('input[name="srefType"]:checked')?.value || 'url';
        let srefValue = '';
        let srefWeight = '';
        
        if (srefType === 'url') {
            srefValue = document.getElementById('srefUrl')?.value || '';
            srefWeight = document.getElementById('srefWeight')?.value || '';
        } else if (srefType === 'code') {
            srefValue = document.getElementById('srefCode')?.value || '';
            srefWeight = document.getElementById('srefCodeWeight')?.value || '';
        } else if (srefType === 'image') {
            srefValue = this.srefImageDataUrl || '';
            srefWeight = document.getElementById('srefImageWeight')?.value || '';
        }
        
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
            srefType: srefType,
            srefValue: srefValue,
            srefUrl: srefType === 'url' ? srefValue : '',
            srefCode: srefType === 'code' ? srefValue : '',
            srefWeight: srefWeight,
            srefExplanation: document.getElementById('srefExplanation')?.value || '',
            outputFormat: document.getElementById('outputFormat').value
        };
    }

    validateForm(formData) {
        const errors = [];
        const warnings = [];
        
        // Clear previous validation states
        this.clearValidationStates();
        
        // Required field validation
        const requiredFields = ['model', 'type', 'startingPrompt'];
        const missingFields = requiredFields.filter(field => !formData[field]);
        
        if (missingFields.length > 0) {
            errors.push(`Missing required fields: ${missingFields.join(', ')}`);
            // Highlight missing fields
            missingFields.forEach(field => {
                this.highlightField(field, false);
            });
        }
        
        // Starting prompt validation
        if (formData.startingPrompt) {
            if (formData.startingPrompt.length < 3) {
                errors.push('Starting prompt must be at least 3 characters long');
            } else if (formData.startingPrompt.length > 2000) {
                warnings.push('Starting prompt is very long (>2000 chars) - consider shortening for better results');
            }
            
            // Check for common issues
            if (formData.startingPrompt.includes('  ')) {
                warnings.push('Starting prompt contains multiple spaces - consider cleaning up');
            }
        }
        
        // Model-specific validation
        if (formData.model && formData.type) {
            const validationResult = this.validateModelTypeCombination(formData.model, formData.type);
            if (validationResult.error) {
                errors.push(validationResult.error);
            }
            if (validationResult.warning) {
                warnings.push(validationResult.warning);
            }
        }
        
        // Style reference validation
        if (formData.srefValue) {
            if (formData.srefType === 'url') {
                if (!this.isValidUrl(formData.srefValue)) {
                    errors.push('Style reference URL is not valid');
                }
            } else if (formData.srefType === 'code') {
                // Validate sref code (alphanumeric, can have letters and numbers)
                if (!this.isValidSrefCode(formData.srefValue)) {
                    errors.push('Style reference code should be alphanumeric (e.g., 123456789 or 2342323dff)');
                }
            }
            // Image type doesn't need URL validation
            
            if (formData.srefWeight) {
                const weight = parseInt(formData.srefWeight);
                if (isNaN(weight) || weight < 0 || weight > 1000) {
                    errors.push('Style reference weight must be between 0 and 1000');
                }
            }
        }
        
        // Display validation results
        if (errors.length > 0 || warnings.length > 0) {
            this.showValidationResults(errors, warnings);
            return errors.length === 0; // Allow submission if only warnings
        }
        
        return true;
    }

    validateModelTypeCombination(model, type) {
        const incompatibleCombinations = {
            'gpt4': ['text-to-image', 'image-to-video', 'text-to-video', 'image-to-image'],
            'claude': ['text-to-image', 'image-to-video', 'text-to-video', 'image-to-image'],
            'gemini': ['text-to-image', 'image-to-video', 'text-to-video', 'image-to-image'],
            'llama': ['text-to-image', 'image-to-video', 'text-to-video', 'image-to-image'],
            'midjourney': ['text-to-text'],
            'dalle3': ['text-to-text'],
            'stable-diffusion': ['text-to-text'],
            'flux1': ['text-to-text']
        };
        
        if (incompatibleCombinations[model] && incompatibleCombinations[model].includes(type)) {
            return {
                error: `${model} doesn't support ${type} prompts. Consider changing the model or prompt type.`,
                warning: null
            };
        }
        
        // Check for optimal combinations
        const optimalCombinations = {
            'text-to-image': ['midjourney', 'dalle3', 'stable-diffusion', 'flux1', 'ideogram2'],
            'text-to-text': ['gpt4', 'claude', 'gemini', 'llama'],
            'text-to-video': ['sora', 'veo2', 'runway', 'pika', 'luma-dream']
        };
        
        if (optimalCombinations[type] && !optimalCombinations[type].includes(model)) {
            return {
                error: null,
                warning: `${model} may not be optimal for ${type}. Consider using: ${optimalCombinations[type].join(', ')}`
            };
        }
        
        return { error: null, warning: null };
    }

    clearValidationStates() {
        // Clear validation classes from all form fields
        const fields = ['modelSelect', 'promptType', 'startingPrompt'];
        fields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.classList.remove('is-invalid', 'is-valid');
            }
        });
    }

    highlightField(fieldName, isValid) {
        const fieldIdMap = {
            'model': 'modelSelect',
            'type': 'promptType',
            'startingPrompt': 'startingPrompt'
        };
        
        const fieldId = fieldIdMap[fieldName];
        if (fieldId) {
            const field = document.getElementById(fieldId);
            if (field) {
                field.classList.remove('is-invalid', 'is-valid');
                field.classList.add(isValid ? 'is-valid' : 'is-invalid');
            }
        }
    }

    validateField(fieldId) {
        const field = document.getElementById(fieldId);
        if (!field) return;

        const value = field.value.trim();
        let isValid = false;

        switch (fieldId) {
            case 'modelSelect':
            case 'promptType':
                isValid = value !== '';
                break;
            case 'startingPrompt':
                isValid = value.length >= 3;
                break;
        }

        field.classList.remove('is-invalid', 'is-valid');
        if (value !== '') { // Only show validation if user has interacted with the field
            field.classList.add(isValid ? 'is-valid' : 'is-invalid');
        }
    }

    showValidationResults(errors, warnings) {
        let message = '';
        
        if (errors.length > 0) {
            message += '❌ **Errors:**\n' + errors.map(e => `• ${e}`).join('\n') + '\n\n';
        }
        
        if (warnings.length > 0) {
            message += '⚠️ **Warnings:**\n' + warnings.map(w => `• ${w}`).join('\n');
        }
        
        // Create a more user-friendly modal instead of alert
        this.showValidationModal(errors, warnings);
    }

    showValidationModal(errors, warnings) {
        const modal = PfModal.create(`
            <div class="pf-pf-modal-dialog">
                <div class="pf-pf-modal-content">
                    <div class="pf-pf-modal-header">
                        <h5 class="pf-pf-modal-title" style="color: ${errors.length > 0 ? '#F87171' : '#FCD34D'}">
                            <i class="bi bi-${errors.length > 0 ? 'exclamation-triangle' : 'info-circle'}"></i>
                            ${errors.length > 0 ? 'Validation Errors' : 'Validation Warnings'}
                        </h5>
                        <button type="button" class="pf-btn-close" data-pf-dismiss="modal">&times;</button>
                    </div>
                    <div class="pf-pf-modal-body">
                        ${errors.length > 0 ? `
                        <div class="pf-alert pf-alert-danger">
                            <h6><i class="bi bi-x-circle"></i> Please fix these errors:</h6>
                            <ul style="margin-bottom: 0; padding-left: 1.25rem;">
                                ${errors.map(e => `<li>${e}</li>`).join('')}
                            </ul>
                        </div>
                        ` : ''}
                        ${warnings.length > 0 ? `
                        <div class="pf-alert pf-alert-warning">
                            <h6><i class="bi bi-exclamation-triangle"></i> Recommendations:</h6>
                            <ul style="margin-bottom: 0; padding-left: 1.25rem;">
                                ${warnings.map(w => `<li>${w}</li>`).join('')}
                            </ul>
                        </div>
                        ` : ''}
                    </div>
                    <div class="pf-pf-modal-footer">
                        <button type="button" class="pf-btn pf-btn-secondary" data-pf-dismiss="modal">Close</button>
                        ${errors.length === 0 ? `
                        <button type="button" class="pf-btn pf-btn-primary" data-pf-dismiss="modal">Continue Anyway</button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `);
    }

    setupRealTimeValidation() {
        // Starting prompt validation
        const startingPrompt = document.getElementById('startingPrompt');
        if (startingPrompt) {
            startingPrompt.addEventListener('input', () => {
                this.validateStartingPrompt();
            });
            startingPrompt.addEventListener('blur', () => {
                this.validateStartingPrompt();
            });
        }

        // Model and type combination validation
        const modelSelect = document.getElementById('modelSelect');
        const promptType = document.getElementById('promptType');
        
        if (modelSelect) {
            modelSelect.addEventListener('change', () => {
                this.validateModelTypeCombinationRealTime();
                this.updateFormBasedOnModel();
            });
        }
        
        if (promptType) {
            promptType.addEventListener('change', () => {
                this.validateModelTypeCombinationRealTime();
                this.updateFormBasedOnType();
            });
        }

        // Style reference validation
        const srefUrl = document.getElementById('srefUrl');
        const srefWeight = document.getElementById('srefWeight');
        
        if (srefUrl) {
            srefUrl.addEventListener('blur', () => {
                this.validateStyleReference();
            });
        }
        
        if (srefWeight) {
            srefWeight.addEventListener('input', () => {
                this.validateStyleReference();
            });
        }

        // Form completion progress
        this.updateFormProgress();
        document.querySelectorAll('#promptForm input, #promptForm select, #promptForm textarea').forEach(element => {
            element.addEventListener('input', () => {
                this.updateFormProgress();
            });
            element.addEventListener('change', () => {
                this.updateFormProgress();
            });
        });
    }

    setupFormEnhancements() {
        // Auto-suggestions based on model
        this.setupAutoSuggestions();
        
        // Smart defaults
        this.setupSmartDefaults();
        
        // Form shortcuts
        this.setupFormShortcuts();
    }

    validateStartingPrompt() {
        const startingPrompt = document.getElementById('startingPrompt');
        if (!startingPrompt) return;

        const value = startingPrompt.value.trim();
        const feedback = this.getFieldFeedback('startingPrompt');
        
        if (value.length === 0) {
            this.showFieldFeedback('startingPrompt', 'error', 'Starting prompt is required');
        } else if (value.length < 3) {
            this.showFieldFeedback('startingPrompt', 'error', 'Prompt must be at least 3 characters');
        } else if (value.length > 2000) {
            this.showFieldFeedback('startingPrompt', 'warning', 'Very long prompt (>2000 chars) - consider shortening');
        } else if (value.includes('  ')) {
            this.showFieldFeedback('startingPrompt', 'info', 'Consider removing extra spaces');
        } else {
            this.showFieldFeedback('startingPrompt', 'success', `${value.length} characters - good length!`);
        }
    }

    validateModelTypeCombinationRealTime() {
        const model = document.getElementById('modelSelect')?.value;
        const type = document.getElementById('promptType')?.value;
        
        if (!model || !type) return;

        const validation = this.validateModelTypeCombination(model, type);
        
        if (validation.error) {
            this.showFieldFeedback('promptType', 'error', validation.error);
        } else if (validation.warning) {
            this.showFieldFeedback('promptType', 'warning', validation.warning);
        } else {
            this.showFieldFeedback('promptType', 'success', 'Great combination!');
        }
    }

    validateStyleReference() {
        const url = document.getElementById('srefUrl')?.value;
        const weight = document.getElementById('srefWeight')?.value;
        
        if (url && !this.isValidUrl(url)) {
            this.showFieldFeedback('srefUrl', 'error', 'Invalid URL format');
        } else if (url) {
            this.showFieldFeedback('srefUrl', 'success', 'Valid URL');
        }
        
        if (weight) {
            const weightNum = parseInt(weight);
            if (isNaN(weightNum) || weightNum < 0 || weightNum > 1000) {
                this.showFieldFeedback('srefWeight', 'error', 'Weight must be 0-1000');
            } else {
                this.showFieldFeedback('srefWeight', 'success', 'Valid weight');
            }
        }
    }

    showFieldFeedback(fieldId, type, message) {
        const field = document.getElementById(fieldId);
        if (!field) return;

        // Remove existing feedback
        const existingFeedback = field.parentNode.querySelector('.field-feedback');
        if (existingFeedback) {
            existingFeedback.remove();
        }

        // Add new feedback
        const feedback = document.createElement('div');
        feedback.className = `field-feedback text-${type === 'error' ? 'danger' : type === 'warning' ? 'warning' : type === 'info' ? 'info' : 'success'} small mt-1`;
        
        // Safe rendering: build with DOM nodes
        const icon = document.createElement('i');
        icon.className = `bi bi-${type === 'error' ? 'x-circle' : type === 'warning' ? 'exclamation-triangle' : type === 'info' ? 'info-circle' : 'check-circle'}`;
        feedback.appendChild(icon);
        feedback.appendChild(document.createTextNode(' ' + message)); // Safe - textContent
        
        field.parentNode.appendChild(feedback);
        
        // Add visual styling to field
        field.classList.remove('is-valid', 'is-invalid');
        if (type === 'success') {
            field.classList.add('is-valid');
        } else if (type === 'error') {
            field.classList.add('is-invalid');
        }
    }

    getFieldFeedback(fieldId) {
        const field = document.getElementById(fieldId);
        if (!field) return null;
        
        const existingFeedback = field.parentNode.querySelector('.field-feedback');
        return existingFeedback;
    }

    updateFormBasedOnModel() {
        const model = document.getElementById('modelSelect')?.value;
        const promptType = document.getElementById('promptType');
        
        if (!model || !promptType) return;

        // Clear current options and add relevant ones
        const currentValue = promptType.value;
        
        // Enable/disable options based on model capabilities
        Array.from(promptType.options).forEach(option => {
            if (option.value === '') return; // Keep the placeholder
            
            const isSupported = this.isModelTypeSupported(model, option.value);
            option.disabled = !isSupported;
            
            if (!isSupported && option.selected) {
                option.selected = false;
                promptType.value = '';
            }
        });
    }

    updateFormBasedOnType() {
        const type = document.getElementById('promptType')?.value;
        const modelSelect = document.getElementById('modelSelect');
        
        if (!type || !modelSelect) return;

        // Highlight recommended models for this type
        Array.from(modelSelect.options).forEach(option => {
            if (option.value === '') return; // Keep the placeholder
            
            const isRecommended = this.isModelTypeOptimal(option.value, type);
            if (isRecommended) {
                option.style.fontWeight = 'bold';
            } else {
                option.style.fontWeight = 'normal';
            }
        });
    }

    isModelTypeSupported(model, type) {
        const incompatibleCombinations = {
            'gpt4': ['text-to-image', 'image-to-video', 'text-to-video', 'image-to-image'],
            'claude': ['text-to-image', 'image-to-video', 'text-to-video', 'image-to-image'],
            'gemini': ['text-to-image', 'image-to-video', 'text-to-video', 'image-to-image'],
            'llama': ['text-to-image', 'image-to-video', 'text-to-video', 'image-to-image'],
            'midjourney': ['text-to-text'],
            'dalle3': ['text-to-text'],
            'stable-diffusion': ['text-to-text'],
            'flux1': ['text-to-text']
        };
        
        return !(incompatibleCombinations[model] && incompatibleCombinations[model].includes(type));
    }

    isModelTypeOptimal(model, type) {
        const optimalCombinations = {
            'text-to-image': ['midjourney', 'dalle3', 'stable-diffusion', 'flux1', 'ideogram2'],
            'text-to-text': ['gpt4', 'claude', 'gemini', 'llama'],
            'text-to-video': ['sora', 'veo2', 'runway', 'pika', 'luma-dream']
        };
        
        return optimalCombinations[type] && optimalCombinations[type].includes(model);
    }

    updateFormProgress() {
        const requiredFields = ['modelSelect', 'promptType', 'startingPrompt'];
        let completedFields = 0;
        
        requiredFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field && field.value.trim() !== '') {
                completedFields++;
            }
        });
        
        const progress = (completedFields / requiredFields.length) * 100;
        
        // Update progress indicator
        const progressIndicator = document.getElementById('formProgress');
        const progressText = document.getElementById('progressText');
        
        if (progressIndicator) {
            progressIndicator.style.width = `${progress}%`;
            progressIndicator.setAttribute('aria-valuenow', progress);
        }
        
        if (progressText) {
            progressText.textContent = `${Math.round(progress)}%`;
        }
        
        // Enable/disable generate button
        const generateButton = document.querySelector('button[type="submit"]');
        if (generateButton) {
            generateButton.disabled = progress < 100;
        }
    }

    setupAutoSuggestions() {
        // Add auto-suggestions for starting prompt based on model
        const startingPrompt = document.getElementById('startingPrompt');
        if (startingPrompt) {
            startingPrompt.addEventListener('focus', () => {
                this.showPromptSuggestions();
            });
        }
    }

    setupSmartDefaults() {
        // Set smart defaults based on model selection
        const modelSelect = document.getElementById('modelSelect');
        if (modelSelect) {
            modelSelect.addEventListener('change', () => {
                this.applySmartDefaults();
            });
        }
    }

    setupFormShortcuts() {
        // Add keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 'Enter':
                        e.preventDefault();
                        this.generatePrompt();
                        break;
                    case 's':
                        e.preventDefault();
                        this.savePromptToLibrary();
                        break;
                    case 'c':
                        if (this.currentOutput) {
                            e.preventDefault();
                            this.copyToClipboard();
                        }
                        break;
                }
            }
        });
    }

    showPromptSuggestions() {
        const model = document.getElementById('modelSelect')?.value;
        const type = document.getElementById('promptType')?.value;
        
        if (!model || !type) return;

        const suggestions = this.getPromptSuggestions(model, type);
        if (suggestions.length === 0) return;

        // Create suggestions dropdown
        const suggestionsContainer = document.createElement('div');
        suggestionsContainer.className = 'prompt-suggestions dropdown-menu show';
        suggestionsContainer.innerHTML = suggestions.map(suggestion => 
            `<button class="dropdown-item" type="button" onclick="app.applySuggestion('${suggestion.replace(/'/g, "\\'")}')">${suggestion}</button>`
        ).join('');
        
        // Position and show suggestions
        const startingPrompt = document.getElementById('startingPrompt');
        startingPrompt.parentNode.appendChild(suggestionsContainer);
        
        // Hide after selection or click outside
        setTimeout(() => {
            document.addEventListener('click', () => {
                suggestionsContainer.remove();
            }, { once: true });
        }, 100);
    }

    getPromptSuggestions(model, type) {
        const suggestions = {
            'text-to-image': [
                'a beautiful landscape',
                'portrait of a person',
                'abstract art piece',
                'futuristic cityscape',
                'fantasy creature'
            ],
            'text-to-text': [
                'Write a compelling blog post about',
                'Create a professional email for',
                'Summarize the following text:',
                'Explain the concept of',
                'Generate creative ideas for'
            ],
            'text-to-video': [
                'cinematic shot of',
                'animated sequence showing',
                'timelapse of',
                'dramatic scene with',
                'peaceful moment featuring'
            ]
        };
        
        return suggestions[type] || [];
    }

    applySuggestion(suggestion) {
        const startingPrompt = document.getElementById('startingPrompt');
        if (startingPrompt) {
            startingPrompt.value = suggestion;
            startingPrompt.focus();
            this.validateStartingPrompt();
        }
    }

    applySmartDefaults() {
        const model = document.getElementById('modelSelect')?.value;
        if (!model) return;

        const defaults = {
            'midjourney': { type: 'text-to-image', quality: 'high-quality' },
            'dalle3': { type: 'text-to-image', quality: 'high-quality' },
            'gpt4': { type: 'text-to-text', quality: 'detailed' },
            'claude': { type: 'text-to-text', quality: 'detailed' },
            'sora': { type: 'text-to-video', quality: 'high-quality' }
        };

        const defaultSettings = defaults[model];
        if (defaultSettings) {
            if (defaultSettings.type) {
                const promptType = document.getElementById('promptType');
                if (promptType) promptType.value = defaultSettings.type;
            }
            
            if (defaultSettings.quality) {
                const quality = document.getElementById('quality');
                if (quality) quality.value = defaultSettings.quality;
            }
        }
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

        // Add style reference (sref) if specified.
        // - Midjourney: keep `--sref` / `--sw` flags
        // - Other models: preserve sref details as plain-language enhancement notes
        let midjourneySrefSuffix = '';
        if (formData.srefValue) {
            const rawWeight = formData.srefWeight;
            const hasWeight = rawWeight !== undefined && rawWeight !== null && String(rawWeight).trim() !== '';
            const srefWeight = hasWeight ? String(rawWeight).trim() : '';

            if (formData.model === 'midjourney') {
                midjourneySrefSuffix += ` --sref ${formData.srefValue}`;
                if (hasWeight && parseInt(srefWeight, 10) !== 100) {
                    midjourneySrefSuffix += ` --sw ${srefWeight}`;
                }
            } else {
                const typeLabel = (formData.srefType || 'url').toUpperCase();
                const weightNote = hasWeight ? ` (weight: ${srefWeight})` : '';
                enhancements.push(`Style reference [${typeLabel}]: ${formData.srefValue}${weightNote}`);
            }
        }

        // Combine prompt with enhancements
        if (enhancements.length > 0) {
            prompt += `, ${enhancements.join(', ')}`;
        }

        // Append any model-specific suffixes (e.g. Midjourney sref flags)
        if (midjourneySrefSuffix) {
            prompt += midjourneySrefSuffix;
        }

        // Manual information is for notes about documents, not prompt injection

        return prompt;
    }

    getModelEnhancements(model) {
        // Check if we have specific enhancements for this model from uploaded documents
        const modelDoc = this.uploadedDocuments.find(doc => 
            doc.name.toLowerCase().includes(model.toLowerCase()) ||
            doc.content.toLowerCase().includes(model.toLowerCase())
        );
        
        if (modelDoc && modelDoc.enhancements) {
            // If enhancements is an object, extract the enhancements string property
            if (typeof modelDoc.enhancements === 'object' && modelDoc.enhancements.enhancements) {
                return modelDoc.enhancements.enhancements;
            }
            // If it's already a string, return it
            if (typeof modelDoc.enhancements === 'string') {
                return modelDoc.enhancements;
            }
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
                document_notes: this.manualInformation || null,
                uploaded_documents: this.uploadedDocuments.length,
                library_size: this.promptLibrary.length
            }
        };

        return JSON.stringify(jsonOutput, null, 2);
    }

    formatAsMarkdown(prompt) {
        const formData = this.getFormData();
        const timestamp = new Date().toLocaleString();
        
        return `# AI Prompt Generated

**Generated:** ${timestamp}  
**Model:** ${formData.model}  
**Type:** ${formData.type}

## Prompt
\`\`\`
${prompt}
\`\`\`

## Settings
- **Camera Angle:** ${formData.cameraAngle || 'Not specified'}
- **Perspective:** ${formData.perspective || 'Not specified'}
- **Mood:** ${formData.mood || 'Not specified'}
- **Color Scheme:** ${formData.colorScheme || 'Not specified'}
- **Lighting:** ${formData.lighting || 'Not specified'}
- **Art Style:** ${formData.artStyle || 'Not specified'}
- **Composition:** ${formData.composition || 'Not specified'}
- **Quality:** ${formData.quality || 'Not specified'}

## Style Reference
${formData.srefUrl ? `- **URL:** ${formData.srefUrl}` : 'No style reference'}
${formData.srefWeight ? `- **Weight:** ${formData.srefWeight}` : ''}
${formData.srefExplanation ? `- **Description:** ${formData.srefExplanation}` : ''}

---
*Generated by Prompt Helper v2.0*`;
    }

    formatAsCSV(prompt) {
        const formData = this.getFormData();
        const timestamp = new Date().toLocaleString();
        
        const headers = [
            'Timestamp', 'Model', 'Type', 'Prompt', 'Camera Angle', 'Perspective', 
            'Mood', 'Color Scheme', 'Lighting', 'Art Style', 'Composition', 
            'Quality', 'Sref URL', 'Sref Weight', 'Sref Description'
        ];
        
        const values = [
            timestamp, formData.model, formData.type, `"${prompt.replace(/"/g, '""')}"`,
            formData.cameraAngle || '', formData.perspective || '', formData.mood || '',
            formData.colorScheme || '', formData.lighting || '', formData.artStyle || '',
            formData.composition || '', formData.quality || '', formData.srefUrl || '',
            formData.srefWeight || '', `"${(formData.srefExplanation || '').replace(/"/g, '""')}"`
        ];
        
        return headers.join(',') + '\n' + values.join(',');
    }

    formatAsHTML(prompt) {
        const formData = this.getFormData();
        const timestamp = new Date().toLocaleString();
        
        return `
            <div class="prompt-output">
                <h2>AI Prompt Generated</h2>
                <div class="prompt-meta">
                    <p><strong>Generated:</strong> ${timestamp}</p>
                    <p><strong>Model:</strong> ${formData.model}</p>
                    <p><strong>Type:</strong> ${formData.type}</p>
                </div>
                <div class="prompt-content">
                    <h3>Prompt</h3>
                    <pre class="prompt-text">${prompt}</pre>
                </div>
                <div class="prompt-settings">
                    <h3>Settings</h3>
                    <ul>
                        <li><strong>Camera Angle:</strong> ${formData.cameraAngle || 'Not specified'}</li>
                        <li><strong>Perspective:</strong> ${formData.perspective || 'Not specified'}</li>
                        <li><strong>Mood:</strong> ${formData.mood || 'Not specified'}</li>
                        <li><strong>Color Scheme:</strong> ${formData.colorScheme || 'Not specified'}</li>
                        <li><strong>Lighting:</strong> ${formData.lighting || 'Not specified'}</li>
                        <li><strong>Art Style:</strong> ${formData.artStyle || 'Not specified'}</li>
                        <li><strong>Composition:</strong> ${formData.composition || 'Not specified'}</li>
                        <li><strong>Quality:</strong> ${formData.quality || 'Not specified'}</li>
                    </ul>
                </div>
                ${formData.srefUrl ? `
                <div class="style-reference">
                    <h3>Style Reference</h3>
                    <ul>
                        <li><strong>URL:</strong> <a href="${formData.srefUrl}" target="_blank">${formData.srefUrl}</a></li>
                        <li><strong>Weight:</strong> ${formData.srefWeight || 'Not specified'}</li>
                        <li><strong>Description:</strong> ${formData.srefExplanation || 'Not specified'}</li>
                    </ul>
                </div>
                ` : ''}
                <hr>
                <p><em>Generated by Prompt Helper v2.0</em></p>
            </div>
        `;
    }

    displayOutput(output, format) {
        const outputSection = document.getElementById('outputSection');
        if (!outputSection) return;

        // Clear first, then render using DOM nodes to avoid HTML injection
        outputSection.replaceChildren();

        const safeOutput = output ?? '';
        
        switch (format) {
            case 'json':
                {
                    const pre = document.createElement('pre');
                    pre.className = 'mb-0';
                    const code = document.createElement('code');
                    code.textContent = String(safeOutput);
                    pre.appendChild(code);
                    outputSection.appendChild(pre);
                }
                break;
            case 'markdown':
                // Convert to markdown format
                {
                    const markdownOutput = this.formatAsMarkdown(safeOutput);
                    const pre = document.createElement('pre');
                    pre.className = 'mb-0';
                    const code = document.createElement('code');
                    code.textContent = String(markdownOutput ?? '');
                    pre.appendChild(code);
                    outputSection.appendChild(pre);
                }
                break;
            case 'csv':
                // Convert to CSV format
                {
                    const csvOutput = this.formatAsCSV(safeOutput);
                    const pre = document.createElement('pre');
                    pre.className = 'mb-0';
                    const code = document.createElement('code');
                    code.textContent = String(csvOutput ?? '');
                    pre.appendChild(code);
                    outputSection.appendChild(pre);
                }
                break;
            case 'html':
                // Convert to HTML format
                {
                    const htmlOutput = this.formatAsHTML(safeOutput);
                    // Render HTML in an isolated, sandboxed iframe so exported HTML cannot execute in host page
                    const iframe = document.createElement('iframe');
                    iframe.className = 'w-full border rounded';
                    iframe.style.minHeight = '420px';
                    iframe.setAttribute('sandbox', '');
                    iframe.setAttribute('referrerpolicy', 'no-referrer');
                    iframe.srcdoc = String(htmlOutput ?? '');
                    outputSection.appendChild(iframe);
                }
                break;
            default: // text
                {
                    const p = document.createElement('p');
                    p.className = 'mb-0';
                    p.textContent = String(safeOutput);
                    outputSection.appendChild(p);
                }
                break;
        }
        
        // Store the output for copying/downloading
        this.currentOutput = output;
        this.currentFormat = format;
    }

    enableCopyButton() {
        const copyButton = document.getElementById('copyOutput');
        const downloadButton = document.getElementById('downloadOutput');
        const saveButton = document.getElementById('saveToLibrary');
        
        if (copyButton) copyButton.disabled = false;
        if (downloadButton) downloadButton.disabled = false;
        if (saveButton) saveButton.disabled = false;
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

    downloadOutput() {
        if (!this.currentOutput) {
            this.showToast('No output to download', 'warning');
            return;
        }

        const formData = this.getFormData();
        const timestamp = new Date().toISOString().split('T')[0];
        const filename = `prompt_${formData.model}_${timestamp}.${this.getFileExtension(this.currentFormat)}`;
        
        let content = this.currentOutput;
        
        // Format content based on current format
        switch (this.currentFormat) {
            case 'markdown':
                content = this.formatAsMarkdown(this.currentOutput);
                break;
            case 'csv':
                content = this.formatAsCSV(this.currentOutput);
                break;
            case 'html':
                content = this.formatAsHTML(this.currentOutput);
                break;
        }

        this.downloadFile(content, filename, this.getMimeType(this.currentFormat));
        this.showToast(`Downloaded as ${filename}`, 'success');
    }

    getFileExtension(format) {
        const extensions = {
            'text': 'txt',
            'json': 'json',
            'markdown': 'md',
            'csv': 'csv',
            'html': 'html'
        };
        return extensions[format] || 'txt';
    }

    getMimeType(format) {
        const mimeTypes = {
            'text': 'text/plain',
            'json': 'application/json',
            'markdown': 'text/markdown',
            'csv': 'text/csv',
            'html': 'text/html'
        };
        return mimeTypes[format] || 'text/plain';
    }

    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    clearForm() {
        const form = document.getElementById('promptForm');
        if (form) form.reset();

        // Clear active sref (hidden fields + picker)
        ['srefUrl', 'srefWeight', 'srefCode', 'srefCodeWeight', 'srefImageWeight'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        const srefExplanation = document.getElementById('srefExplanation');
        if (srefExplanation) srefExplanation.value = '';
        this.srefImageDataUrl = '';

        const urlRadio = document.getElementById('srefTypeUrl');
        if (urlRadio) urlRadio.checked = true;

        const picker = document.getElementById('srefPicker');
        if (picker) picker.value = '';
        const pickerPreview = document.getElementById('srefPickerPreview');
        if (pickerPreview) pickerPreview.style.display = 'none';

        // Reset output section (no innerHTML)
        const outputSection = document.getElementById('outputSection');
        if (outputSection) {
            outputSection.replaceChildren();
            const p = document.createElement('p');
            p.className = 'text-muted text-center mb-0';
            const icon = document.createElement('i');
            icon.className = 'bi bi-arrow-up';
            p.appendChild(icon);
            p.appendChild(document.createTextNode(' Fill out the form above and click "Generate Prompt" to see your output here'));
            outputSection.appendChild(p);
        }

        const copyBtn = document.getElementById('copyOutput');
        if (copyBtn) copyBtn.disabled = true;

        this.currentOutput = null;
    }

    applyTemplate(templateType) {
        const template = this.promptTemplates[templateType];
        if (!template) {
            console.error('Template not found:', templateType);
            return;
        }

        const fieldIdMap = {
            model: 'modelSelect',
            type: 'promptType',
            startingPrompt: 'startingPrompt',
            cameraAngle: 'cameraAngle',
            perspective: 'perspective',
            mood: 'mood',
            colorScheme: 'colorScheme',
            lighting: 'lighting',
            artStyle: 'artStyle',
            composition: 'composition',
            quality: 'quality'
        };

        Object.entries(fieldIdMap).forEach(([field, elementId]) => {
            const element = document.getElementById(elementId);
            if (element && template[field]) {
                const hasOption = element.tagName === 'SELECT'
                    ? Array.from(element.options).some(o => o.value === template[field])
                    : true;
                if (hasOption) {
                    element.value = template[field];
                }
            }
        });

        this.updateFormProgress();
        if (typeof this._updateTimeline === 'function') {
            this._updateTimeline();
        }

        const templateNames = {
            'image-generation': 'Image Generation',
            'portrait-photography': 'Portrait Photography',
            'character-design': 'Character Design',
            'product-photography': 'Product Photography',
            'video-generation': 'Video Generation',
            'animation-style': 'Animation Style'
        };

        this.showToast(`${templateNames[templateType]} template applied!`, 'success');
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
        this.markAsSaved();
        this.updateLibraryCounts();
        
        // Show success message
        this.showToast('Prompt saved to library successfully!', 'success');
    }

    loadPromptLibrary() {
        const libraryContainer = document.getElementById('promptLibrary');
        
        // Element no longer exists in unified interface
        if (!libraryContainer) {
            return;
        }
        
        if (this.promptLibrary.length === 0) {
            libraryContainer.replaceChildren();
            const p = document.createElement('p');
            p.className = 'text-muted text-center';
            p.textContent = 'No saved prompts yet';
            libraryContainer.appendChild(p);
            return;
        }

        // Safe DOM rendering to prevent XSS
        libraryContainer.replaceChildren();
        
        this.promptLibrary.forEach(prompt => {
            const item = document.createElement('div');
            item.className = 'library-item';
            item.dataset.id = prompt.id;
            
            // Header row with title and buttons
            const header = document.createElement('div');
            header.className = 'flex justify-between items-start';
            
            const title = document.createElement('h6');
            title.className = 'mb-1';
            title.textContent = prompt.name; // Safe - textContent
            
            const btnGroup = document.createElement('div');
            btnGroup.className = 'flex gap-1';
            
            const loadBtn = document.createElement('button');
            loadBtn.className = 'pf-btn pf-btn-sm pf-btn-outline-purple';
            loadBtn.innerHTML = '<i class="bi bi-arrow-up-circle"></i>'; // Safe - no user data
            loadBtn.onclick = () => this.loadPrompt(prompt.id);
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'pf-btn pf-btn-sm pf-btn-outline-danger';
            deleteBtn.innerHTML = '<i class="bi bi-trash"></i>'; // Safe - no user data
            deleteBtn.onclick = () => this.deletePrompt(prompt.id);
            
            btnGroup.append(loadBtn, deleteBtn);
            header.append(title, btnGroup);
            
            // Metadata
            const meta = document.createElement('small');
            meta.className = 'text-muted';
            meta.innerHTML = '<i class="bi bi-tag"></i> '; // Safe - no user data
            meta.appendChild(document.createTextNode(`${prompt.model} | ${prompt.type}`));
            meta.appendChild(document.createElement('br'));
            meta.innerHTML += '<i class="bi bi-clock"></i> '; // Safe - no user data
            meta.appendChild(document.createTextNode(new Date(prompt.createdAt).toLocaleDateString()));
            
            // Preview text
            const preview = document.createElement('p');
            preview.className = 'mt-2 mb-0 small';
            const previewText = prompt.startingPrompt.substring(0, 100);
            preview.textContent = previewText + (prompt.startingPrompt.length > 100 ? '...' : '');
            
            item.append(header, meta, preview);
            libraryContainer.appendChild(item);
        });
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
            this.markAsSaved();
            this.updateLibraryCounts();
            this.showToast('Prompt deleted successfully!', 'warning');
        }
    }

    clearPromptLibrary() {
        if (confirm('Are you sure you want to clear all saved prompts? This action cannot be undone.')) {
            this.promptLibrary = [];
            this.saveToLocalStorage('promptLibrary', this.promptLibrary);
            this.loadPromptLibrary();
            this.markAsSaved();
            this.updateLibraryCounts();
            this.showToast('Prompt library cleared!', 'warning');
        }
    }

    async handleFileUpload(files) {
        for (const file of Array.from(files)) {
            const reader = new FileReader();
            
            await new Promise((resolve) => {
                reader.onload = async (e) => {
                const content = e.target.result;
                    
                    // Show loading state
                    this.showToast(`Analyzing "${file.name}"...`, 'info');
                    
                    try {
                        const enhancements = await this.extractEnhancements(content, file.name);
                        
                const documentData = {
                    id: Date.now() + Math.random(),
                    name: file.name,
                    type: file.type,
                    size: file.size,
                    content: content,
                    uploadedAt: new Date().toISOString(),
                    source: 'file',
                            enhancements: enhancements,
                            analysisDate: new Date().toISOString()
                };

                this.uploadedDocuments.push(documentData);
                this.saveToLocalStorage('uploadedDocuments', this.uploadedDocuments);
                this.loadUploadedFiles();
                this.updateLibraryCounts();
                        
                        const analysisSource = enhancements?.source || 'basic';
                        this.showToast(`File "${file.name}" uploaded and analyzed (${analysisSource})!`, 'success');
                    } catch (error) {
                        console.error('Error analyzing file:', error);
                        // Still save the file even if analysis fails
                        const documentData = {
                            id: Date.now() + Math.random(),
                            name: file.name,
                            type: file.type,
                            size: file.size,
                            content: content,
                            uploadedAt: new Date().toISOString(),
                            source: 'file',
                            enhancements: null
                        };

                        this.uploadedDocuments.push(documentData);
                        this.saveToLocalStorage('uploadedDocuments', this.uploadedDocuments);
                        this.loadUploadedFiles();
                        this.updateLibraryCounts();
                        this.showToast(`File "${file.name}" uploaded (analysis failed)`, 'warning');
                    }
                    
                    resolve();
            };
            reader.readAsText(file);
        });
        }
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
                // Show analysis loading state
                fetchBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Analyzing...';
                
                try {
                    const enhancements = await this.extractEnhancements(content, url);
                    
                const documentData = {
                    id: Date.now() + Math.random(),
                    name: this.extractTitleFromUrl(url),
                    type: 'text/html',
                    size: content.length,
                    content: content,
                    url: url,
                    uploadedAt: new Date().toISOString(),
                    source: 'web',
                        enhancements: enhancements,
                        analysisDate: new Date().toISOString()
                };

                this.uploadedDocuments.push(documentData);
                this.saveToLocalStorage('uploadedDocuments', this.uploadedDocuments);
                this.loadUploadedFiles();
                this.updateLibraryCounts();
                    
                    const analysisSource = enhancements?.source || 'basic';
                    this.showToast(`Content from "${this.extractTitleFromUrl(url)}" analyzed (${analysisSource})!`, 'success');
                    urlInput.value = '';
                } catch (error) {
                    console.error('Error analyzing web content:', error);
                    // Still save the content even if analysis fails
                    const documentData = {
                        id: Date.now() + Math.random(),
                        name: this.extractTitleFromUrl(url),
                        type: 'text/html',
                        size: content.length,
                        content: content,
                        url: url,
                        uploadedAt: new Date().toISOString(),
                        source: 'web',
                        enhancements: null
                    };

                    this.uploadedDocuments.push(documentData);
                    this.saveToLocalStorage('uploadedDocuments', this.uploadedDocuments);
                    this.loadUploadedFiles();
                    this.updateLibraryCounts();
                    this.showToast(`Content from "${this.extractTitleFromUrl(url)}" added (analysis failed)`, 'warning');
                urlInput.value = '';
                }
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
        // Use DOMParser for safe HTML parsing (prevents XSS from fetched content)
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Remove script and style elements
        const scripts = doc.querySelectorAll('script, style, nav, header, footer');
        scripts.forEach(el => el.remove());

        // Get text content and clean it up
        let text = doc.body.textContent || doc.body.innerText || '';
        
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
    
    isValidSrefCode(code) {
        // Sref codes can be numeric or alphanumeric (e.g., 123456789 or 2342323dff)
        // They shouldn't contain special characters except possibly hyphens
        if (!code || typeof code !== 'string') return false;
        const trimmed = code.trim();
        // Allow alphanumeric codes, optionally with hyphens
        return /^[a-zA-Z0-9-]+$/.test(trimmed) && trimmed.length >= 3;
    }

    async extractEnhancements(content, filename) {
        // Try local LLM analysis first if enabled
        if (this.llmSettings.enabled && await this.isLocalLLMAvailable()) {
            try {
                const llmAnalysis = await this.analyzeContentWithLLM(content, filename);
                if (llmAnalysis) {
                    return llmAnalysis;
                }
            } catch (error) {
                console.warn('LLM analysis failed, falling back to keyword extraction:', error);
            }
        }
        
        // Enhanced keyword extraction with more comprehensive patterns
        const enhancementPatterns = {
            quality: ['high quality', 'ultra detailed', 'best quality', 'masterpiece', 'professional', 'premium'],
            resolution: ['8k', '4k', '2k', 'hd', 'high resolution', 'ultra hd'],
            style: ['cinematic', 'photorealistic', 'artistic', 'detailed', 'sharp focus', 'crisp'],
            lighting: ['dramatic lighting', 'soft lighting', 'natural light', 'golden hour', 'rim lighting'],
            composition: ['rule of thirds', 'symmetrical', 'dynamic composition', 'leading lines'],
            negative: ['blurry', 'low quality', 'distorted', 'deformed', 'bad anatomy', 'worst quality']
        };

        const foundEnhancements = [];
        const foundNegatives = [];

        // Extract positive enhancements (skip technical params - handled separately)
        Object.entries(enhancementPatterns).forEach(([category, keywords]) => {
            if (category === 'negative') return;
            
            keywords.forEach(keyword => {
                if (content.toLowerCase().includes(keyword.toLowerCase())) {
                    foundEnhancements.push(keyword);
                }
            });
        });

        // Extract negative prompts
        enhancementPatterns.negative.forEach(keyword => {
            if (content.toLowerCase().includes(keyword.toLowerCase())) {
                foundNegatives.push(keyword);
            }
        });

        // Extract model-specific parameters WITH values only (e.g., --style raw, --quality 2, --ar 16:9)
        // This regex requires a value after the parameter name
        const paramMatches = content.match(/--[\w-]+\s+[\w.:/-]+/g);
        if (paramMatches) {
            // Filter out duplicates and clean up
            const uniqueParams = [...new Set(paramMatches.map(p => p.trim()))];
            foundEnhancements.push(...uniqueParams);
        }

        // Extract technical terms and best practices
        const technicalTerms = content.match(/\b(?:prompt|parameter|setting|technique|tip|best practice|recommendation)\b/gi);
        if (technicalTerms) {
            foundEnhancements.push('technical documentation');
        }

        // Remove duplicates from enhancements
        const uniqueEnhancements = [...new Set(foundEnhancements)];
        const result = uniqueEnhancements.length > 0 ? uniqueEnhancements.join(', ') : null;
        const negatives = foundNegatives.length > 0 ? foundNegatives.join(', ') : null;
        
        return {
            enhancements: result,
            negatives: negatives,
            source: 'keyword-extraction'
        };
    }

    async analyzeContentWithLLM(content, filename) {
        if (!this.llmSettings.enabled) return null;

        const prompt = `Analyze this AI model documentation and extract key information for prompt optimization:

Content: ${content.substring(0, 3000)}...

Please extract:
1. Key prompt enhancement techniques (quality terms, style modifiers)
2. Model-specific parameters (--flags and settings)
3. Best practices and recommendations
4. Common mistakes to avoid (negative prompts)
5. Technical tips and tricks

Format your response as JSON:
{
  "enhancements": "comma-separated enhancement terms",
  "parameters": "model-specific parameters found",
  "bestPractices": "key recommendations",
  "negatives": "things to avoid",
  "technicalTips": "advanced techniques"
}`;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.llmSettings.timeout);

            const response = await fetch(`${this.llmSettings.apiUrl}/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.llmSettings.model,
                    prompt: prompt,
                    stream: false,
                    options: {
                        temperature: 0.3,
                        top_p: 0.9,
                        max_tokens: 1000
                    }
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`LLM API error: ${response.status}`);
            }

            const result = await response.json();
            
            try {
                const analysis = JSON.parse(result.response);
                return {
                    enhancements: analysis.enhancements || '',
                    parameters: analysis.parameters || '',
                    bestPractices: analysis.bestPractices || '',
                    negatives: analysis.negatives || '',
                    technicalTips: analysis.technicalTips || '',
                    source: 'llm-analysis'
                };
            } catch (parseError) {
                // If JSON parsing fails, try to extract key terms from text response
                const textResponse = result.response;
                return {
                    enhancements: this.extractTermsFromText(textResponse, ['quality', 'detailed', 'professional', 'cinematic']),
                    source: 'llm-text-analysis'
                };
            }
        } catch (error) {
            console.error('LLM analysis failed:', error);
            return null;
        }
    }

    extractTermsFromText(text, keywords) {
        const foundTerms = keywords.filter(keyword => 
            text.toLowerCase().includes(keyword.toLowerCase())
        );
        return foundTerms.length > 0 ? foundTerms.join(', ') : null;
    }

    async isLocalLLMAvailable() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);

            const response = await fetch(`${this.llmSettings.apiUrl}/tags`, {
                method: 'GET',
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            return response.ok;
        } catch {
            return false;
        }
    }

    loadUploadedFiles() {
        const container = document.getElementById('uploadedFiles');
        
        // Element no longer exists in unified interface
        if (!container) {
            return;
        }
        
        if (this.uploadedDocuments.length === 0) {
            container.innerHTML = '';
            return;
        }

        const filesHTML = this.uploadedDocuments.map(doc => `
            <div class="uploaded-file" style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; border: 1px solid var(--pf-border); border-radius: 0.5rem; margin-bottom: 0.5rem">
                <div class="grow">
                    <div class="flex items-center mb-1">
                        <i class="bi bi-${doc.source === 'web' ? 'globe' : 'file-text'} mr-2 text-${doc.source === 'web' ? 'info' : 'primary'}"></i>
                        <small style="font-weight: 600;">${this.escapeHtml(doc.name)}</small>
                    </div>
                    <small class="text-muted">
                        ${this.formatFileSize(doc.size)} | ${new Date(doc.uploadedAt).toLocaleDateString()}
                        ${doc.url ? `<br><a href="${this.escapeHtml(doc.url)}" target="_blank" rel="noopener noreferrer" class="text-decoration-none small"><i class="bi bi-box-arrow-up-right"></i> View Source</a>` : ''}
                    </small>
                </div>
                <button class="pf-btn pf-btn-sm pf-btn-outline-danger" onclick="app.deleteDocument(${doc.id})">
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
            this.updateLibraryCounts();
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

    async saveManualInformation() {
        const manualInfo = document.getElementById('manualInfo').value;
        this.manualInformation = manualInfo;
        try {
            await StorageManager.save('manualInformation', manualInfo);
            this.showToast('Document notes saved!', 'success');
        } catch (e) {
            console.error('saveManualInformation failed:', e);
            this._lastSaveFailed = true;
            this._saveRetryPending = true;
            this.updateSaveStatus();
            this.updateStorageHealth();
        }
    }

    loadManualInformation() {
        // Manual information moved to unified interface - no longer needed here
        // const manualInfo = document.getElementById('manualInfo');
        // if (manualInfo) {
        //     manualInfo.value = this.manualInformation;
        // }
    }

    async saveToLocalStorage(key, data) {
        const smKeys = ['promptLibrary', 'srefLibrary', 'manualInformation', 'textNotes', 'customOptions', 'llmSettings', 'modelRegistry'];
        if (smKeys.includes(key)) {
            try {
                await StorageManager.save(key, data);
            } catch (e) {
                console.error(`StorageManager.save('${key}') failed:`, e);
                this._lastSaveFailed = true;
                this._saveRetryPending = true;
            }
        } else {
            try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* quota */ }
        }
        this.markAsChanged();
    }

    // Enhanced saving functionality
    setupLifecycleEvents() {
        // Handle app close/refresh
        window.addEventListener('beforeunload', (e) => {
            if (this.hasUnsavedChanges && this.saveSettings.backupOnClose) {
                this.performBackupSave();
            }
        });

        // Handle visibility change (tab switching)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden' && this.hasUnsavedChanges) {
                this.autoSave();
            }
        });

        // Handle pagehide (modern replacement for deprecated 'unload' event)
        // Works on both desktop and mobile browsers
        window.addEventListener('pagehide', (e) => {
            if (this.hasUnsavedChanges) {
                this.performBackupSave();
            }
        });
    }

    setupAutoSave() {
        // Debounced save is now triggered by markAsChanged; keep interval as fallback
        if (this.saveSettings.autoSave && this.saveSettings.autoSaveInterval > 0) {
            this.startAutoSave();
        }
    }

    startAutoSave() {
        this.stopAutoSave();
        this.autoSaveTimer = setInterval(() => {
            if (this.hasUnsavedChanges) {
                this._executeSave();
            }
        }, this.saveSettings.autoSaveInterval);
    }

    stopAutoSave() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = null;
        }
    }

    _scheduleDebouncedSave() {
        if (this._debounceSaveTimer) clearTimeout(this._debounceSaveTimer);
        this._debounceSaveTimer = setTimeout(() => {
            this._debounceSaveTimer = null;
            if (this.hasUnsavedChanges) this._executeSave();
        }, 3000);
    }

    async _executeSave() {
        try {
            await StorageManager.saveAll(this.getCurrentAppState());
            try { localStorage.setItem('uploadedDocuments', JSON.stringify(this.uploadedDocuments)); } catch { /* quota */ }
            try { localStorage.setItem('saveSettings', JSON.stringify(this.saveSettings)); } catch { /* non-critical */ }
            this._lastSaveFailed = false;
            this._saveRetryPending = false;
            this.markAsSaved();
        } catch (error) {
            console.error('Save failed:', error);
            this._lastSaveFailed = true;
            this._saveRetryPending = true;
            this.updateSaveStatus();
            this.updateStorageHealth();
        }
    }

    async retrySave() {
        this._saveRetryPending = false;
        this.updateSaveStatus();
        await this._executeSave();
    }

    markAsChanged() {
        this.hasUnsavedChanges = true;
        this.updateSaveStatus();
        this._scheduleDebouncedSave();
        if (this._saveRetryPending) {
            this._saveRetryPending = false;
            this._executeSave();
        }
    }

    markAsSaved() {
        this.hasUnsavedChanges = false;
        this.saveSettings.lastSaveTime = new Date().toISOString();
        try { localStorage.setItem('saveSettings', JSON.stringify(this.saveSettings)); } catch { /* non-critical */ }
        this.updateSaveStatus();
        this.updateStorageHealth();
    }

    async autoSave() {
        await this._executeSave();
    }

    async saveAllData() {
        await this._executeSave();
    }

    _relativeTime(iso) {
        if (!iso) return null;
        const diff = Date.now() - new Date(iso).getTime();
        if (diff < 30000) return 'just now';
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'just now';
        if (mins === 1) return '1 min ago';
        if (mins < 60) return mins + ' min ago';
        const hrs = Math.floor(mins / 60);
        if (hrs === 1) return '1 hr ago';
        if (hrs < 24) return hrs + ' hr ago';
        return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
    }

    updateStorageHealth() {
        const dot = document.getElementById('storageHealthDot');
        if (!dot) return;
        dot.classList.remove('green', 'amber', 'red');
        if (this._lastSaveFailed) {
            dot.classList.add('red');
            dot.title = 'Last save failed — click for Config';
        } else {
            const mode = StorageManager.getMode();
            const ready = StorageManager.isReady();
            if (mode === 'localstorage') {
                dot.classList.add('amber');
                dot.title = 'Using browser storage — click for Config';
            } else if (ready) {
                dot.classList.add('green');
                dot.title = 'Storage OK — click for Config';
            } else {
                dot.classList.add('amber');
                dot.title = 'Storage not configured — click for Config';
            }
        }
    }

    performBackupSave() {
        try {
            // Create a backup with timestamp
            const backupData = {
                promptLibrary: this.promptLibrary,
                uploadedDocuments: this.uploadedDocuments,
                srefLibrary: this.srefLibrary,
                textNotes: this.textNotes,
                manualInformation: this.manualInformation,
                llmSettings: this.llmSettings,
                saveSettings: this.saveSettings,
                backupTime: new Date().toISOString(),
                version: '2.0.0'
            };

            // Store backup in localStorage with timestamp
            const backupKey = `backup_${new Date().toISOString().replace(/[:.]/g, '-')}`;
            localStorage.setItem(backupKey, JSON.stringify(backupData));

            // Keep only last 5 backups
            this.cleanupOldBackups();
            
            this.markAsSaved();
            console.log('Backup save completed');
        } catch (error) {
            console.error('Backup save failed:', error);
        }
    }

    cleanupOldBackups() {
        const backupKeys = Object.keys(localStorage).filter(key => key.startsWith('backup_'));
        if (backupKeys.length > 5) {
            // Sort by timestamp and remove oldest
            backupKeys.sort();
            const toRemove = backupKeys.slice(0, backupKeys.length - 5);
            toRemove.forEach(key => localStorage.removeItem(key));
        }
    }

    updateSaveStatus() {
        const el = document.getElementById('saveStatus');
        if (!el) return;

        const dot = el.querySelector('.pf-save-dot');
        const txt = el.querySelector('.pf-save-text');

        if (!dot || !txt) return;

        el.onclick = null;

        if (this._lastSaveFailed) {
            el.className = 'pf-save-chip error';
            txt.textContent = 'Save failed — click to retry';
            el.onclick = () => this.retrySave();
            return;
        }

        if (this.hasUnsavedChanges) {
            el.className = 'pf-save-chip unsaved';
            txt.textContent = 'Unsaved';
            return;
        }

        const lastSave = this.saveSettings.lastSaveTime;
        if (lastSave) {
            const rel = this._relativeTime(lastSave);
            el.className = 'pf-save-chip';
            txt.textContent = 'Saved ' + rel;
        } else {
            el.className = 'pf-save-chip idle';
            txt.textContent = 'No changes';
        }
    }

    _startSaveStatusTicker() {
        setInterval(() => {
            if (!this.hasUnsavedChanges && !this._lastSaveFailed && this.saveSettings.lastSaveTime) {
                this.updateSaveStatus();
            }
        }, 30000);
    }

    showToast(message, type = 'info') {
        // Create a simple toast notification
        const toast = document.createElement('div');
        toast.className = `alert alert-${type} position-fixed top-0 end-0 m-3`;
        toast.style.zIndex = '9999';
        toast.innerHTML = `
            <div class="flex items-center">
                <i class="bi bi-${type === 'success' ? 'check-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'} mr-2"></i>
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
    saveSrefFromForm() {
        const srefType = document.querySelector('input[name="srefFormType"]:checked')?.value || 'url';
        const explanation = document.getElementById('srefFormExplanation')?.value.trim() || '';
        const customName = document.getElementById('srefFormName')?.value.trim() || '';

        let srefValue = '';
        let srefWeight = '';
        let srefName = '';

        if (srefType === 'url') {
            srefValue = document.getElementById('srefFormUrl')?.value.trim() || '';
            srefWeight = document.getElementById('srefFormWeight')?.value || '100';
            if (!srefValue) { this.showToast('Please enter a style reference URL', 'warning'); return; }
            if (!this.isValidUrl(srefValue)) { this.showToast('Please enter a valid URL', 'warning'); return; }
            srefName = customName || this.extractNameFromUrl(srefValue);
        } else if (srefType === 'code') {
            srefValue = document.getElementById('srefFormCode')?.value.trim() || '';
            srefWeight = document.getElementById('srefFormCodeWeight')?.value || '100';
            if (!srefValue) { this.showToast('Please enter a style reference code', 'warning'); return; }
            if (!this.isValidSrefCode(srefValue)) { this.showToast('Please enter a valid sref code (alphanumeric)', 'warning'); return; }
            srefName = customName || `Code: ${srefValue.substring(0, 20)}${srefValue.length > 20 ? '...' : ''}`;
        } else if (srefType === 'image') {
            srefValue = this.srefFormImageDataUrl || '';
            srefWeight = document.getElementById('srefFormImageWeight')?.value || '100';
            if (!srefValue) { this.showToast('Please upload an image first', 'warning'); return; }
            srefName = customName || 'Uploaded Image';
        }

        const srefData = {
            id: Date.now(),
            type: srefType,
            value: srefValue,
            url: srefType === 'url' ? srefValue : '',
            code: srefType === 'code' ? srefValue : '',
            weight: srefWeight,
            explanation: explanation || 'No description provided',
            name: srefName,
            createdAt: new Date().toISOString()
        };

        this.srefLibrary.unshift(srefData);
        this.saveToLocalStorage('srefLibrary', this.srefLibrary);
        this.renderSrefLibraryList();
        this.populateSrefPicker();
        this.updateLibraryCounts();
        this.clearSrefLibraryForm();
        this.showToast('Style reference saved to library!', 'success');
    }

    loadSrefLibrary() {
        this.renderSrefLibraryList();
        this.populateSrefPicker();
    }

    renderSrefLibraryList() {
        const container = document.getElementById('srefLibraryList');
        if (!container) return;

        if (this.srefLibrary.length === 0) {
            container.replaceChildren();
            const p = document.createElement('p');
            p.style.cssText = 'color: var(--pf-text-muted); text-align: center; font-size: 14px;';
            p.textContent = 'No saved style references yet';
            container.appendChild(p);
            return;
        }

        container.replaceChildren();

        this.srefLibrary.forEach(sref => {
            const item = document.createElement('div');
            item.className = 'library-item';
            item.dataset.id = sref.id;
            item.style.cssText = 'padding: 10px; margin-bottom: 8px; border: 1px solid var(--pf-border); border-radius: 8px; background: var(--pf-input-bg);';

            const header = document.createElement('div');
            header.style.cssText = 'display: flex; justify-content: space-between; align-items: start;';

            const contentDiv = document.createElement('div');
            contentDiv.style.cssText = 'flex: 1; min-width: 0;';

            const title = document.createElement('div');
            title.style.cssText = 'font-size: 14px; font-weight: 600; color: var(--pf-text-primary); margin-bottom: 2px;';
            title.textContent = sref.name;

            const typeLabel = document.createElement('div');
            typeLabel.style.cssText = 'font-size: 14px; color: var(--pf-text-muted);';
            typeLabel.textContent = `${(sref.type || 'url').toUpperCase()} · Weight: ${sref.weight}`;

            const desc = document.createElement('div');
            desc.style.cssText = 'font-size: 14px; color: var(--pf-text-muted); margin-top: 4px;';
            desc.textContent = sref.explanation;

            contentDiv.append(title, typeLabel, desc);

            const btnGroup = document.createElement('div');
            btnGroup.style.cssText = 'display: flex; gap: 4px; flex-shrink: 0; margin-left: 8px;';

            const useBtn = document.createElement('button');
            useBtn.className = 'pf-chip active';
            useBtn.style.cssText = 'font-size: 14px; padding: 4px 10px;';
            useBtn.textContent = 'Use';
            useBtn.onclick = () => this.applySrefToStudio(sref.id);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'pf-chip';
            deleteBtn.style.cssText = 'font-size: 14px; padding: 4px 10px;';
            deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
            deleteBtn.onclick = () => this.deleteSref(sref.id);

            btnGroup.append(useBtn, deleteBtn);
            header.append(contentDiv, btnGroup);
            item.appendChild(header);
            container.appendChild(item);
        });
    }

    populateSrefPicker() {
        const picker = document.getElementById('srefPicker');
        if (!picker) return;

        const currentVal = picker.value;
        picker.replaceChildren();

        const noneOpt = document.createElement('option');
        noneOpt.value = '';
        noneOpt.textContent = 'None';
        picker.appendChild(noneOpt);

        this.srefLibrary.forEach(sref => {
            const opt = document.createElement('option');
            opt.value = String(sref.id);
            opt.textContent = `${sref.name} (${(sref.type || 'url').toUpperCase()})`;
            picker.appendChild(opt);
        });

        if (currentVal && this.srefLibrary.find(s => String(s.id) === currentVal)) {
            picker.value = currentVal;
        }
    }

    applySrefToStudio(id) {
        const sref = this.srefLibrary.find(s => String(s.id) === String(id));
        if (!sref) return;

        // Set hidden form fields that getFormData() reads
        const type = sref.type || 'url';
        const typeRadio = document.getElementById('srefTypeUrl');
        if (type === 'code') {
            const r = document.getElementById('srefTypeCode'); if (r) r.checked = true;
        } else if (type === 'image') {
            const r = document.getElementById('srefTypeImage'); if (r) r.checked = true;
        } else {
            if (typeRadio) typeRadio.checked = true;
        }

        const srefUrl = document.getElementById('srefUrl');
        const srefWeight = document.getElementById('srefWeight');
        const srefCode = document.getElementById('srefCode');
        const srefCodeWeight = document.getElementById('srefCodeWeight');
        const srefImageWeight = document.getElementById('srefImageWeight');
        const srefExplanation = document.getElementById('srefExplanation');

        if (srefUrl) srefUrl.value = sref.url || '';
        if (srefCode) srefCode.value = sref.code || '';
        if (srefExplanation) srefExplanation.value = sref.explanation || '';

        if (type === 'url') {
            if (srefWeight) srefWeight.value = sref.weight || '';
        } else if (type === 'code') {
            if (srefCodeWeight) srefCodeWeight.value = sref.weight || '';
        } else if (type === 'image') {
            this.srefImageDataUrl = sref.value || '';
            if (srefImageWeight) srefImageWeight.value = sref.weight || '';
        }

        // Update picker dropdown
        const picker = document.getElementById('srefPicker');
        if (picker) picker.value = String(sref.id);

        this.updateSrefPickerPreview(sref);
        this.showToast('Style reference applied!', 'info');
    }

    onSrefPickerChange(val) {
        if (!val) {
            this.clearActiveSref();
            return;
        }
        this.applySrefToStudio(val);
    }

    clearActiveSref() {
        // Clear hidden fields
        ['srefUrl', 'srefWeight', 'srefCode', 'srefCodeWeight', 'srefImageWeight'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        const expl = document.getElementById('srefExplanation');
        if (expl) expl.value = '';
        this.srefImageDataUrl = '';

        const typeRadio = document.getElementById('srefTypeUrl');
        if (typeRadio) typeRadio.checked = true;

        const picker = document.getElementById('srefPicker');
        if (picker) picker.value = '';

        const preview = document.getElementById('srefPickerPreview');
        if (preview) preview.style.display = 'none';

        this.showToast('Style reference cleared', 'info');
    }

    updateSrefPickerPreview(sref) {
        const preview = document.getElementById('srefPickerPreview');
        if (!preview) return;

        preview.style.display = 'block';
        const name = document.getElementById('srefPickerName');
        const type = document.getElementById('srefPickerType');
        const desc = document.getElementById('srefPickerDesc');

        if (name) name.textContent = sref.name;
        if (type) type.textContent = `${(sref.type || 'url').toUpperCase()} · Weight: ${sref.weight}`;
        if (desc) desc.textContent = sref.explanation || '';
    }

    openSrefCreator() {
        // Switch to Library tab and scroll to the sref form
        this.switchToLibraryTab();
        setTimeout(() => {
            const formPanel = document.getElementById('srefFormPanel');
            if (formPanel) formPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 200);
    }

    switchToLibraryTab() {
        const libraryTab = document.querySelector('[data-tab="library"]');
        if (libraryTab) libraryTab.click();
    }

    deleteSref(id) {
        if (confirm('Are you sure you want to delete this style reference?')) {
            this.srefLibrary = this.srefLibrary.filter(s => String(s.id) !== String(id));
            this.saveToLocalStorage('srefLibrary', this.srefLibrary);
            this.renderSrefLibraryList();
            this.populateSrefPicker();
            this.updateLibraryCounts();

            // If the deleted sref was the active one, clear it
            const picker = document.getElementById('srefPicker');
            if (picker && picker.value === String(id)) {
                this.clearActiveSref();
            }
            this.showToast('Style reference deleted!', 'warning');
        }
    }

    clearSrefLibrary() {
        if (confirm('Are you sure you want to clear all style references? This action cannot be undone.')) {
            this.srefLibrary = [];
            this.saveToLocalStorage('srefLibrary', this.srefLibrary);
            this.renderSrefLibraryList();
            this.populateSrefPicker();
            this.clearActiveSref();
            this.updateLibraryCounts();
            this.showToast('Style reference library cleared!', 'warning');
        }
    }

    clearSrefLibraryForm() {
        ['srefFormUrl', 'srefFormWeight', 'srefFormCode', 'srefFormCodeWeight',
         'srefFormImageWeight', 'srefFormExplanation', 'srefFormName'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        const upload = document.getElementById('srefFormImageUpload');
        if (upload) upload.value = '';

        this.clearSrefFormImage();

        const urlRadio = document.getElementById('srefFormTypeUrl');
        if (urlRadio) {
            urlRadio.checked = true;
            this.switchSrefFormType('url');
        }
    }

    switchSrefFormType(type) {
        document.querySelectorAll('.sref-form-section').forEach(s => { s.style.display = 'none'; });
        const map = { 'url': 'srefFormUrlSection', 'code': 'srefFormCodeSection', 'image': 'srefFormImageSection' };
        const target = document.getElementById(map[type]);
        if (target) target.style.display = 'block';
    }

    handleSrefFormImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) { this.showToast('Please select an image file', 'warning'); return; }
        if (file.size > 5 * 1024 * 1024) { this.showToast('Image too large. Please use an image under 5MB.', 'warning'); return; }

        const reader = new FileReader();
        reader.onload = (e) => {
            this.srefFormImageDataUrl = e.target.result;
            const previewContainer = document.getElementById('srefFormImagePreview');
            const previewImg = document.getElementById('srefFormPreviewImg');
            if (previewContainer && previewImg) {
                previewImg.src = this.srefFormImageDataUrl;
                previewContainer.style.display = 'block';
            }
            this.showToast('Image loaded successfully!', 'success');
        };
        reader.onerror = () => { this.showToast('Error reading image file', 'error'); };
        reader.readAsDataURL(file);
    }

    clearSrefFormImage() {
        this.srefFormImageDataUrl = '';
        const previewContainer = document.getElementById('srefFormImagePreview');
        const previewImg = document.getElementById('srefFormPreviewImg');
        const upload = document.getElementById('srefFormImageUpload');
        if (previewContainer) previewContainer.style.display = 'none';
        if (previewImg) previewImg.src = '';
        if (upload) upload.value = '';
    }

    clearSrefImage() {
        this.srefImageDataUrl = '';
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

    initPromptTemplates() {
        return {
            'image-generation': {
                model: 'midjourney',
                type: 'text-to-image',
                startingPrompt: 'a beautiful landscape',
                cameraAngle: 'eye-level',
                perspective: 'medium',
                mood: 'serene',
                colorScheme: 'earth-tones',
                lighting: 'golden-hour',
                artStyle: 'photorealistic',
                composition: 'rule-of-thirds',
                quality: 'high-quality'
            },
            'portrait-photography': {
                model: 'midjourney',
                type: 'text-to-image',
                startingPrompt: 'a professional portrait of a person',
                cameraAngle: 'eye-level',
                perspective: 'close-up',
                mood: 'calm',
                colorScheme: 'warm-tones',
                lighting: 'soft-lighting',
                artStyle: 'portrait-photography',
                composition: 'centered',
                quality: 'high-quality'
            },
            'character-design': {
                model: 'midjourney',
                type: 'text-to-image',
                startingPrompt: 'a detailed character design',
                cameraAngle: 'medium-shot',
                perspective: 'medium',
                mood: 'heroic',
                colorScheme: 'saturated',
                lighting: 'dramatic-lighting',
                artStyle: 'concept-art',
                composition: 'rule-of-thirds',
                quality: 'high-quality'
            },
            'product-photography': {
                model: 'midjourney',
                type: 'text-to-image',
                startingPrompt: 'a professional product photo',
                cameraAngle: 'eye-level',
                perspective: 'close-up',
                mood: 'minimalist',
                colorScheme: 'monochromatic',
                lighting: 'soft-lighting',
                artStyle: 'photorealistic',
                composition: 'centered',
                quality: 'high-quality'
            },
            'video-generation': {
                model: 'runway',
                type: 'text-to-video',
                startingPrompt: 'a cinematic scene',
                cameraAngle: 'wide-shot',
                perspective: 'wide',
                mood: 'dramatic',
                colorScheme: 'cool-tones',
                lighting: 'cinematic-lighting',
                artStyle: 'digital-art',
                composition: 'rule-of-thirds',
                quality: 'high-quality'
            },
            'animation-style': {
                model: 'midjourney',
                type: 'text-to-image',
                startingPrompt: 'an animated character in a scene',
                cameraAngle: 'eye-level',
                perspective: 'medium',
                mood: 'joyful',
                colorScheme: 'pastel',
                lighting: 'soft-lighting',
                artStyle: 'anime-style',
                composition: 'diagonal',
                quality: 'high-quality'
            }
        };
    }

    initTooltips() {
        // Create tooltip element
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'custom-tooltip';
        document.body.appendChild(this.tooltip);

        // Find all select elements and add tooltip functionality
        const selects = document.querySelectorAll('.pf-select, .pf-input-field');
        
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

    // Search functionality
    searchPrompts(query) {
        const libraryContainer = document.getElementById('promptLibrary');
        
        if (!query.trim()) {
            this.loadPromptLibrary();
            return;
        }

        const filteredPrompts = this.promptLibrary.filter(prompt => 
            prompt.name.toLowerCase().includes(query.toLowerCase()) ||
            prompt.startingPrompt.toLowerCase().includes(query.toLowerCase()) ||
            prompt.model.toLowerCase().includes(query.toLowerCase()) ||
            prompt.type.toLowerCase().includes(query.toLowerCase())
        );

        if (filteredPrompts.length === 0) {
            libraryContainer.replaceChildren();
            const p = document.createElement('p');
            p.className = 'text-muted text-center';
            p.textContent = `No prompts found matching "${query}"`; // Safe
            libraryContainer.appendChild(p);
            return;
        }

        const libraryHTML = filteredPrompts.map(prompt => `
            <div class="library-item" data-id="${prompt.id}">
                <div class="flex justify-between align-items-start mb-2">
                    <h6 class="mb-1">${this.highlightSearchTerm(prompt.name, query)}</h6>
                    <div class="flex gap-1">
                        <button class="pf-btn pf-btn-sm pf-btn-outline-purple" onclick="app.loadPrompt(${prompt.id})">
                            <i class="bi bi-arrow-up-circle"></i>
                        </button>
                        <button class="pf-btn pf-btn-sm pf-btn-outline-danger" onclick="app.deletePrompt(${prompt.id})">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
                <small class="text-muted">
                    <i class="bi bi-tag"></i> ${this.escapeHtml(prompt.model)} | ${this.escapeHtml(prompt.type)}
                    <br><i class="bi bi-clock"></i> ${new Date(prompt.createdAt).toLocaleDateString()}
                </small>
                <p class="mt-2 mb-0 small">${this.highlightSearchTerm(prompt.startingPrompt.substring(0, 100), query)}${prompt.startingPrompt.length > 100 ? '...' : ''}</p>
            </div>
        `).join('');

        libraryContainer.innerHTML = libraryHTML;
    }

    searchSref(query) {
        const libraryContainer = document.getElementById('srefLibraryList');
        if (!libraryContainer) return;

        if (!query.trim()) {
            this.renderSrefLibraryList();
            return;
        }

        const filteredSrefs = this.srefLibrary.filter(sref =>
            sref.name.toLowerCase().includes(query.toLowerCase()) ||
            sref.explanation.toLowerCase().includes(query.toLowerCase()) ||
            (sref.url || '').toLowerCase().includes(query.toLowerCase())
        );

        if (filteredSrefs.length === 0) {
            libraryContainer.replaceChildren();
            const p = document.createElement('p');
            p.style.cssText = 'color: var(--pf-text-muted); text-align: center; font-size: 14px;';
            p.textContent = `No style references found matching "${query}"`;
            libraryContainer.appendChild(p);
            return;
        }

        const libraryHTML = filteredSrefs.map(sref => `
            <div class="library-item" data-id="${sref.id}" style="padding: 10px; margin-bottom: 8px; border: 1px solid var(--pf-border); border-radius: 8px; background: var(--pf-input-bg);">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 14px; font-weight: 600; color: var(--pf-text-primary);">${this.highlightSearchTerm(sref.name, query)}</div>
                        <div style="font-size: 14px; color: var(--pf-text-muted);">${this.escapeHtml((sref.type || 'url').toUpperCase())} · Weight: ${this.escapeHtml(String(sref.weight))}</div>
                        <div style="font-size: 14px; color: var(--pf-text-muted); margin-top: 4px;">${this.highlightSearchTerm(sref.explanation, query)}</div>
                    </div>
                    <div style="display: flex; gap: 4px; flex-shrink: 0; margin-left: 8px;">
                        <button class="pf-chip active" style="font-size: 14px; padding: 4px 10px;" onclick="app.applySrefToStudio(${sref.id})">Use</button>
                        <button class="pf-chip" style="font-size: 14px; padding: 4px 10px;" onclick="app.deleteSref(${sref.id})"><i class="bi bi-trash"></i></button>
                    </div>
                </div>
            </div>
        `).join('');

        libraryContainer.innerHTML = libraryHTML;
    }

    highlightSearchTerm(text, query) {
        if (!query.trim()) return this.escapeHtml(text);
        
        // Escape the text first
        const escapedText = this.escapeHtml(text);
        const escapedQuery = this.escapeHtml(query);
        
        // Then safely wrap matches in <mark> tags
        const regex = new RegExp(`(${escapedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return escapedText.replace(regex, '<mark>$1</mark>');
    }

    escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return '';
        return unsafe
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Save Settings
    showSaveSettings() {
        const modal = document.createElement('div');
        modal.className = 'pf-modal-overlay';
        modal.innerHTML = `
            <div class="pf-modal-dialog">
                <div class="pf-modal-content">
                    <div class="pf-modal-header">
                        <h5 class="pf-modal-title"><i class="bi bi-gear"></i> Save Settings</h5>
                        <button type="button" class="pf-btn-close" data-pf-dismiss="modal">&times;</button>
                    </div>
                    <div class="pf-modal-body">
                        <div style="margin-bottom: 0.75rem">
                            <div class="pf-form-check">
                                <input class="pf-form-check-input" type="checkbox" id="autoSaveEnabled" ${this.saveSettings.autoSave ? 'checked' : ''}>
                                <label class="pf-form-check-label" for="autoSaveEnabled">
                                    Enable Auto-Save
                                </label>
                            </div>
                            <small class="text-muted">Automatically save changes periodically</small>
                        </div>
                        
                        <div style="margin-bottom: 0.75rem">
                            <label for="autoSaveInterval" class="pf-label-text">Auto-Save Interval (seconds)</label>
                            <input type="number" class="pf-input-field" id="autoSaveInterval" value="${this.saveSettings.autoSaveInterval / 1000}" min="5" max="300">
                            <small class="text-muted">How often to auto-save (5-300 seconds)</small>
                        </div>
                        
                        <div style="margin-bottom: 0.75rem">
                            <div class="pf-form-check">
                                <input class="pf-form-check-input" type="checkbox" id="backupOnCloseEnabled" ${this.saveSettings.backupOnClose ? 'checked' : ''}>
                                <label class="pf-form-check-label" for="backupOnCloseEnabled">
                                    Backup on App Close
                                </label>
                            </div>
                            <small class="text-muted">Create backup when closing the app</small>
                        </div>
                        
                        <div style="margin-bottom: 0.75rem">
                            <div class="pf-form-check">
                                <input class="pf-form-check-input" type="checkbox" id="showSaveStatusEnabled" ${this.saveSettings.showSaveStatus ? 'checked' : ''}>
                                <label class="pf-form-check-label" for="showSaveStatusEnabled">
                                    Show Save Status
                                </label>
                            </div>
                            <small class="text-muted">Display save status indicator in header</small>
                        </div>
                        
                        <div style="margin-bottom: 0.75rem">
                            <button type="button" class="pf-btn pf-btn-sm pf-btn-outline-purple" style="margin-right: 0.5rem" id="manualSaveBtn">
                                <i class="bi bi-save"></i> Save Now
                            </button>
                            <button type="button" class="pf-btn pf-btn-sm pf-btn-outline-cyan" id="viewBackupsBtn">
                                <i class="bi bi-archive"></i> View Backups
                            </button>
                        </div>
                        
                        <div class="pf-alert pf-alert-info">
                            <small>
                                <strong>Save Features:</strong><br>
                                • Auto-save every 30 seconds (configurable)<br>
                                • Backup on app close/refresh<br>
                                • Automatic backup cleanup (keeps last 5)<br>
                                • Visual save status indicator<br>
                                • Works in both web and desktop versions
                            </small>
                        </div>
                    </div>
                    <div class="pf-modal-footer">
                        <button type="button" class="pf-btn pf-btn-secondary" data-pf-dismiss="modal">Cancel</button>
                        <button type="button" class="pf-btn pf-btn-primary" id="saveSaveSettings">Save Settings</button>
                    </div>
                </div>
            </div>
        `;
        
        PfModal.show(modal);
        
        // Event listeners
        document.getElementById('manualSaveBtn').addEventListener('click', () => {
            this.autoSave();
        });
        
        document.getElementById('viewBackupsBtn').addEventListener('click', () => {
            this.showBackupManager();
            PfModal.hide(modal);
        });
        
        document.getElementById('saveSaveSettings').addEventListener('click', () => {
            this.saveSaveSettings(modal);
            PfModal.hide(modal);
        });
        
        // Clean up modal when hidden
        modal.addEventListener('pf:hidden', () => {
            modal.remove();
        });
    }

    saveSaveSettings(modal) {
        this.saveSettings = {
            autoSave: modal.querySelector('#autoSaveEnabled').checked,
            autoSaveInterval: parseInt(modal.querySelector('#autoSaveInterval').value) * 1000,
            backupOnClose: modal.querySelector('#backupOnCloseEnabled').checked,
            showSaveStatus: modal.querySelector('#showSaveStatusEnabled').checked,
            lastSaveTime: this.saveSettings.lastSaveTime
        };
        
        try { localStorage.setItem('saveSettings', JSON.stringify(this.saveSettings)); } catch { /* non-critical */ }
        
        if (this.saveSettings.autoSave) {
            this.startAutoSave();
        } else {
            this.stopAutoSave();
        }
        
        this.showToast('Save settings updated!', 'success');
    }

    showBackupManager() {
        const modal = document.createElement('div');
        modal.className = 'pf-modal-overlay';
        
        const backupKeys = Object.keys(localStorage).filter(key => key.startsWith('backup_'));
        const backupList = backupKeys.map(key => {
            const backup = JSON.parse(localStorage.getItem(key));
            return {
                key,
                time: backup.backupTime,
                size: JSON.stringify(backup).length
            };
        }).sort((a, b) => new Date(b.time) - new Date(a.time));
        
        modal.innerHTML = `
            <div class="pf-pf-modal-dialog pf-modal-lg">
                <div class="pf-modal-content">
                    <div class="pf-modal-header">
                        <h5 class="pf-modal-title"><i class="bi bi-archive"></i> Backup Manager</h5>
                        <button type="button" class="pf-btn-close" data-pf-dismiss="modal">&times;</button>
                    </div>
                    <div class="pf-modal-body">
                        ${backupList.length === 0 ? 
                            '<p class="text-muted text-center">No backups found</p>' :
                            `<div class="table-responsive">
                                <table class="table table-sm">
                                    <thead>
                                        <tr>
                                            <th>Date/Time</th>
                                            <th>Size</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${backupList.map(backup => `
                                            <tr>
                                                <td>${new Date(backup.time).toLocaleString()}</td>
                                                <td>${Math.round(backup.size / 1024)} KB</td>
                                                <td>
                                                    <button class="pf-btn pf-btn-sm pf-btn-outline-purple" onclick="window.app.restoreBackup('${backup.key}')">
                                                        <i class="bi bi-arrow-clockwise"></i> Restore
                                                    </button>
                                                    <button class="pf-btn pf-btn-sm pf-btn-outline-danger" onclick="window.app.deleteBackup('${backup.key}')">
                                                        <i class="bi bi-trash"></i> Delete
                                                    </button>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>`
                        }
                    </div>
                    <div class="pf-modal-footer">
                        <button type="button" class="pf-btn pf-btn-secondary" data-pf-dismiss="modal">Close</button>
                        <button type="button" class="pf-btn pf-btn-danger" onclick="window.app.clearAllBackups()">
                            <i class="bi bi-trash"></i> Clear All Backups
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        PfModal.show(modal);
        
        // Clean up modal when hidden
        modal.addEventListener('pf:hidden', () => {
            modal.remove();
        });
    }

    restoreBackup(backupKey) {
        if (!confirm('Are you sure you want to restore this backup? This will replace all current data.')) {
            return;
        }
        
        try {
            const backup = JSON.parse(localStorage.getItem(backupKey));
            
            this.promptLibrary = backup.promptLibrary || [];
            this.uploadedDocuments = backup.uploadedDocuments || [];
            this.srefLibrary = backup.srefLibrary || [];
            this.textNotes = backup.textNotes || [];
            this.manualInformation = backup.manualInformation || '';
            this.llmSettings = backup.llmSettings || this.llmSettings;
            
            this.saveAllData();
            this.loadPromptLibrary();
            this.loadUploadedFiles();
            this.loadSrefLibrary();
            
            this.showToast('Backup restored successfully!', 'success');
        } catch (error) {
            console.error('Restore failed:', error);
            this.showToast('Failed to restore backup', 'danger');
        }
    }

    deleteBackup(backupKey) {
        if (confirm('Are you sure you want to delete this backup?')) {
            localStorage.removeItem(backupKey);
            this.showToast('Backup deleted', 'warning');
            // Refresh the backup manager
            setTimeout(() => {
                const modal = document.querySelector('.modal.show');
                if (modal) modal.remove();
                this.showBackupManager();
            }, 500);
        }
    }

    clearAllBackups() {
        if (confirm('Are you sure you want to delete all backups?')) {
            const backupKeys = Object.keys(localStorage).filter(key => key.startsWith('backup_'));
            backupKeys.forEach(key => localStorage.removeItem(key));
            this.showToast('All backups cleared', 'warning');
        }
    }

    // LLM Settings
    showLLMSettings() {
        const modal = document.createElement('div');
        modal.className = 'pf-modal-overlay';
        modal.innerHTML = `
            <div class="pf-modal-dialog">
                <div class="pf-modal-content">
                    <div class="pf-modal-header">
                        <h5 class="pf-modal-title"><i class="bi bi-cpu"></i> Local LLM Settings</h5>
                        <button type="button" class="pf-btn-close" data-pf-dismiss="modal">&times;</button>
                    </div>
                    <div class="pf-modal-body">
                        <div style="margin-bottom: 0.75rem">
                            <div class="pf-form-check">
                                <input class="pf-form-check-input" type="checkbox" id="llmEnabled" ${this.llmSettings.enabled ? 'checked' : ''}>
                                <label class="pf-form-check-label" for="llmEnabled">
                                    Enable Local LLM Analysis
                                </label>
                            </div>
                            <small class="text-muted">Use local LLM for enhanced content analysis</small>
                        </div>
                        
                        <div style="margin-bottom: 0.75rem">
                            <label for="llmApiUrl" class="pf-label-text">API URL</label>
                            <input type="text" class="pf-input-field" id="llmApiUrl" value="${this.llmSettings.apiUrl}" placeholder="http://localhost:11434/api">
                            <small class="text-muted">Ollama default: http://localhost:11434/api</small>
                        </div>
                        
                        <div style="margin-bottom: 0.75rem">
                            <label for="llmModel" class="pf-label-text">Model Name</label>
                            <input type="text" class="pf-input-field" id="llmModel" value="${this.llmSettings.model}" placeholder="llama3.1:8b">
                            <small class="text-muted">Available models will be detected automatically</small>
                        </div>
                        
                        <div style="margin-bottom: 0.75rem">
                            <label for="llmTimeout" class="pf-label-text">Timeout (ms)</label>
                            <input type="number" class="pf-input-field" id="llmTimeout" value="${this.llmSettings.timeout}" min="1000" max="60000">
                        </div>
                        
                        <div style="margin-bottom: 0.75rem">
                            <button type="button" class="pf-btn pf-btn-sm pf-btn-outline-cyan" id="testLLMConnection">
                                <i class="bi bi-wifi"></i> Test Connection
                            </button>
                            <span id="connectionStatus" class="ms-2"></span>
                        </div>
                        
                        <div class="pf-alert pf-alert-info">
                            <small>
                                <strong>Supported LLM Services:</strong><br>
                                • Ollama (recommended)<br>
                                • LM Studio<br>
                                • LocalAI<br>
                                • Any OpenAI-compatible API
                            </small>
                        </div>
                    </div>
                    <div class="pf-modal-footer">
                        <button type="button" class="pf-btn pf-btn-secondary" data-pf-dismiss="modal">Cancel</button>
                        <button type="button" class="pf-btn pf-btn-primary" id="saveLLMSettings">Save Settings</button>
                    </div>
                </div>
            </div>
        `;
        
        PfModal.show(modal);
        
        // Event listeners
        document.getElementById('testLLMConnection').addEventListener('click', async () => {
            await this.testLLMConnection(modal);
        });
        
        document.getElementById('saveLLMSettings').addEventListener('click', () => {
            this.saveLLMSettings(modal);
            PfModal.hide(modal);
        });
        
        modal.addEventListener('pf:hidden', () => {
            modal.remove();
        });
    }

    async testLLMConnection(modal) {
        const statusSpan = modal.querySelector('#connectionStatus');
        const testBtn = modal.querySelector('#testLLMConnection');
        const apiUrl = modal.querySelector('#llmApiUrl').value;
        const model = modal.querySelector('#llmModel').value;
        
        testBtn.disabled = true;
        testBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Testing...';
        statusSpan.innerHTML = '';
        
        try {
            const response = await fetch(`${apiUrl}/tags`, {
                method: 'GET',
                timeout: 5000
            });
            
            if (response.ok) {
                const data = await response.json();
                statusSpan.innerHTML = '<span class="text-success"><i class="bi bi-check-circle"></i> Connected</span>';
                
                // Show available models
                if (data.models && data.models.length > 0) {
                    const modelNames = data.models.map(m => m.name).join(', ');
                    const small = document.createElement('small');
                    small.className = 'text-muted';
                    small.textContent = `Available models: ${modelNames}`;
                    statusSpan.appendChild(document.createElement('br'));
                    statusSpan.appendChild(small);
                }
            } else {
                statusSpan.innerHTML = '<span class="text-danger"><i class="bi bi-x-circle"></i> Connection failed</span>';
            }
        } catch (error) {
            statusSpan.innerHTML = '<span class="text-danger"><i class="bi bi-x-circle"></i> Connection failed</span>';
        }
        
        testBtn.disabled = false;
        testBtn.innerHTML = '<i class="bi bi-wifi"></i> Test Connection';
    }

    async saveLLMSettings(modal) {
        this.llmSettings = {
            enabled: modal.querySelector('#llmEnabled').checked,
            apiUrl: modal.querySelector('#llmApiUrl').value,
            model: modal.querySelector('#llmModel').value,
            timeout: parseInt(modal.querySelector('#llmTimeout').value)
        };

        try {
            await StorageManager.save('llmSettings', this.llmSettings);
            this.showToast('LLM settings saved!', 'success');
        } catch (e) {
            console.error('saveLLMSettings failed:', e);
            this._lastSaveFailed = true;
            this._saveRetryPending = true;
            this.updateSaveStatus();
            this.updateStorageHealth();
        }
    }

    // Unified Library Functions
    showAddItemForm(type) {
        const contentDiv = document.getElementById('addItemContent');
        
        if (!contentDiv) {
            console.error('addItemContent div not found!');
            return;
        }
        
        switch(type) {
            case 'document':
                contentDiv.innerHTML = `
                    <div class="upload-zone" id="uploadZone">
                        <i class="bi bi-cloud-arrow-up text-primary mb-2"></i>
                        <h6>Drag & Drop Files</h6>
                        <p class="text-muted small mb-2">or click to browse</p>
                        <input type="file" id="fileInput" multiple accept=".txt,.json,.md,.pdf,.doc,.docx" style="display: none;">
                        <button type="button" class="pf-btn pf-btn-sm pf-btn-outline-purple" onclick="document.getElementById('fileInput').click()">
                            <i class="bi bi-folder2-open"></i> Browse
                        </button>
                    </div>
                `;
                this.setupFileUpload();
                break;
                
            case 'website':
                contentDiv.innerHTML = `
                    <div class="input-group mb-2">
                        <input type="url" class="pf-input-field" id="urlInput" placeholder="https://example.com/ai-guide">
                        <button class="pf-btn pf-btn-outline-cyan" type="button" id="fetchUrlBtn">
                            <i class="bi bi-download"></i> Fetch
                        </button>
                    </div>
                    <small class="text-muted">Add AI documentation, tutorials, or guides</small>
                `;
                this.setupWebFetch();
                break;
                
            case 'text':
                contentDiv.innerHTML = `
                    <textarea class="pf-input-field" style="margin-bottom: 0.5rem" id="textNoteInput" rows="4" 
                              placeholder="Enter your notes here..."></textarea>
                    <button type="button" class="pf-btn pf-btn-sm pf-btn-outline-purple" style="width: 100%" id="saveTextNote">
                        <i class="bi bi-save"></i> Save Note
                    </button>
                `;
                this.setupTextNote();
                break;
                
            case 'sref':
                contentDiv.innerHTML = `
                    <div class="mb-2">
                        <input type="url" class="pf-input-field" style="margin-bottom: 0.5rem" id="srefUrlInput" 
                               placeholder="https://example.com/style-image.jpg">
                        <div class="grid grid-cols-2 gap-4">
                            <div class="col-6">
                                <input type="number" class="pf-input-field" id="srefWeightInput" 
                                       min="0" max="1000" step="50" placeholder="Weight (100)">
                            </div>
                            <div class="col-6">
                                <button type="button" class="pf-btn pf-btn-sm pf-btn-outline-cyan" style="width: 100%" id="saveSrefFromUnified">
                                    <i class="bi bi-save"></i> Save
                                </button>
                            </div>
                        </div>
                        <textarea class="pf-input-field" style="margin-top: 0.5rem" id="srefExplanationInput" rows="2" 
                                  placeholder="Style description..."></textarea>
                    </div>
                `;
                this.setupSrefFromUnified();
                break;
                
            case 'prompt':
                contentDiv.innerHTML = `
                    <div class="mb-2">
                        <input type="text" class="pf-input-field" style="margin-bottom: 0.5rem" id="quickPromptName" 
                               placeholder="Prompt name...">
                        <textarea class="pf-input-field" style="margin-bottom: 0.5rem" id="quickPromptText" rows="3" 
                                  placeholder="Enter prompt text..."></textarea>
                        <div class="grid grid-cols-2 gap-4">
                            <div class="col-6">
                                <select class="pf-select" id="quickPromptModel">
                                    <option value="">Model (optional)</option>
                                    <option value="midjourney">Midjourney</option>
                                    <option value="dalle3">DALL-E 3</option>
                                    <option value="stable-diffusion">Stable Diffusion</option>
                                    <option value="custom">Custom</option>
                                </select>
                            </div>
                            <div class="col-6">
                                <button type="button" class="pf-btn pf-btn-sm pf-btn-outline-purple" style="width: 100%" id="saveQuickPrompt">
                                    <i class="bi bi-save"></i> Save
                                </button>
                            </div>
                        </div>
                    </div>
                `;
                this.setupQuickPrompt();
                break;
                
            default:
                contentDiv.innerHTML = '<p class="text-muted text-center">Select a type above to add content</p>';
        }
    }

    setupFileUpload() {
        // Use setTimeout to ensure DOM elements exist
        setTimeout(() => {
            const fileInput = document.getElementById('fileInput');
            const uploadZone = document.getElementById('uploadZone');

            if (fileInput && uploadZone) {
                fileInput.addEventListener('change', (e) => {
                    this.handleFileUpload(e.target.files);
                });

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
            }
        }, 100);
    }

    setupWebFetch() {
        setTimeout(() => {
            const fetchBtn = document.getElementById('fetchUrlBtn');
            const urlInput = document.getElementById('urlInput');
            
            if (fetchBtn) {
                fetchBtn.addEventListener('click', () => {
                    this.fetchWebContent();
                });
            }
            
            if (urlInput) {
                urlInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        this.fetchWebContent();
                    }
                });
            }
        }, 100);
    }

    setupTextNote() {
        setTimeout(() => {
            const saveBtn = document.getElementById('saveTextNote');
            if (saveBtn) {
                saveBtn.addEventListener('click', () => {
                    const text = document.getElementById('textNoteInput').value.trim();
                    if (text) {
                        const noteData = {
                            id: Date.now(),
                            name: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
                            content: text,
                            type: 'text-note',
                            createdAt: new Date().toISOString()
                        };
                        
                        if (!this.textNotes) this.textNotes = [];
                        this.textNotes.unshift(noteData);
                        this.saveToLocalStorage('textNotes', this.textNotes);
                        this.updateLibraryCounts();
                        
                        document.getElementById('textNoteInput').value = '';
                        this.showToast('Text note saved!', 'success');
                        this.performUnifiedSearch(document.getElementById('unifiedSearchInput').value);
                    }
                });
            }
        }, 100);
    }

    setupSrefFromUnified() {
        setTimeout(() => {
            const saveBtn = document.getElementById('saveSrefFromUnified');
            if (saveBtn) {
                saveBtn.addEventListener('click', () => {
                    const url = document.getElementById('srefUrlInput').value.trim();
                    const weight = document.getElementById('srefWeightInput').value || 100;
                    const explanation = document.getElementById('srefExplanationInput').value.trim();

                    if (url && this.isValidUrl(url)) {
                        const srefData = {
                            id: Date.now(),
                            url: url,
                            weight: weight,
                            explanation: explanation || 'No description provided',
                            name: this.extractNameFromUrl(url),
                            createdAt: new Date().toISOString()
                        };

                        this.srefLibrary.unshift(srefData);
                        this.saveToLocalStorage('srefLibrary', this.srefLibrary);
                        this.updateLibraryCounts();
                        
                        // Clear form
                        document.getElementById('srefUrlInput').value = '';
                        document.getElementById('srefWeightInput').value = '';
                        document.getElementById('srefExplanationInput').value = '';
                        
                        this.showToast('Style reference saved!', 'success');
                        this.performUnifiedSearch(document.getElementById('unifiedSearchInput').value);
                    } else {
                        this.showToast('Please enter a valid URL', 'warning');
                    }
                });
            }
        }, 100);
    }

    setupQuickPrompt() {
        setTimeout(() => {
            const saveBtn = document.getElementById('saveQuickPrompt');
            if (saveBtn) {
                saveBtn.addEventListener('click', () => {
                    const name = document.getElementById('quickPromptName').value.trim();
                    const text = document.getElementById('quickPromptText').value.trim();
                    const model = document.getElementById('quickPromptModel').value;

                    if (name && text) {
                        const promptData = {
                            id: Date.now(),
                            name: name,
                            model: model || 'custom',
                            type: 'text-to-image',
                            startingPrompt: text,
                            createdAt: new Date().toISOString()
                        };

                        this.promptLibrary.unshift(promptData);
                        this.saveToLocalStorage('promptLibrary', this.promptLibrary);
                        this.updateLibraryCounts();
                        
                        // Clear form
                        document.getElementById('quickPromptName').value = '';
                        document.getElementById('quickPromptText').value = '';
                        document.getElementById('quickPromptModel').value = '';
                        
                        this.showToast('Quick prompt saved!', 'success');
                        this.performUnifiedSearch(document.getElementById('unifiedSearchInput').value);
                    } else {
                        this.showToast('Please enter both name and prompt text', 'warning');
                    }
                });
            }
        }, 100);
    }

    performUnifiedSearch(query) {
        const resultsContainer = document.getElementById('unifiedSearchResults');
        const searchPrompts = document.getElementById('searchPrompts').checked;
        const searchDocuments = document.getElementById('searchDocuments').checked;
        const searchSref = document.getElementById('searchSref').checked;
        const searchNotes = document.getElementById('searchNotes').checked;

        if (!query.trim()) {
            resultsContainer.innerHTML = '<p class="text-muted text-center">Use search above to find content</p>';
            return;
        }

        const results = [];
        const lowerQuery = query.toLowerCase();

        // Search prompts
        if (searchPrompts) {
            this.promptLibrary.forEach(prompt => {
                if (prompt.name.toLowerCase().includes(lowerQuery) ||
                    prompt.startingPrompt.toLowerCase().includes(lowerQuery) ||
                    prompt.model.toLowerCase().includes(lowerQuery)) {
                    results.push({
                        type: 'prompt',
                        icon: '⚡',
                        title: prompt.name,
                        content: prompt.startingPrompt.substring(0, 100) + '...',
                        metadata: `${prompt.model} | ${prompt.type}`,
                        data: prompt,
                        date: prompt.createdAt
                    });
                }
            });
        }

        // Search documents
        if (searchDocuments) {
            this.uploadedDocuments.forEach(doc => {
                if (doc.name.toLowerCase().includes(lowerQuery) ||
                    (doc.content && doc.content.toLowerCase().includes(lowerQuery))) {
                    results.push({
                        type: 'document',
                        icon: doc.source === 'web' ? '🌐' : '📄',
                        title: doc.name,
                        content: doc.content ? doc.content.substring(0, 100) + '...' : 'Document content',
                        metadata: `${doc.source} | ${this.formatFileSize(doc.size)}`,
                        data: doc,
                        date: doc.uploadedAt
                    });
                }
            });
        }

        // Search style references
        if (searchSref) {
            this.srefLibrary.forEach(sref => {
                if (sref.name.toLowerCase().includes(lowerQuery) ||
                    sref.explanation.toLowerCase().includes(lowerQuery) ||
                    sref.url.toLowerCase().includes(lowerQuery)) {
                    results.push({
                        type: 'sref',
                        icon: '🎨',
                        title: sref.name,
                        content: sref.explanation,
                        metadata: `Weight: ${sref.weight}`,
                        data: sref,
                        date: sref.createdAt
                    });
                }
            });
        }

        // Search text notes
        if (searchNotes && this.textNotes) {
            this.textNotes.forEach(note => {
                if (note.name.toLowerCase().includes(lowerQuery) ||
                    note.content.toLowerCase().includes(lowerQuery)) {
                    results.push({
                        type: 'note',
                        icon: '📝',
                        title: note.name,
                        content: note.content.substring(0, 100) + '...',
                        metadata: 'Text Note',
                        data: note,
                        date: note.createdAt
                    });
                }
            });
        }

        // Sort by date (newest first)
        results.sort((a, b) => new Date(b.date) - new Date(a.date));

        if (results.length === 0) {
            resultsContainer.replaceChildren();
            const p = document.createElement('p');
            p.className = 'text-muted text-center';
            p.textContent = `No results found for "${query}"`; // Safe
            resultsContainer.appendChild(p);
            return;
        }

        const resultsHTML = results.map(result => `
            <div class="library-item mb-2" data-type="${this.escapeHtml(result.type)}" data-id="${result.data.id}">
                <div class="flex justify-between align-items-start">
                    <div class="grow">
                        <div class="flex items-center mb-1">
                            <span class="me-2">${result.icon}</span>
                            <h6 style="margin-bottom: 0">${this.highlightSearchTerm(result.title, query)}</h6>
                            <span class="pf-badge pf-badge-muted" style="margin-left: 0.5rem">${this.escapeHtml(result.type)}</span>
                        </div>
                        <p class="text-sm mb-1 text-muted">${this.highlightSearchTerm(result.content, query)}</p>
                        <small class="text-muted">${this.escapeHtml(result.metadata)} | ${new Date(result.date).toLocaleDateString()}</small>
                    </div>
                    <div class="flex gap-1">
                        <button class="pf-btn pf-btn-sm pf-btn-outline-purple" onclick="app.loadFromSearch('${this.escapeHtml(result.type)}', ${result.data.id})">
                            <i class="bi bi-arrow-up-circle"></i>
                        </button>
                        <button class="pf-btn pf-btn-sm pf-btn-outline-danger" onclick="app.deleteFromSearch('${this.escapeHtml(result.type)}', ${result.data.id})">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

        resultsContainer.innerHTML = resultsHTML;
    }

    loadFromSearch(type, id) {
        switch(type) {
            case 'prompt':
                this.loadPrompt(id);
                break;
            case 'sref':
                this.applySrefToStudio(id);
                break;
            case 'document':
                this.showToast('Document loaded for reference', 'info');
                break;
            case 'note':
                this.showToast('Note loaded for reference', 'info');
                break;
        }
    }

    deleteFromSearch(type, id) {
        if (confirm('Are you sure you want to delete this item?')) {
            switch(type) {
                case 'prompt':
                    this.promptLibrary = this.promptLibrary.filter(p => p.id !== id);
                    this.saveToLocalStorage('promptLibrary', this.promptLibrary);
                    break;
                case 'sref':
                    this.srefLibrary = this.srefLibrary.filter(s => s.id !== id);
                    this.saveToLocalStorage('srefLibrary', this.srefLibrary);
                    break;
                case 'document':
                    this.uploadedDocuments = this.uploadedDocuments.filter(d => d.id !== id);
                    this.saveToLocalStorage('uploadedDocuments', this.uploadedDocuments);
                    break;
                case 'note':
                    this.textNotes = this.textNotes.filter(n => n.id !== id);
                    this.saveToLocalStorage('textNotes', this.textNotes);
                    break;
            }
            this.updateLibraryCounts();
            this.performUnifiedSearch(document.getElementById('unifiedSearchInput').value);
            this.showToast('Item deleted', 'warning');
        }
    }

    async clearAllLibrary() {
        if (confirm('Are you sure you want to clear ALL library content? This action cannot be undone.')) {
            this.promptLibrary = [];
            this.srefLibrary = [];
            this.uploadedDocuments = [];
            this.textNotes = [];
            this.manualInformation = '';

            try {
                await StorageManager.saveAll(this.getCurrentAppState());
            } catch (e) {
                console.error('clearAllLibrary save failed:', e);
                this._lastSaveFailed = true;
                this.updateSaveStatus();
                this.updateStorageHealth();
            }
            try { localStorage.setItem('uploadedDocuments', JSON.stringify(this.uploadedDocuments)); } catch { /* quota */ }
            
            this.updateLibraryCounts();
            const sr = document.getElementById('unifiedSearchResults');
            if (sr) sr.innerHTML = '<p class="text-muted text-center">Use search above to find content</p>';
            this.showToast('All library content cleared!', 'warning');
        }
    }

    showExportAllModal() {
        const modal = document.createElement('div');
        modal.className = 'pf-modal-overlay';
        modal.innerHTML = `
            <div class="pf-pf-modal-dialog pf-modal-lg">
                <div class="pf-modal-content">
                    <div class="pf-modal-header">
                        <h5 class="pf-modal-title"><i class="bi bi-download"></i> Export All Prompts</h5>
                        <button type="button" class="pf-btn-close" data-pf-dismiss="modal">&times;</button>
                    </div>
                    <div class="pf-modal-body">
                        <div class="row mb-3">
                            <div class="">
                                <label class="pf-label-text">Export Format</label>
                                <select class="pf-select" id="exportFormat">
                                    <option value="json">JSON</option>
                                    <option value="csv">CSV</option>
                                    <option value="markdown">Markdown</option>
                                    <option value="txt">Plain Text</option>
                                </select>
                            </div>
                            <div class="">
                                <label class="pf-label-text">Include Metadata</label>
                                <div class="pf-form-check">
                                    <input class="pf-form-check-input" type="checkbox" id="includeMetadata" checked>
                                    <label class="pf-form-check-label" for="includeMetadata">
                                        Include timestamps and settings
                                    </label>
                                </div>
                            </div>
                        </div>
                        <div style="margin-bottom: 0.75rem">
                            <label class="pf-label-text">Filename Prefix</label>
                            <input type="text" class="pf-input-field" id="filenamePrefix" value="prompt_library_export">
                        </div>
                        <div class="pf-alert pf-alert-info">
                            <strong>Library Statistics:</strong><br>
                            • ${this.promptLibrary.length} saved prompts<br>
                            • ${this.srefLibrary.length} style references<br>
                            • ${this.uploadedDocuments.length} uploaded documents<br>
                            • ${this.textNotes.length} text notes
                        </div>
                    </div>
                    <div class="pf-modal-footer">
                        <button type="button" class="pf-btn pf-btn-secondary" data-pf-dismiss="modal">Cancel</button>
                        <button type="button" class="pf-btn pf-btn-primary" id="confirmExportAll">
                            <i class="bi bi-download"></i> Export All
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        PfModal.show(modal);
        
        // Event listener for export button
        modal.querySelector('#confirmExportAll').addEventListener('click', () => {
            const format = modal.querySelector('#exportFormat').value;
            const includeMetadata = modal.querySelector('#includeMetadata').checked;
            const filenamePrefix = modal.querySelector('#filenamePrefix').value;
            
            this.exportAllData(format, includeMetadata, filenamePrefix);
            PfModal.hide(modal);
            modal.remove();
        });
        
        // Remove modal when hidden
        modal.addEventListener('pf:hidden', () => {
            modal.remove();
        });
    }

    showBatchOperationsModal() {
        const modal = document.createElement('div');
        modal.className = 'pf-modal-overlay';
        modal.innerHTML = `
            <div class="pf-pf-modal-dialog pf-modal-lg">
                <div class="pf-modal-content">
                    <div class="pf-modal-header">
                        <h5 class="pf-modal-title"><i class="bi bi-gear"></i> Batch Operations</h5>
                        <button type="button" class="pf-btn-close" data-pf-dismiss="modal">&times;</button>
                    </div>
                    <div class="pf-modal-body">
                        <div class="grid grid-cols-2 gap-4">
                            <div class="">
                                <div class="pf-card">
                                    <div class="pf-card-head">
                                        <h6><i class="bi bi-download"></i> Export Operations</h6>
                                    </div>
                                    <div class="pf-card-body">
                                        <button class="pf-btn pf-btn-sm pf-btn-outline-purple" style="width: 100%; margin-bottom: 0.5rem" onclick="app.exportSelectedLibrary('prompts')">
                                            <i class="bi bi-collection"></i> Export Prompt Library
                                        </button>
                                        <button class="pf-btn pf-btn-sm pf-btn-outline-cyan" style="width: 100%; margin-bottom: 0.5rem" onclick="app.exportSelectedLibrary('srefs')">
                                            <i class="bi bi-palette2"></i> Export Style References
                                        </button>
                                        <button class="pf-btn pf-btn-sm pf-btn-outline-purple" style="width: 100%; margin-bottom: 0.5rem" onclick="app.exportSelectedLibrary('documents')">
                                            <i class="bi bi-file-earmark-text"></i> Export Documents
                                        </button>
                                        <button class="pf-btn pf-btn-sm pf-btn-outline-purple" style="width: 100%; margin-bottom: 0.5rem" onclick="app.exportSelectedLibrary('notes')">
                                            <i class="bi bi-sticky"></i> Export Text Notes
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div class="">
                                <div class="pf-card">
                                    <div class="pf-card-head">
                                        <h6><i class="bi bi-trash"></i> Cleanup Operations</h6>
                                    </div>
                                    <div class="pf-card-body">
                                        <button class="pf-btn pf-btn-sm pf-btn-outline-danger" style="width: 100%; margin-bottom: 0.5rem" onclick="app.bulkDelete('prompts')">
                                            <i class="bi bi-collection"></i> Clear Prompt Library
                                        </button>
                                        <button class="pf-btn pf-btn-sm pf-btn-outline-danger" style="width: 100%; margin-bottom: 0.5rem" onclick="app.bulkDelete('srefs')">
                                            <i class="bi bi-palette2"></i> Clear Style References
                                        </button>
                                        <button class="pf-btn pf-btn-sm pf-btn-outline-danger" style="width: 100%; margin-bottom: 0.5rem" onclick="app.bulkDelete('documents')">
                                            <i class="bi bi-file-earmark-text"></i> Clear Documents
                                        </button>
                                        <button class="pf-btn pf-btn-sm pf-btn-outline-danger" style="width: 100%; margin-bottom: 0.5rem" onclick="app.bulkDelete('notes')">
                                            <i class="bi bi-sticky"></i> Clear Text Notes
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="pf-alert pf-alert-warning" style="margin-top: 0.75rem">
                            <i class="bi bi-exclamation-triangle"></i>
                            <strong>Warning:</strong> Delete operations cannot be undone. Make sure to export your data first if you want to keep a backup.
                        </div>
                    </div>
                    <div class="pf-modal-footer">
                        <button type="button" class="pf-btn pf-btn-secondary" data-pf-dismiss="modal">Close</button>
                    </div>
                </div>
            </div>
        `;
        
        PfModal.show(modal);
        
        // Remove modal when hidden
        modal.addEventListener('pf:hidden', () => {
            modal.remove();
        });
    }

    exportAllData(format, includeMetadata, filenamePrefix) {
        const timestamp = new Date().toISOString().split('T')[0];
        let content = '';
        let filename = '';
        let mimeType = '';

        switch (format) {
            case 'json':
                content = JSON.stringify({
                    exported_at: new Date().toISOString(),
                    version: '2.0',
                    prompts: this.promptLibrary,
                    styleReferences: this.srefLibrary,
                    documents: this.uploadedDocuments,
                    textNotes: this.textNotes,
                    manualInformation: this.manualInformation
                }, null, 2);
                filename = `${filenamePrefix}_${timestamp}.json`;
                mimeType = 'application/json';
                break;
                
            case 'csv':
                const csvHeaders = ['Type', 'ID', 'Name', 'Content', 'Created At', 'Metadata'];
                const csvRows = [csvHeaders.join(',')];
                
                // Add prompts
                this.promptLibrary.forEach(prompt => {
                    csvRows.push([
                        'Prompt', prompt.id, `"${prompt.name}"`, `"${prompt.startingPrompt}"`, 
                        prompt.createdAt, `"${JSON.stringify(prompt).replace(/"/g, '""')}"`
                    ].join(','));
                });
                
                // Add style references
                this.srefLibrary.forEach(sref => {
                    csvRows.push([
                        'Style Reference', sref.id, `"${sref.name}"`, `"${sref.url}"`, 
                        sref.createdAt, `"${JSON.stringify(sref).replace(/"/g, '""')}"`
                    ].join(','));
                });
                
                content = csvRows.join('\n');
                filename = `${filenamePrefix}_${timestamp}.csv`;
                mimeType = 'text/csv';
                break;
                
            case 'markdown':
                content = `# Prompt Helper Library Export

**Exported:** ${new Date().toLocaleString()}  
**Version:** 2.0

## Summary
- **Prompts:** ${this.promptLibrary.length}
- **Style References:** ${this.srefLibrary.length}
- **Documents:** ${this.uploadedDocuments.length}
- **Text Notes:** ${this.textNotes.length}

## Prompts
${this.promptLibrary.map(p => `### ${p.name}\n\`\`\`\n${p.startingPrompt}\n\`\`\`\n`).join('\n')}

## Style References
${this.srefLibrary.map(s => `### ${s.name}\n- **URL:** ${s.url}\n- **Description:** ${s.explanation}\n`).join('\n')}

---
*Generated by Prompt Helper v2.0*`;
                filename = `${filenamePrefix}_${timestamp}.md`;
                mimeType = 'text/markdown';
                break;
                
            default: // txt
                content = `Prompt Helper Library Export\n`;
                content += `Exported: ${new Date().toLocaleString()}\n\n`;
                content += `PROMPTS (${this.promptLibrary.length}):\n`;
                this.promptLibrary.forEach(p => {
                    content += `- ${p.name}: ${p.startingPrompt}\n`;
                });
                filename = `${filenamePrefix}_${timestamp}.txt`;
                mimeType = 'text/plain';
        }

        this.downloadFile(content, filename, mimeType);
        try { localStorage.setItem('pf_last_export', new Date().toISOString()); } catch { /* non-critical */ }
        this.showToast(`Library exported as ${filename}`, 'success');
    }

    exportSelectedLibrary(type) {
        const timestamp = new Date().toISOString().split('T')[0];
        let content = '';
        let filename = '';
        let mimeType = '';

        switch (type) {
            case 'prompts':
                content = JSON.stringify(this.promptLibrary, null, 2);
                filename = `prompts_${timestamp}.json`;
                mimeType = 'application/json';
                break;
            case 'srefs':
                content = JSON.stringify(this.srefLibrary, null, 2);
                filename = `style_references_${timestamp}.json`;
                mimeType = 'application/json';
                break;
            case 'documents':
                content = JSON.stringify(this.uploadedDocuments, null, 2);
                filename = `documents_${timestamp}.json`;
                mimeType = 'application/json';
                break;
            case 'notes':
                content = JSON.stringify(this.textNotes, null, 2);
                filename = `text_notes_${timestamp}.json`;
                mimeType = 'application/json';
                break;
        }

        this.downloadFile(content, filename, mimeType);
        this.showToast(`${type} exported successfully`, 'success');
    }

    bulkDelete(type) {
        if (!confirm(`Are you sure you want to delete all ${type}? This action cannot be undone.`)) {
            return;
        }

        switch (type) {
            case 'prompts':
                this.promptLibrary = [];
                this.saveToLocalStorage('promptLibrary', this.promptLibrary);
                break;
            case 'srefs':
                this.srefLibrary = [];
                this.saveToLocalStorage('srefLibrary', this.srefLibrary);
                break;
            case 'documents':
                this.uploadedDocuments = [];
                this.saveToLocalStorage('uploadedDocuments', this.uploadedDocuments);
                break;
            case 'notes':
                this.textNotes = [];
                this.saveToLocalStorage('textNotes', this.textNotes);
                break;
        }

        this.showToast(`All ${type} deleted successfully`, 'warning');
    }

    // Custom Options Management
    loadCustomOptions() {
        const dropdowns = ['cameraAngle', 'perspective', 'mood', 'colorScheme', 'lighting', 'artStyle', 'composition', 'quality'];
        
        dropdowns.forEach(dropdownId => {
            const select = document.getElementById(dropdownId);
            if (select && this.customOptions[dropdownId]) {
                const addNewOpt = select.querySelector('option[value="__add_new__"]');
                this.customOptions[dropdownId].forEach(option => {
                    const optionElement = document.createElement('option');
                    optionElement.value = option.value;
                    optionElement.textContent = option.label;
                    optionElement.setAttribute('data-custom', 'true');
                    if (addNewOpt) {
                        select.insertBefore(optionElement, addNewOpt);
                    } else {
                        select.appendChild(optionElement);
                    }
                });
            }
        });

        this._initAddNewStyleHandlers();
    }

    _initTimelineTracking() {
        const updateTimeline = () => {
            const steps = document.querySelectorAll('.pf-timeline-step[data-step]');
            steps.forEach(step => {
                const n = step.getAttribute('data-step');
                let filled = false;

                if (n === '1') {
                    const model = document.getElementById('modelSelect');
                    const type = document.getElementById('promptType');
                    filled = (model && model.value) || (type && type.value);
                } else if (n === '2') {
                    const prompt = document.getElementById('startingPrompt');
                    filled = prompt && prompt.value.trim().length > 0;
                } else if (n === '3') {
                    const params = ['cameraAngle','perspective','mood','colorScheme','lighting','artStyle','composition','quality'];
                    filled = params.some(id => {
                        const el = document.getElementById(id);
                        return el && el.value && el.value !== '__add_new__';
                    });
                }

                step.classList.remove('step-active-purple', 'step-active-cyan', 'step-complete');
                if (filled) {
                    step.classList.add(n === '1' ? 'step-active-purple' : 'step-active-cyan');
                }
            });
        };

        const form = document.getElementById('promptForm');
        if (form) {
            form.addEventListener('change', updateTimeline);
            form.addEventListener('input', updateTimeline);
        }
        updateTimeline();
    }

    _initAddNewStyleHandlers() {
        document.querySelectorAll('select.pf-custom-dropdown').forEach(select => {
            if (select._addNewBound) return;
            select._addNewBound = true;
            select.addEventListener('change', (e) => {
                if (e.target.value === '__add_new__') {
                    e.target.value = '';
                    this._showAddNewModal(e.target.id);
                }
            });
        });
    }

    static FIELD_LABELS = Object.freeze({
        cameraAngle: 'Camera Angle',
        perspective: 'Perspective/Scale',
        mood: 'Mood/Emotion',
        colorScheme: 'Color Scheme',
        lighting: 'Lighting',
        artStyle: 'Art Style',
        composition: 'Composition',
        quality: 'Quality/Detail'
    });

    addCustomOption(dropdownId, customValue) {
        const select = document.getElementById(dropdownId);
        if (!select) return;
        
        const fieldLabel = PromptGenerator.FIELD_LABELS[dropdownId] || dropdownId;
        
        if (!customValue) {
            customValue = prompt(`Enter custom ${fieldLabel}:\n\nExample: "cinematic close-up" or "neon purple"`);
        }
        
        if (!customValue || !customValue.trim()) return;
        
        const trimmedValue = customValue.trim();
        const valueSlug = trimmedValue.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        
        const existingOptions = Array.from(select.options).map(opt => opt.value);
        if (existingOptions.includes(valueSlug)) {
            this.showToast('This option already exists!', 'warning');
            return;
        }
        
        if (!this.customOptions[dropdownId]) {
            this.customOptions[dropdownId] = [];
        }
        
        const newOption = { value: valueSlug, label: trimmedValue };
        this.customOptions[dropdownId].push(newOption);
        this.saveToLocalStorage('customOptions', this.customOptions);
        
        const optionElement = document.createElement('option');
        optionElement.value = newOption.value;
        optionElement.textContent = newOption.label;
        optionElement.setAttribute('data-custom', 'true');
        
        const addNewOpt = select.querySelector('option[value="__add_new__"]');
        if (addNewOpt) {
            select.insertBefore(optionElement, addNewOpt);
        } else {
            select.appendChild(optionElement);
        }
        
        select.value = newOption.value;
        this.showToast(`Custom ${fieldLabel} added: "${trimmedValue}"`, 'success');
    }

    _showAddNewModal(dropdownId) {
        const fieldLabel = PromptGenerator.FIELD_LABELS[dropdownId] || dropdownId;

        const existing = document.getElementById('pf-add-new-modal');
        if (existing) existing.remove();

        const modal = PfModal.create(`
            <div class="pf-modal-dialog pf-modal-sm">
                <div class="pf-modal-content">
                    <div class="pf-modal-header" style="padding: 12px 16px;">
                        <h6 class="pf-modal-title" style="margin: 0; font-size: 14px;">
                            <i class="bi bi-plus-circle" style="color: var(--pf-accent);"></i> Add Custom ${fieldLabel}
                        </h6>
                        <button type="button" class="pf-btn-close" data-pf-dismiss="modal">&times;</button>
                    </div>
                    <div class="pf-modal-body" style="padding: 16px;">
                        <label class="pf-card-title" style="font-size: 14px; margin-bottom: 6px; display: block; color: var(--pf-text-muted);">
                            Enter your custom value
                        </label>
                        <input type="text" class="pf-input" id="pf-add-new-input"
                               placeholder='e.g. "cinematic close-up" or "neon purple"'
                               style="font-size: 14px;" autofocus>
                    </div>
                    <div class="pf-modal-footer">
                        <button type="button" class="pf-chip" data-action="close">Cancel</button>
                        <button type="button" class="pf-chip active" data-action="add">Add</button>
                    </div>
                </div>
            </div>
        `);

        const input = modal.querySelector('#pf-add-new-input');
        const closeModal = () => PfModal.hide(modal);

        const doAdd = () => {
            const val = input.value.trim();
            if (val) {
                this.addCustomOption(dropdownId, val);
            }
            closeModal();
        };

        modal.querySelectorAll('[data-action="close"]').forEach(b => b.addEventListener('click', closeModal));
        modal.querySelector('[data-action="add"]').addEventListener('click', doAdd);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') doAdd();
            if (e.key === 'Escape') closeModal();
        });

        requestAnimationFrame(() => input.focus());
    }

    manageCustomOptions() {
        const labels = {
            cameraAngle: 'Camera Angle',
            perspective: 'Perspective/Scale',
            mood: 'Mood/Emotion',
            colorScheme: 'Color Scheme',
            lighting: 'Lighting',
            artStyle: 'Art Style',
            composition: 'Composition',
            quality: 'Quality/Detail'
        };
        
        let optionsHTML = '';
        
        Object.keys(this.customOptions).forEach(key => {
            const options = this.customOptions[key];
            if (options && options.length > 0) {
                optionsHTML += `
                    <div style="margin-bottom: 0.75rem">
                        <h6 style="font-weight: 600;">${labels[key]}</h6>
                        ${options.map((opt, idx) => `
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; padding: 0.5rem; border: 1px solid var(--pf-border); border-radius: 0.5rem;">
                                <span>${opt.label}</span>
                                <button class="pf-btn pf-btn-sm pf-btn-outline-danger" onclick="app.deleteCustomOption('${key}', ${idx})">
                                    <i class="bi bi-trash"></i> Delete
                                </button>
                            </div>
                        `).join('')}
                    </div>
                `;
            }
        });
        
        if (!optionsHTML) {
            optionsHTML = '<p class="text-muted" style="text-align: center;">No custom options yet. Click the + button next to any dropdown to add custom values.</p>';
        }
        
        const modal = PfModal.create(`
            <div class="pf-modal-dialog pf-modal-lg">
                <div class="pf-modal-content">
                    <div class="pf-modal-header">
                        <h5 class="pf-modal-title">
                            <i class="bi bi-gear"></i> Manage Custom Options
                        </h5>
                        <button type="button" class="pf-btn-close" data-pf-dismiss="modal">&times;</button>
                    </div>
                    <div class="pf-modal-body">
                        ${optionsHTML}
                    </div>
                    <div class="pf-modal-footer">
                        <button type="button" class="pf-btn pf-btn-secondary" data-pf-dismiss="modal">Close</button>
                    </div>
                </div>
            </div>
        `);
    }

    deleteCustomOption(dropdownId, index) {
        if (!confirm('Delete this custom option?')) {
            return;
        }
        
        // Remove from array
        this.customOptions[dropdownId].splice(index, 1);
        
        // Save to localStorage
        this.saveToLocalStorage('customOptions', this.customOptions);
        
        // Reload the dropdown
        const select = document.getElementById(dropdownId);
        if (select) {
            // Remove all custom options from the select
            Array.from(select.options).forEach(opt => {
                if (opt.getAttribute('data-custom') === 'true') {
                    opt.remove();
                }
            });
            
            // Reload custom options
            this.customOptions[dropdownId].forEach(option => {
                const optionElement = document.createElement('option');
                optionElement.value = option.value;
                optionElement.textContent = option.label;
                optionElement.setAttribute('data-custom', 'true');
                select.appendChild(optionElement);
            });
        }
        
        this.showToast('Custom option deleted', 'warning');
        
        // Refresh the management modal if it's open
        const modal = document.querySelector('.modal');
        if (modal) {
            modal.remove();
            this.manageCustomOptions();
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    await ModelRegistry.init();
    await VersionChecker.init();
    const app = new PromptGenerator();
    await app.init();
    window.app = app;

    // Version checks only run when the user clicks "Check for updates" on the Config tab
});

// Export for global access
window.PromptGenerator = PromptGenerator;
