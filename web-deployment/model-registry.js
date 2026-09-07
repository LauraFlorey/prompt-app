/**
 * ModelRegistry — manages the AI model catalogue for PromptForge.
 * Persists via StorageManager under key 'modelRegistry'.
 */
(function () {
    'use strict';

    // Bump when built-in catalogue / tips change so existing installs refresh non-custom models.
    const SEED_VERSION = 3;

    const SEED_DATA = [
        { id: 'midjourney', name: 'Midjourney', category: 'image',
          version: '8.2', releaseDate: '2026-07',
          changelogUrl: 'https://docs.midjourney.com/hc/en-us/articles/32199405667853-Version',
          checkUrl: 'https://docs.midjourney.com/hc/en-us/articles/32199405667853-Version',
          notes: 'Write subject first, then scene, style, and technical details. Put parameters last (--ar, --stylize, --sref, --sw, --v 8.2). Avoid keyword soup (beautiful, 8k, masterpiece). Use --sref for style refs.',
          custom: false },

        { id: 'gpt-image', name: 'GPT Image', category: 'image',
          version: '1.5', releaseDate: '2025-12',
          changelogUrl: 'https://openai.com/index/image-generation-api/',
          checkUrl: 'https://platform.openai.com/docs/guides/image-generation',
          notes: 'Use clear natural-language prose. Describe subject, composition, lighting, and any on-image text explicitly. Iterate with edit instructions rather than flag syntax. Strong for readable text in images.',
          custom: false },

        { id: 'dalle3', name: 'DALL-E 3', category: 'image',
          version: '3', releaseDate: '2023-10',
          changelogUrl: 'https://openai.com/dall-e-3',
          checkUrl: 'https://openai.com/dall-e-3',
          notes: 'Legacy OpenAI image model. Prefer GPT Image for new work. Still works with detailed natural-language prompts; avoid Midjourney-style flags.',
          custom: false },

        { id: 'flux1', name: 'Flux', category: 'image',
          version: '2', releaseDate: '2025-11',
          changelogUrl: 'https://blackforestlabs.ai',
          checkUrl: 'https://blackforestlabs.ai',
          notes: 'Natural-language prose only — no weights or negative-prompt syntax. Describe scene, lighting, and lens behavior in sentences. Use hex codes inline for brand colors; quote literal text to render.',
          custom: false },

        { id: 'stablediffusion', name: 'Stable Diffusion', category: 'image',
          version: '3.5', releaseDate: '2024-10',
          changelogUrl: 'https://stability.ai/news',
          checkUrl: 'https://stability.ai/news',
          notes: 'Supports emphasis weights like (term:1.3) and a separate negative prompt. Be specific about style, camera, and quality tokens. Keep positive and negative prompts complementary.',
          custom: false },

        { id: 'ideogram', name: 'Ideogram', category: 'image',
          version: '3.0', releaseDate: '2025-03',
          changelogUrl: 'https://ideogram.ai/blog',
          checkUrl: 'https://ideogram.ai/blog',
          notes: 'Best for posters, logos, and text-in-image. Quote the exact text to appear. Describe layout (centered title, poster, social graphic) and typography style in plain language.',
          custom: false },

        { id: 'leonardo-ai', name: 'Leonardo AI', category: 'image',
          version: 'Phoenix', releaseDate: '2025-06',
          changelogUrl: 'https://leonardo.ai',
          checkUrl: 'https://leonardo.ai',
          notes: 'Describe subject and style clearly. Use Leonardo presets/styles in the product UI; keep the text prompt focused on scene and composition rather than flag soup.',
          custom: false },

        { id: 'firefly', name: 'Adobe Firefly', category: 'image',
          version: '3', releaseDate: '2025-01',
          changelogUrl: 'https://www.adobe.com/products/firefly.html',
          checkUrl: 'https://www.adobe.com/products/firefly.html',
          notes: 'Commercial-safe generative fill/image model. Use clear descriptive prompts; specify content type (photo, illustration, vector-like). Avoid competitor brand/IP references.',
          custom: false },

        { id: 'imagen3', name: 'Google Imagen', category: 'image',
          version: '3', releaseDate: '2024-12',
          changelogUrl: 'https://deepmind.google/technologies/imagen-3/',
          checkUrl: 'https://deepmind.google/technologies/imagen-3/',
          notes: 'Natural-language prompts with strong photorealism. Be explicit about camera, lighting, and composition. No Midjourney flags.',
          custom: false },

        { id: 'sora', name: 'Sora', category: 'video',
          version: '2', releaseDate: '2025-12',
          changelogUrl: 'https://openai.com/sora',
          checkUrl: 'https://openai.com/sora',
          notes: 'Write like a shot list: subject action, camera move, lighting, and duration intent. Prefer one clear beat per clip. Mention motion continuity and environment physics when needed.',
          custom: false },

        { id: 'veo2', name: 'Google Veo', category: 'video',
          version: '3.1', releaseDate: '2025-12',
          changelogUrl: 'https://deepmind.google/technologies/veo/',
          checkUrl: 'https://deepmind.google/technologies/veo/',
          notes: 'Cinematic shot language works well. Describe camera path, lens feel, and audio/ambiance if supported. Keep motion physically plausible and scene continuity explicit.',
          custom: false },

        { id: 'runway', name: 'Runway', category: 'video',
          version: 'Gen-4', releaseDate: '2025-03',
          changelogUrl: 'https://runwayml.com/research',
          checkUrl: 'https://runwayml.com/research',
          notes: 'Short cinematic prompts with clear subject motion and camera direction. For image-to-video, describe what should move vs stay locked. Keep clips focused on one action.',
          custom: false },

        { id: 'kling', name: 'Kling AI', category: 'video',
          version: '3.0', releaseDate: '2026-01',
          changelogUrl: 'https://kling.ai/quickstart/klingai-video-3-model-user-guide',
          checkUrl: 'https://kling.ai',
          notes: 'Supports multi-shot narrative and native audio. Describe shot sequence, character consistency, and motion paths clearly. Specify duration intent up to ~15s when using 3.0 features.',
          custom: false },

        { id: 'pika', name: 'Pika Labs', category: 'video',
          version: '2.2', releaseDate: '2025-05',
          changelogUrl: 'https://pika.art',
          checkUrl: 'https://pika.art',
          notes: 'Keep prompts short and motion-forward. Name the camera move and the main action. Good for stylized / playful clips.',
          custom: false },

        { id: 'luma-dream', name: 'Luma Dream Machine', category: 'video',
          version: 'Ray2', releaseDate: '2025-01',
          changelogUrl: 'https://lumalabs.ai/dream-machine',
          checkUrl: 'https://lumalabs.ai/dream-machine',
          notes: 'Describe keyframes and camera path. Emphasize spatial coherence and what must remain consistent across the clip.',
          custom: false }
    ];

    // Legacy / alternate IDs used in older HTML, templates, or docs
    const ID_ALIASES = {
        'stable-diffusion': 'stablediffusion',
        'ideogram2': 'ideogram',
        'kling-ai': 'kling',
        'dall-e-3': 'dalle3',
        'dall-e3': 'dalle3',
        'gptimage': 'gpt-image',
        'gpt-image-1': 'gpt-image',
        'gpt-image-1.5': 'gpt-image',
        'flux': 'flux1',
        'flux.1': 'flux1',
        'flux2': 'flux1',
        'veo': 'veo2',
        'veo3': 'veo2',
        'veo-3': 'veo2',
        'runway-ml': 'runway',
        'runwayml': 'runway',
        'midjourney-v7': 'midjourney',
        'midjourney-v8': 'midjourney'
    };

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

    function normalizeCategory(category) {
        if (category === 'other') return 'custom';
        return category || 'custom';
    }

    async function persist() {
        await StorageManager.save('modelRegistry', _registry);
        try {
            await StorageManager.save('modelRegistrySeedVersion', SEED_VERSION);
        } catch { /* optional */ }
    }

    function mergeBuiltIns(stored) {
        const byId = new Map(stored.map(m => [m.id, m]));
        for (const seed of SEED_DATA) {
            const existing = byId.get(seed.id);
            if (!existing) {
                byId.set(seed.id, JSON.parse(JSON.stringify(seed)));
                continue;
            }
            // Refresh catalogue metadata for built-ins; keep user-edited version if they customized it
            // unless seed is newer and notes were empty, or force tip refresh from seed.
            if (!existing.custom) {
                const userTouchedVersion = existing.version && existing.version !== seed.version
                    && existing.releaseDate && existing.releaseDate !== seed.releaseDate;
                existing.name = seed.name;
                existing.category = seed.category;
                existing.changelogUrl = seed.changelogUrl;
                existing.checkUrl = seed.checkUrl;
                // Always refresh built-in prompt tips from seed (notes field)
                existing.notes = seed.notes;
                if (!userTouchedVersion) {
                    existing.version = seed.version;
                    existing.releaseDate = seed.releaseDate;
                }
                existing.custom = false;
            }
        }
        return Array.from(byId.values());
    }

    const ModelRegistry = {
        async init() {
            try {
                const stored = await StorageManager.load('modelRegistry');
                const storedSeedVersion = await StorageManager.load('modelRegistrySeedVersion');
                if (Array.isArray(stored) && stored.length > 0) {
                    if (storedSeedVersion !== SEED_VERSION) {
                        _registry = mergeBuiltIns(stored);
                        await persist();
                    } else {
                        _registry = stored;
                    }
                } else {
                    _registry = JSON.parse(JSON.stringify(SEED_DATA));
                    await persist();
                }
            } catch (e) {
                console.warn('ModelRegistry.init — storage read failed, using seed data:', e);
                _registry = JSON.parse(JSON.stringify(SEED_DATA));
            }
            console.debug(`ModelRegistry ready — ${_registry.length} models loaded`);
        },

        resolveId(id) {
            if (!id) return '';
            const key = String(id).trim().toLowerCase();
            return ID_ALIASES[key] || key;
        },

        idsMatch(a, b) {
            return this.resolveId(a) === this.resolveId(b);
        },

        getAliases() {
            return { ...ID_ALIASES };
        },

        getSeedVersion() {
            return SEED_VERSION;
        },

        async refreshBuiltInTips() {
            _registry = mergeBuiltIns(_registry);
            await persist();
            return _registry.length;
        },

        getAll() {
            return _registry;
        },

        getById(id) {
            const resolved = this.resolveId(id);
            return _registry.find(m => m.id === resolved || m.id === id) || null;
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
                category: normalizeCategory(modelObject.category),
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

            const next = { ...fields };
            if (next.category) next.category = normalizeCategory(next.category);
            Object.assign(entry, next);
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
                    const vLabel = String(m.version).startsWith('v') || String(m.version).startsWith('V')
                        ? m.version
                        : `v${m.version}`;
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
