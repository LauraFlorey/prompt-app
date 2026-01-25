# PromptForge

Build, refine, and save prompts for modern AI models — **static, local-first, and Bootstrap 5–based**.

A comprehensive web application for generating, managing, and optimizing prompts for various AI models. Features style references (sref), 20+ AI models, local LLM integration, advanced search, and professional prompt generation capabilities.

## Recent updates (January 2026)

- **UI/UX improvements (Bootstrap 5)**:
  - **Progressive disclosure**: advanced fields grouped into accordions (Camera / Look / Style & Composition / Style Reference).
  - **Primary CTA**: “Generate Prompt” is the prominent action; other actions are secondary.
  - **Mobile polish**: sticky Generate button on small screens.
  - **Library dock**: Library panel is sticky on desktop and “Add to Library” is collapsible for cleaner browsing.
- **Hardened output rendering** (`app.js`):
  - `displayOutput()` no longer injects untrusted strings via `innerHTML` for text/json/markdown/csv.
  - HTML output is rendered in a **sandboxed iframe** to isolate scripts/styles from the host page.
- **Model-aware style references (sref)** (`app.js`):
  - **Midjourney** keeps `--sref` / `--sw`.
  - Other models preserve sref details as plain-language notes (type/value/weight) instead of appending Midjourney flags.

## Features

### 🎯 Prompt Generation
- **Comprehensive Model Support**: 20+ AI models organized by category:
  - **Image Generation**: Midjourney, DALL-E 3, Stable Diffusion, Flux.1, Ideogram 2.0, Leonardo AI, Nano Banana, Adobe Firefly, Google Imagen 3
  - **Video Generation**: OpenAI Sora, Google Veo 2, Runway ML, Pika Labs, Luma Dream Machine, Kling AI, Hailuo (MiniMax), Haiper
  - **Text & Multimodal**: GPT-4, Claude, Google Gemini, Meta Llama
  - **Custom Models**: Support for any other AI model
- **Prompt Types**: Text-to-image, image-to-video, text-to-video, text-to-text, and image-to-image
- **Comprehensive Parameters**: 
  - **Camera Controls**: Camera angles and perspective options
  - **Mood/Emotion**: 25+ mood options (happy, dramatic, mysterious, calm, romantic)
  - **Color Schemes**: Warm, cool, monochromatic, vibrant, and natural color palettes
  - **Lighting**: Natural, studio, atmospheric, and artificial lighting options
  - **Art Styles**: Photography, digital art, traditional art, artistic movements, modern styles
  - **Composition**: Rule of thirds, symmetrical, leading lines, golden ratio, and more
  - **Quality Settings**: Resolution, detail level, and professional quality options
- **Output Formats**: Generate prompts in plain text or structured JSON format

### 📚 Prompt Library
- Save frequently used prompts for quick access
- **Advanced Search**: Real-time search with highlighting across prompts, models, and content
- Load saved prompts with one click
- **Import/Export functionality**: Full backup and restore capabilities
- **Enhanced filtering**: Search by model, type, or content

### 🎨 Style Reference (sref) System
- **Style Reference Library**: Save and manage image URLs with descriptions
- **Weight Control**: Adjust style influence (0-1000) for fine-tuning
- **Style Descriptions**: Document the mood, aesthetic, and approach of each reference
- **Midjourney Integration**: Automatic `--sref` and `--sw` parameter formatting (Midjourney only)
- **One-Click Loading**: Quick access to saved style references
- **Reference Preview**: Direct links to view original style images

### 📁 Document & Web Content Management
- Upload documentation from AI model providers
- **Fetch content directly from web URLs** - Add AI documentation, tutorials, and guides from websites
- **AI-Powered Content Analysis**: Local LLM integration for intelligent enhancement extraction
- **Enhanced keyword extraction**: Advanced pattern recognition for technical parameters
- Support for various file formats (.txt, .json, .md, .pdf, .doc, .docx)
- Drag-and-drop file upload interface
- Multiple fallback methods for web content fetching (direct fetch, CORS proxies, manual input)

