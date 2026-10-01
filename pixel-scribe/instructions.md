# PixelScribe Feature Instructions

This document outlines the specifications for upcoming features to be implemented in PixelScribe. AI agents and developers should refer to this file when working on the project.

## Feature 1: Batch Image Discovery and Renaming
**Goal**: Allow users to quickly find a batch of images and rename them efficiently.

### Requirements:
- **Directory Scanning**: Create a Rust command in Tauri to scan a user-selected directory or standard directories, filtering for image files (e.g., `.png`, `.jpg`, `.jpeg`).
- **Frontend UI**: Provide a way for the user to trigger this scan and view the discovered images within the widget or an expanded view.
- **Batch Processing**: Allow the user to select multiple images and apply a batch renaming operation. The renaming could leverage the existing auto-rename logic (e.g., AI description) or a customizable template.

## Feature 2: Inactive Image Flagging and Deletion
**Goal**: Look at when images were last opened and flag images that have been inactive for a specific timeframe (e.g., more than a month) for deletion.

### Requirements:
- **Access Time Metadata**: Implement a Rust Tauri command to retrieve file metadata, specifically the last access time (`atime`). Ensure cross-platform compatibility where possible, as `atime` behavior can vary between macOS, Windows, and Linux.
- **Configurable Timeframe**: The threshold (defaulting to 1 month) must be configurable by the user. Add a simple settings state or view where the user can change this timeframe (e.g., 1 week, 1 month, 3 months).
- **Flagging System**: Periodically or on-demand, scan monitored folders and identify images whose last access time is older than the configured threshold.
- **Review and Deletion**: Present the flagged images to the user in a "Cleanup" list. The user should be able to review these images and click a button to delete them. Implement the actual deletion via a secure Rust command (e.g., moving to the system trash).
