/**
 * VersionChecker — checks for new AI model versions via RSS feeds
 * with CORS proxy fallback and rate-limited concurrency.
 */
(function () {
    'use strict';

    const CORS_PROXY = 'https://api.allorigins.win/get?url=';
    const FETCH_TIMEOUT = 8000;
    const CACHE_TTL_MIN = 60;
    const CONCURRENCY = 3;

    const KNOWN_FEEDS = {
        midjourney:       null,
        dalle3:           'https://openai.com/news/rss.xml',
        flux1:            null,
        stablediffusion:  'https://stability.ai/news/rss',
        ideogram:         null,
        sora:             'https://openai.com/news/rss.xml',
        veo2:             null,
        runway:           'https://runwayml.com/blog/rss',
        kling:            null,
        leonardoai:       null
    };

    const KNOWN_JSON_ENDPOINTS = {
        // reserved for future structured version APIs
    };

    const FEED_KEYWORDS = {
        midjourney:       ['midjourney'],
        dalle3:           ['dall-e', 'dall\u00b7e', 'dalle', 'image generation'],
        flux1:            ['flux', 'black forest'],
        stablediffusion:  ['stable diffusion', 'sdxl', 'sd3'],
        ideogram:         ['ideogram'],
        sora:             ['sora', 'video generation', 'text to video'],
        veo2:             ['veo'],
        runway:           ['runway', 'gen-3', 'gen3'],
        kling:            ['kling']
    };

    const RATE_LIMIT_PAUSE_MS = 5000;

    let _cache = [];
    let _lastCheckTime = null;

    // ── RSS / Atom feed parser ───────────────────────────────────────

    async function fetchFeed(url) {
        const proxyUrl = CORS_PROXY + encodeURIComponent(url);
        const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
        if (res.status === 429) {
            const err = new Error('Rate limited (429)');
            err.rateLimited = true;
            throw err;
        }
        if (!res.ok) throw new Error(`Proxy returned ${res.status}`);
        const json = await res.json();
        if (json.status && json.status.error) {
            const err = new Error('Proxy error: ' + (json.status.error || 'unknown'));
            err.rateLimited = true;
            throw err;
        }
        if (!json.contents) throw new Error('Empty proxy response');

        const parser = new DOMParser();
        const doc = parser.parseFromString(json.contents, 'text/xml');

        const parseError = doc.querySelector('parsererror');
        if (parseError) {
            console.warn('VersionChecker: XML parse error. Raw response (500 chars):', json.contents.substring(0, 500));
            throw new Error('XML parse error');
        }

        const items = [...doc.querySelectorAll('item, entry')];
        return items.map(item => {
            const linkEl = item.querySelector('link');
            const link = linkEl
                ? (linkEl.textContent.trim() || linkEl.getAttribute('href') || '')
                : '';
            return {
                title: item.querySelector('title')?.textContent?.trim() || '',
                description: item.querySelector('description, summary, content')?.textContent?.trim() || '',
                date:  item.querySelector('pubDate, published, updated')?.textContent?.trim() || '',
                link
            };
        });
    }

    function findRelevantItem(items, modelId) {
        const keywords = FEED_KEYWORDS[modelId] || [];
        if (keywords.length === 0) return null;

        for (const item of items) {
            const searchable = (item.title + ' ' + (item.description || '')).toLowerCase();
            if (keywords.some(kw => searchable.includes(kw.toLowerCase()))) {
                return item;
            }
        }
        return null;
    }

    // ── JSON endpoint checker (tier 2, reserved) ─────────────────────

    async function fetchJSON(url) {
        const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
        if (!res.ok) throw new Error(`JSON endpoint returned ${res.status}`);
        return res.json();
    }

    // ── Concurrency limiter ──────────────────────────────────────────

    async function runWithConcurrency(tasks, limit) {
        const results = [];
        const executing = new Set();

        for (const task of tasks) {
            const p = task().then(r => { executing.delete(p); return r; });
            executing.add(p);
            results.push(p);
            if (executing.size >= limit) {
                await Promise.race(executing);
            }
        }

        return Promise.all(results);
    }

    // ── Per-model check ──────────────────────────────────────────────

    async function checkSingleModel(model) {
        const result = {
            modelId: model.id,
            status: 'unavailable',
            latestMention: null,
            mentionDate: null,
            mentionUrl: null,
            checkedAt: new Date().toISOString()
        };

        // Tier 2: JSON endpoint
        const jsonUrl = KNOWN_JSON_ENDPOINTS[model.id];
        if (jsonUrl) {
            try {
                const data = await fetchJSON(jsonUrl);
                if (data && data.version) {
                    result.status = 'found';
                    result.latestMention = `Version ${data.version}`;
                    result.mentionDate = data.date || result.checkedAt;
                    result.mentionUrl = jsonUrl;
                    return result;
                }
            } catch (e) {
                console.warn(`VersionChecker: JSON check failed for ${model.id}:`, e.message);
            }
        }

        // Tier 1: RSS/Atom feed
        const feedUrl = KNOWN_FEEDS[model.id];
        if (feedUrl) {
            try {
                const items = await fetchFeed(feedUrl);
                const match = findRelevantItem(items, model.id);
                if (match) {
                    result.status = 'found';
                    result.latestMention = match.title;
                    result.mentionDate = match.date ? new Date(match.date).toISOString() : null;
                    result.mentionUrl = match.link;
                } else {
                    result.status = 'unchanged';
                }
                return result;
            } catch (e) {
                if (e.rateLimited) throw e;
                console.debug(`VersionChecker: Feed check failed for ${model.id}:`, e.message);
                result.status = 'error';
                return result;
            }
        }

        // Tier 3: no automated source — user-assisted
        result.status = 'unavailable';
        return result;
    }

    // ── Cache helpers ────────────────────────────────────────────────

    async function saveCache(results, timestamp) {
        _cache = results;
        _lastCheckTime = timestamp;
        try {
            await StorageManager.save('versionCheckCache', { results, checkedAt: timestamp });
        } catch (e) {
            console.warn('VersionChecker: failed to save cache:', e);
        }
    }

    async function loadCache() {
        try {
            const data = await StorageManager.load('versionCheckCache');
            if (data && Array.isArray(data.results)) {
                _cache = data.results;
                _lastCheckTime = data.checkedAt || null;
            }
        } catch (e) {
            console.warn('VersionChecker: failed to load cache:', e);
        }
    }

    // ── URL Import ────────────────────────────────────────────────────

    const IMPORT_TIMEOUT = 10000;

    const KNOWN_SHORTCUTS = {
        'midjourney.com':      { name: 'Midjourney',          category: 'image' },
        'openai.com/dall-e':   { name: 'DALL-E',              category: 'image' },
        'openai.com/sora':     { name: 'Sora',                category: 'video' },
        'stability.ai':        { name: 'Stable Diffusion',    category: 'image' },
        'blackforestlabs.ai':  { name: 'Flux',                category: 'image' },
        'runwayml.com':        { name: 'Runway ML',           category: 'video' },
        'ideogram.ai':         { name: 'Ideogram',            category: 'image' },
        'klingai.com':         { name: 'Kling AI',            category: 'video' },
        'pika.art':            { name: 'Pika Labs',           category: 'video' },
        'lumalabs.ai':         { name: 'Luma Dream Machine',  category: 'video' }
    };

    const CATEGORY_KEYWORDS = {
        image: ['midjourney','dall-e','stable-diffusion','flux','ideogram','leonardo','firefly','imagen'],
        video: ['sora','veo','runway','pika','kling','hailuo','haiper','luma'],
        text:  ['gpt','claude','gemini','llama','mistral']
    };

    const SUFFIX_RE = /\s*[\|\-–—:]\s*(blog|docs|documentation|news|official|website|home|homepage|updates|changelog).*$/i;

    function stripSuffix(text) {
        return (text || '').replace(SUFFIX_RE, '').trim();
    }

    function extractName(doc, shortcut) {
        if (shortcut?.name) return shortcut.name;
        const ogSiteName = doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content')?.trim();
        if (ogSiteName && ogSiteName.length < 80) return ogSiteName;
        const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim();
        if (ogTitle) return stripSuffix(ogTitle);
        const h1 = doc.querySelector('h1')?.textContent?.trim();
        if (h1 && h1.length < 100) return stripSuffix(h1);
        const title = doc.querySelector('title')?.textContent?.trim();
        if (title) return stripSuffix(title);
        return '';
    }

    function extractVersion(textContent) {
        const versionPatterns = [
            /v(\d+(?:\.\d+)*)/gi,
            /version\s+(\d+(?:\.\d+)*)/gi,
            /gen-(\d+(?:\s*alpha|\s*beta)?)/gi
        ];
        const proximityKeywords = ['model', 'release', 'launch', 'introducing', 'announcing', 'latest', 'new'];
        let bestMatch = null;
        let bestScore = Infinity;

        for (const re of versionPatterns) {
            let m;
            while ((m = re.exec(textContent)) !== null) {
                const idx = m.index;
                const surrounding = textContent.substring(Math.max(0, idx - 80), Math.min(textContent.length, idx + 80)).toLowerCase();
                let score = idx;
                for (const kw of proximityKeywords) {
                    if (surrounding.includes(kw)) { score = -1; break; }
                }
                if (score < bestScore) {
                    bestScore = score;
                    const full = m[0].trim();
                    bestMatch = full.toLowerCase().startsWith('v') || full.toLowerCase().startsWith('gen')
                        ? full : 'v' + m[1];
                }
            }
        }
        return bestMatch;
    }

    function extractDate(doc, textContent) {
        const timeEl = doc.querySelector('time[datetime]');
        if (timeEl) {
            const dt = timeEl.getAttribute('datetime');
            const d = new Date(dt);
            if (!isNaN(d.getTime())) return d.toISOString().slice(0, 7);
        }
        const ogDate = doc.querySelector('meta[property="article:published_time"]')?.getAttribute('content');
        if (ogDate) {
            const d = new Date(ogDate);
            if (!isNaN(d.getTime())) return d.toISOString().slice(0, 7);
        }
        const dateRe = /(?:(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}|\b\d{4}-\d{2}(?:-\d{2})?\b)/i;
        const dateMatch = textContent.match(dateRe);
        if (dateMatch) {
            const d = new Date(dateMatch[0]);
            if (!isNaN(d.getTime())) return d.toISOString().slice(0, 7);
        }
        return '';
    }

    function classifyCategory(url, textContent, shortcut) {
        if (shortcut?.category) return shortcut.category;
        const combined = (url + ' ' + textContent.substring(0, 2000)).toLowerCase();
        for (const [cat, kws] of Object.entries(CATEGORY_KEYWORDS)) {
            if (kws.some(kw => combined.includes(kw))) return cat;
        }
        return 'custom';
    }

    function getShortcut(url) {
        const lc = url.toLowerCase();
        for (const [domain, data] of Object.entries(KNOWN_SHORTCUTS)) {
            if (lc.includes(domain)) return data;
        }
        return null;
    }

    async function importFromUrlInternal(url) {
        const shortcut = getShortcut(url);
        const result = {
            name: shortcut?.name || '',
            category: shortcut?.category || 'custom',
            version: '',
            releaseDate: '',
            description: '',
            changelogUrl: url,
            checkUrl: url,
            notes: '',
            confidence: 'low'
        };

        let doc = null;
        let textContent = '';

        try {
            const proxyUrl = CORS_PROXY + encodeURIComponent(url);
            const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(IMPORT_TIMEOUT) });
            if (!res.ok) throw new Error(`Proxy returned ${res.status}`);
            const json = await res.json();
            if (!json.contents) throw new Error('Empty proxy response');

            const parser = new DOMParser();
            doc = parser.parseFromString(json.contents, 'text/html');
            textContent = doc.body?.textContent || '';
        } catch (e) {
            console.warn('VersionChecker.importFromUrl: fetch failed:', e.message);
            if (!shortcut) return { ...result, _fetchError: true };
        }

        if (doc) {
            if (!result.name) result.name = extractName(doc, shortcut);
            result.version = extractVersion(textContent) || '';
            result.releaseDate = extractDate(doc, textContent) || '';
            result.category = classifyCategory(url, textContent, shortcut);

            const ogDesc = doc.querySelector('meta[property="og:description"]')?.getAttribute('content')?.trim() || '';
            result.description = ogDesc.length > 200 ? ogDesc.slice(0, 200) + '…' : ogDesc;
        }

        if (result.name && result.version && result.releaseDate) {
            result.confidence = 'high';
        } else if (result.name && result.version) {
            result.confidence = 'medium';
        } else {
            result.confidence = 'low';
        }

        return result;
    }

    // ── Public API ───────────────────────────────────────────────────

    const VersionChecker = {

        async init() {
            await loadCache();
            console.debug(`VersionChecker ready — ${_cache.length} cached results, age: ${this.getCacheAge()} min`);
        },

        async checkModel(modelId) {
            const model = ModelRegistry.getAll().find(m => m.id === modelId);
            if (!model) return { modelId, status: 'error', latestMention: null, mentionDate: null, mentionUrl: null, checkedAt: new Date().toISOString() };
            return checkSingleModel(model);
        },

        async checkAll() {
            if (this.getCacheAge() < CACHE_TTL_MIN) {
                console.debug('VersionChecker: Using cached results (age: ' + Math.round(this.getCacheAge()) + ' min)');
                return _cache;
            }

            const models = ModelRegistry.getAll();
            const results = [];
            let rateLimitHit = false;
            let rateLimitRetried = false;
            let skippedCount = 0;

            for (let i = 0; i < models.length; i++) {
                const model = models[i];
                try {
                    const r = await checkSingleModel(model);
                    results.push(r);
                } catch (e) {
                    if (e.rateLimited && !rateLimitRetried) {
                        rateLimitHit = true;
                        rateLimitRetried = true;
                        console.debug(`VersionChecker: Rate limited at model ${model.id}. Pausing ${RATE_LIMIT_PAUSE_MS}ms then retrying.`);
                        await new Promise(r => setTimeout(r, RATE_LIMIT_PAUSE_MS));
                        try {
                            const r = await checkSingleModel(model);
                            results.push(r);
                        } catch {
                            results.push({ modelId: model.id, status: 'unavailable', latestMention: null, mentionDate: null, mentionUrl: null, checkedAt: new Date().toISOString() });
                            skippedCount++;
                            for (let j = i + 1; j < models.length; j++) {
                                results.push({ modelId: models[j].id, status: 'unavailable', latestMention: null, mentionDate: null, mentionUrl: null, checkedAt: new Date().toISOString() });
                                skippedCount++;
                            }
                            break;
                        }
                    } else if (e.rateLimited) {
                        results.push({ modelId: model.id, status: 'unavailable', latestMention: null, mentionDate: null, mentionUrl: null, checkedAt: new Date().toISOString() });
                        skippedCount++;
                        for (let j = i + 1; j < models.length; j++) {
                            results.push({ modelId: models[j].id, status: 'unavailable', latestMention: null, mentionDate: null, mentionUrl: null, checkedAt: new Date().toISOString() });
                            skippedCount++;
                        }
                        break;
                    } else {
                        results.push({ modelId: model.id, status: 'error', latestMention: null, mentionDate: null, mentionUrl: null, checkedAt: new Date().toISOString() });
                    }
                }
            }

            const timestamp = new Date().toISOString();
            await saveCache(results, timestamp);

            const detail = { results, rateLimitHit, skippedCount };
            try {
                window.dispatchEvent(new CustomEvent('pf:versionCheckComplete', { detail }));
            } catch { /* no event support */ }

            console.debug(`VersionChecker: checked ${results.length} models — ` +
                `${results.filter(r => r.status === 'found').length} found, ` +
                `${results.filter(r => r.status === 'unchanged').length} unchanged, ` +
                `${results.filter(r => r.status === 'unavailable').length} unavailable, ` +
                `${results.filter(r => r.status === 'error').length} errors` +
                (skippedCount ? `, ${skippedCount} skipped (rate limited)` : ''));

            return results;
        },

        getCache() {
            return _cache;
        },

        getCacheAge() {
            if (!_lastCheckTime) return Infinity;
            return (Date.now() - new Date(_lastCheckTime).getTime()) / 60000;
        },

        getResultForModel(modelId) {
            return _cache.find(r => r.modelId === modelId) || null;
        },

        async importFromUrl(url) {
            return importFromUrlInternal(url);
        }
    };

    window.VersionChecker = VersionChecker;
})();