### 💾 Data Persistence
- All data stored locally in browser storage
- No server required - runs completely offline
- Automatic saving of prompts, documents, and manual information

### 🎨 Modern UI
- **Responsive Bootstrap 5 design** with enhanced mobile support
- **Dark mode support** with automatic system preference detection
- Intuitive drag-and-drop interfaces
- Real-time feedback and notifications
- **Advanced search with highlighting**
- **Local LLM integration settings** with connection testing

### 🤖 Local LLM Integration (NEW in v2.0)
- **AI-Powered Analysis**: Use local language models to analyze documentation and extract intelligent insights
- **Supported Services**: Ollama, LM Studio, LocalAI, and any OpenAI-compatible API
- **Enhanced Content Understanding**: Goes beyond keyword matching to understand context and meaning
- **Privacy-First**: All analysis happens locally on your computer
- **Intelligent Enhancement Extraction**: Automatically identifies best practices, parameters, and techniques
- **Connection Testing**: Built-in tools to verify LLM connectivity and available models

## How to Use

1. **Open the Application**: Simply open `index.html` in any modern web browser
2. **Configure Your Prompt**:
   - Select the AI model you're targeting
   - Choose the type of prompt (text-to-image, etc.)
   - Enter your base prompt
   - Optionally expand accordion sections to set advanced options (camera, look, style, etc.)
3. **Generate**: Click "Generate Prompt" to create your enhanced prompt
4. **Save to Library**: Save useful prompts for future use
5. **Add Content Sources**: 
   - Upload documentation files from AI providers
   - **Add web URLs** from AI model documentation, tutorials, or prompt guides
   - **Save style references** with URLs, weights, and descriptions
6. **Enable Local LLM Analysis** (Optional):
   - Click the "LLM" button in the Prompt Library
   - Configure your local LLM service (Ollama, LM Studio, etc.)
   - Test the connection and enable AI-powered analysis
7. **Search and Filter**: Use the search boxes to quickly find saved prompts and style references
8. **Copy Output**: Use the generated prompt in your AI tool of choice

## File Structure

```
prompt-app/
├── index.html          # Main application interface
├── app.js             # Core application logic
└── README.md          # This documentation
```

## Running locally (optional)

You can open `index.html` directly, or run a tiny static server:

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

## Browser Compatibility

- Chrome/Chromium (recommended)
- Firefox
- Safari
- Edge

## Local Storage & Data Persistence

The application uses browser `localStorage` to persist all user data. **No server or account is required** - everything stays on your device.

### What Gets Saved Locally

| Data | Storage Key | Description |
|------|-------------|-------------|
| Saved prompts | `promptLibrary` | Your saved prompt library |
| Uploaded documents | `uploadedDocuments` | Content extracted from uploaded files |
| Manual notes | `manualInformation` | Notes you've added manually |
| Style references | `srefLibrary` | Saved sref URLs, codes, and descriptions |
| Text notes | `textNotes` | Additional text notes |
| Custom dropdown options | `customOptions` | Custom items added to dropdown fields |
| LLM settings | `llmSettings` | Local LLM configuration |
| Save preferences | `saveSettings` | Auto-save and backup settings |
| Theme preference | `theme` | Light/dark mode preference |
| Auto-backups | `backup_[timestamp]` | Automatic backup snapshots |

### Storage Behavior

