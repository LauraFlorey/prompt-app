/**
 * ModelRegistry — manages the AI model catalogue for PromptForge.
 * Persists via StorageManager under key 'modelRegistry'.
 */
(function () {
    'use strict';

    const SEED_DATA = [
        { id: 'midjourney', name: 'Midjourney', category: 'image',
          version: 'v7', releaseDate: '2025-02',
          changelogUrl: 'https://docs.midjourney.com/docs/model-versions',
          checkUrl: 'https://docs.midjourney.com/docs/model-versions',
          notes: '', custom: false },

        { id: 'dalle3', name: 'DALL-E 3', category: 'image',
          version: '3', releaseDate: '2023-10',
          changelogUrl: 'https://openai.com/dall-e-3',
          checkUrl: 'https://openai.com/dall-e-3',
          notes: '', custom: false },

        { id: 'flux1', name: 'Flux.1', category: 'image',
          version: '1.1 Pro', releaseDate: '2024-10',
          changelogUrl: 'https://blackforestlabs.ai',
          checkUrl: 'https://blackforestlabs.ai',
          notes: '', custom: false },

        { id: 'stablediffusion', name: 'Stable Diffusion', category: 'image',
          version: '3.5', releaseDate: '2024-10',
          changelogUrl: 'https://stability.ai/news',
          checkUrl: 'https://stability.ai/news',
          notes: '', custom: false },

        { id: 'ideogram', name: 'Ideogram', category: 'image',
          version: '2.0', releaseDate: '2024-08',
          changelogUrl: 'https://ideogram.ai/blog',
          checkUrl: 'https://ideogram.ai/blog',
          notes: '', custom: false },

        { id: 'sora', name: 'Sora', category: 'video',
          version: '1.0', releaseDate: '2024-12',
          changelogUrl: 'https://openai.com/sora',
          checkUrl: 'https://openai.com/sora',
          notes: '', custom: false },

        { id: 'veo2', name: 'Google Veo 2', category: 'video',
          version: '2', releaseDate: '2024-12',
          changelogUrl: 'https://deepmind.google/technologies/veo',
          checkUrl: 'https://deepmind.google/technologies/veo',
          notes: '', custom: false },

        { id: 'runway', name: 'Runway ML', category: 'video',
          version: 'Gen-3 Alpha', releaseDate: '2024-06',
          changelogUrl: 'https://runwayml.com/research',
          checkUrl: 'https://runwayml.com/research',
          notes: '', custom: false },

        { id: 'kling', name: 'Kling AI', category: 'video',
          version: '1.6', releaseDate: '2024-11',
          changelogUrl: 'https://klingai.com',
          checkUrl: 'https://klingai.com',
          notes: '', custom: false }
    ];

    const CATEGORY_ORDER = ['image', 'video', 'text', 'custom'];
    const CATEGORY_LABELS = {
        image: 'Image Generation',
        video: 'Video Generation',
        text:  'Text & Multimodal',
        custom: 'Custom'
    };

    let _registry = [];

    function slugify(name) {
        return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }

    async function persist() {
        await StorageManager.save('modelRegistry', _registry);
    }

    const ModelRegistry = {
        async init() {
            try {
                const stored = await StorageManager.load('modelRegistry');
                if (Array.isArray(stored) && stored.length > 0) {
                    _registry = stored;
                } else {
                    _registry = JSON.parse(JSON.stringify(SEED_DATA));
                    await persist();
                }
            } catch (e) {
                console.warn('ModelRegistry.init — storage read failed, using seed data:', e);
                _registry = JSON.parse(JSON.stringify(SEED_DATA));
            }
            console.log(`ModelRegistry ready — ${_registry.length} models loaded`);
        },

        getAll() {
            return _registry;
        },

        getByCategory(category) {
            return _registry.filter(m => m.category === category);
        },

        async add(modelObject) {
            if (!modelObject || !modelObject.name || !modelObject.category || !modelObject.version) {
                return { success: false, error: 'Missing required fields: name, category, version' };
            }

            const entry = {
                id: modelObject.id || slugify(modelObject.name),
                name: modelObject.name,
                category: modelObject.category,
                version: modelObject.version,
                releaseDate: modelObject.releaseDate || '',
                changelogUrl: modelObject.changelogUrl || '',
                checkUrl: modelObject.checkUrl || '',
                notes: modelObject.notes || '',
                custom: true
            };

            if (_registry.some(m => m.id === entry.id)) {
                return { success: false, error: `Model with id "${entry.id}" already exists` };
            }

            _registry.push(entry);
            await persist();
            return { success: true };
        },

        async update(id, fields) {
            const entry = _registry.find(m => m.id === id);
            if (!entry) return null;

            Object.assign(entry, fields);
            entry.id = id;
            await persist();
            return entry;
        },

        async remove(id) {
            const entry = _registry.find(m => m.id === id);
            if (!entry) return { success: false, error: 'Model not found' };
            if (!entry.custom) return { success: false, error: 'Cannot remove built-in models' };

            _registry = _registry.filter(m => m.id !== id);
            await persist();
            return { success: true };
        },

        getForDropdown() {
            const result = [];
            for (const cat of CATEGORY_ORDER) {
                const models = _registry.filter(m => m.category === cat);
                if (models.length === 0) continue;
                for (const m of models) {
                    const vLabel = m.version.startsWith('v') ? m.version : `v${m.version}`;
                    result.push({
                        value: m.id,
                        label: `${m.name} (${vLabel})`,
                        category: cat,
                        groupLabel: CATEGORY_LABELS[cat] || cat
                    });
                }
            }
            return result;
        },

        getSeedData() {
            return JSON.parse(JSON.stringify(SEED_DATA));
        },

        getCategoryLabels() {
            return { ...CATEGORY_LABELS };
        }
    };

    window.ModelRegistry = ModelRegistry;
})();
