# AI Prompt Generator v1.1.0

A comprehensive web application for generating, managing, and optimizing prompts for various AI models. Features style references (sref), 20+ AI models, advanced parameters, and professional prompt generation capabilities.

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
- Search and manage your prompt collection
- Load saved prompts with one click
- Export/import functionality

### 🎨 Style Reference (sref) System
- **Style Reference Library**: Save and manage image URLs with descriptions
- **Weight Control**: Adjust style influence (0-1000) for fine-tuning
- **Style Descriptions**: Document the mood, aesthetic, and approach of each reference
- **Midjourney Integration**: Automatic `--sref` and `--sw` parameter formatting
- **One-Click Loading**: Quick access to saved style references
- **Reference Preview**: Direct links to view original style images

### 📁 Document & Web Content Management
- Upload documentation from AI model providers
- **Fetch content directly from web URLs** - Add AI documentation, tutorials, and guides from websites
- Automatic enhancement extraction from uploaded documents and web content
- Support for various file formats (.txt, .json, .md, .pdf, .doc, .docx)
- Drag-and-drop file upload interface
- Multiple fallback methods for web content fetching (direct fetch, CORS proxies, manual input)

### 💾 Data Persistence
- All data stored locally in browser storage
- No server required - runs completely offline
- Automatic saving of prompts, documents, and manual information

### 🎨 Modern UI
- Responsive Bootstrap 5 design
- Intuitive drag-and-drop interfaces
- Real-time feedback and notifications
- Mobile-friendly responsive layout

## How to Use

1. **Open the Application**: Simply open `index.html` in any modern web browser
2. **Configure Your Prompt**:
   - Select the AI model you're targeting
   - Choose the type of prompt (text-to-image, etc.)
   - Enter your base prompt
   - Optionally add camera angle and perspective settings
3. **Generate**: Click "Generate Prompt" to create your enhanced prompt
4. **Save to Library**: Save useful prompts for future use
5. **Add Content Sources**: 
   - Upload documentation files from AI providers
   - **Add web URLs** from AI model documentation, tutorials, or prompt guides
   - **Save style references** with URLs, weights, and descriptions
6. **Copy Output**: Use the generated prompt in your AI tool of choice

## File Structure

```
prompt-app/
├── index.html          # Main application interface
├── app.js             # Core application logic
└── README.md          # This documentation
```

## Browser Compatibility

- Chrome/Chromium (recommended)
- Firefox
- Safari
- Edge

## Local Storage

The application uses browser localStorage to persist:
- Saved prompts library
- Uploaded documents and their content
- Manual information notes
- User preferences

## Privacy

- All data is stored locally in your browser
- No data is sent to external servers
- Works completely offline after initial load

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

## Future Enhancements

- Export/import prompt libraries
- Advanced prompt templates
- Integration with AI model APIs
- Collaborative prompt sharing
- Advanced document parsing for better enhancement extraction

---

**Version**: 1.0  
**Last Updated**: September 2025