- **Browser-Specific**: Data is tied to your specific browser (Chrome data won't appear in Firefox)
- **Device-Specific**: Data doesn't sync between devices automatically
- **Persistent**: Data survives browser restarts and computer reboots
- **Clearable**: Can be cleared via browser settings or the app's "Clear All" feature
- **Storage Limit**: Browsers typically allow 5-10MB per domain

### Export & Backup

Since data is stored locally, the app provides **export functionality** to backup your library:
- Export to **JSON** (full backup, can be re-imported)
- Export to **Markdown** (human-readable documentation)
- Export to **CSV** (spreadsheet-compatible)
- Export to **HTML** (web-ready formatted output)

Use the export feature to transfer your library to another device or create backups.

## Privacy

- ✅ **100% Private**: All data is stored locally in your browser
- ✅ **No Server Required**: No data is ever sent to external servers
- ✅ **Works Offline**: Functions completely offline after initial load
- ✅ **No Account Needed**: No sign-up, login, or registration required
- ✅ **No Tracking**: No analytics, cookies, or tracking of any kind

## Tips for Best Results

1. **Add Content Sources**: 
   - Upload official documentation from AI model providers
   - **Add URLs** from model documentation pages, prompt engineering guides, and tutorials
   - The app will automatically extract enhancement keywords from web content
2. **Use Specific Camera Angles**: Different models respond better to specific camera terminology
3. **Save Successful Prompts**: Build your library of working prompts for different use cases
4. **Manual Information**: Add context about your specific use case in the manual information section
5. **Web Content Examples**:
   - Midjourney documentation pages
   - Stable Diffusion prompt guides
   - AI model release notes and tutorials
6. **Model-Specific Tips**:
   - **Midjourney**: Use --style and --quality parameters for better control
   - **Nano Banana**: Focus on natural language editing descriptions
   - **Flux.1**: Emphasize professional and sharp imagery keywords
   - **Sora**: Include cinematography terms for video generation
   - **Ideogram 2.0**: Great for text-in-image generation

## Troubleshooting

- **Prompts not saving**: Check if your browser allows localStorage
- **Files not uploading**: Ensure files are text-readable formats
- **Web content not fetching**: Due to browser security (CORS), some sites may not be directly accessible. The app will:
  1. Try direct fetch first
  2. Use CORS proxy services as fallback
  3. Prompt you to manually copy content if automatic methods fail
- **UI issues**: Try refreshing the page or clearing browser cache

## Local LLM Setup Guide

### Ollama (Recommended)
1. Install Ollama from [ollama.ai](https://ollama.ai)
2. Pull a model: `ollama pull llama3.1:8b`
3. Start Ollama service
4. In the app, click "LLM" button and configure:
   - API URL: `http://localhost:11434/api`
   - Model: `llama3.1:8b`
5. Test connection and enable analysis

### LM Studio
1. Install LM Studio from [lmstudio.ai](https://lmstudio.ai)
2. Download a model (e.g., Llama 3.1 8B)
3. Start the local server
4. Configure in the app:
   - API URL: `http://localhost:1234/v1`
   - Model: Your downloaded model name

### Other Services
- **LocalAI**: Follow LocalAI documentation for setup
- **Custom APIs**: Any OpenAI-compatible endpoint works

## Changelog

### 2026-01 (PromptForge update)
- **Branding**: Renamed the app to **PromptForge**.
- **UI/UX (Bootstrap 5)**:
  - Made **Generate Prompt** the primary call-to-action.
  - Added **progressive disclosure** via accordions for advanced fields (Camera / Look / Style & Composition / Style Reference).
  - Improved **Library** usability with a sticky desktop dock and collapsible “Add to Library”.
  - Added a **mobile sticky Generate** button for quicker access on small screens.
- **Output safety hardening (`app.js`)**:
  - `displayOutput()` renders text/json/markdown/csv via DOM nodes + `textContent` (no `innerHTML` injection).
  - HTML output is previewed in a **sandboxed iframe** to isolate exported HTML from the host page.
- **Model-aware sref handling (`app.js`)**:
  - Midjourney outputs `--sref` / `--sw`; other models keep sref as plain-language notes (type/value/weight).
- **Dark mode polish**: Reduced label glare for better readability.

## Future Enhancements

- Prompt templates and presets
- Integration with AI model APIs for direct testing
- Collaborative prompt sharing
- Advanced analytics and usage tracking
- Plugin system for custom enhancements

---

**Last Updated**: January 2026
