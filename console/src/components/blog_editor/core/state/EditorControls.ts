import { Extension } from '@tiptap/core'

/**
 * Interface representing the state of editor UI controls and configuration
 */
export interface EditorControls {
  isDragging: boolean
  dragHandleLocked: boolean
  activeMenuId: string | null
  disableH1: boolean
}

/**
 * Default initial state for editor controls
 */
export const INITIAL_EDITOR_CONTROLS: EditorControls = {
  isDragging: false,
  dragHandleLocked: false,
  activeMenuId: null,
  disableH1: false
}

/**
 * Extend Tiptap's core types to include our custom commands and storage
 */
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mailwaveEditorControls: {
      setDragging: (value: boolean) => ReturnType
      setHandleLock: (value: boolean) => ReturnType
      setActiveMenu: (id: string | null) => ReturnType
      resetControls: () => ReturnType
    }
  }

  interface Storage {
    mailwaveEditorControls: EditorControls
  }
}

/**
 * Options for ControlsExtension
 */
export interface ControlsExtensionOptions {
  disableH1?: boolean
}

/**
 * ControlsExtension - Manages UI control state for the Mailwave editor
 *
 * This extension provides a centralized way to manage editor UI state separate
 * from document state, including drag operations, menu visibility, and control locks.
 */
export const ControlsExtension = Extension.create<ControlsExtensionOptions>({
  name: 'mailwaveEditorControls',

  addOptions() {
    return {
      disableH1: false
    }
  },

  addStorage() {
    return {
      mailwaveEditorControls: { ...INITIAL_EDITOR_CONTROLS }
    }
  },

  addCommands() {
    return {
      setDragging: (value: boolean) => () => {
        this.storage.mailwaveEditorControls.isDragging = value
        return true
      },

      setHandleLock: (value: boolean) => () => {
        this.storage.mailwaveEditorControls.dragHandleLocked = value
        return true
      },

      setActiveMenu: (id: string | null) => () => {
        this.storage.mailwaveEditorControls.activeMenuId = id
        return true
      },

      resetControls: () => () => {
        this.storage.mailwaveEditorControls = { ...INITIAL_EDITOR_CONTROLS }
        return true
      }
    }
  },

  onCreate() {
    // Initialize storage on extension creation with options
    this.storage.mailwaveEditorControls = {
      ...INITIAL_EDITOR_CONTROLS,
      disableH1: this.options.disableH1 ?? false
    }
  }
})
