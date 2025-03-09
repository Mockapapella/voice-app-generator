# Voice App Generator

## Essential Features

1. **Voice-to-App Conversion**
   - Record voice instructions describing desired app
   - Transcribe voice to text (Groq Whisper API)
   - Generate HTML/CSS/JS from text (Groq LLama3)
   - Render working web component

2. **Audio Recording & Playback**
   - High-quality audio capture
   - Cross-platform compatibility (iOS, Android, web)
   - Playback controls with auto-completion detection
   - Visual feedback during recording

3. **App Generation**
   - Material Design components with consistent styling
   - Vanilla JavaScript with no external dependencies
   - Responsive layout for all screen sizes
   - Error handling for generated code

4. **App Modification**
   - Modify existing components with voice commands
   - Preserve styling and structure while applying changes
   - Minimize code changes when updating components
   - Simple two-button UI (Modify/Create)

5. **User Experience**
   - Real-time status updates during processing
   - Clean interface with minimal friction
   - Intuitive recording controls
   - Interactive preview of generated components

### Progress Made
- Successfully implemented the complete voice → transcription → LLM → component pipeline
- Removed server dependency to create a fully client-side solution
- Created robust component detection and rendering system
- Implemented proper error handling throughout the application
- Applied good practices for API key management

## Build, Test & Lint Commands
- Start app: `npm start` or `npx expo start`
- Run on Android: `npm run android`
- Run on iOS: `npm run ios`
- Run on web: `npm run web`
- Run all tests: `npm test`
- Run single test: `npx jest path/to/test-file.tsx`
- Lint: `npm run lint`
- Reset project: `npm run reset-project`

## Code Style Guidelines
- **Files**: PascalCase for components (e.g., `ThemedText.tsx`), camelCase for utilities
- **Components**: Use functional components with hooks
- **Naming**: PascalCase for components/types, camelCase for functions/variables
- **Imports**: Group: (1) React/RN core, (2) third-party, (3) local imports using `@/` paths
- **Types**: Use TypeScript throughout; explicit prop type interfaces with `Props` suffix
- **Formatting**: 2-space indentation, single quotes for strings
- **Error Handling**: Use try/catch with console.error logging and user-facing alerts

## Component Pattern
- Export named components except for screen components (default exports)
- Destructure props in function parameters
- Define StyleSheet at bottom of files
- Use composition with core components (e.g., ThemedView wrapping View)

## API Integration Notes
- Groq API requires environment variable `GROQ_API_KEY` to be set
- Audio files must be in supported formats (mp3, webm, mp4, etc.)
- Monitor API usage to avoid exceeding rate limits
