# PixelScribe Agent Rules

## Project Context
PixelScribe is a Tauri-based desktop application (React/TypeScript frontend, Rust backend) that automatically monitors directories (Downloads, Desktop, Screenshots) and renames generically-named images. The application is designed as a minimalistic floating widget.

## Architecture Guidelines
- **Frontend**: React hooks (`useState`, `useEffect`). Interactions with Tauri happen via `@tauri-apps/api/core` (`invoke`) and `@tauri-apps/api/event` (`listen`). The window auto-resizes based on task count.
- **Backend (Tauri)**: Rust-based commands (`#[tauri::command]`) are used for handling file system operations and metadata extraction to ensure native performance and safety.
- **Styling**: Custom CSS in `App.css`. The app functions as a borderless widget.

## AI Agent Instructions
1. **Prefer Native APIs**: When implementing file operations, always use Tauri's native Rust file APIs in `src-tauri/src/main.rs`. Node.js APIs should not be used as they are not available in the packaged Tauri binary.
2. **Follow Instructions**: Always refer to `instructions.md` in the project root to understand the current feature goals and specifications before writing code.
3. **Keep UI Minimal**: Retain the widget-like feel. If a feature requires extensive UI (like batch selection or settings), consider how it can be cleanly integrated into the existing widget layout (e.g., expanding the window or navigating to a secondary view).
4. **Update Specs**: Update `instructions.md` when features are completed or if technical constraints require a change in the specification.
