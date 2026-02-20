import { useState, useEffect, useCallback, useRef } from "react";
import * as api from "../services/api";

export function useDocumentState(docId) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const undoStackRef = useRef([]);

  const reload = useCallback(async () => {
    if (!docId) return;
    setLoading(true);
    try {
      const s = await api.getState(docId);
      setState(s);
    } catch (e) {
      console.error("Failed to load state:", e);
    } finally {
      setLoading(false);
    }
  }, [docId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const pushUndo = useCallback((prevState) => {
    undoStackRef.current.push(JSON.stringify(prevState));
    if (undoStackRef.current.length > 50) undoStackRef.current.shift();
  }, []);

  const undo = useCallback(async () => {
    if (undoStackRef.current.length === 0) return;
    // For undo, we reload from server (simplified approach)
    // In a real app we'd restore the previous state
    await reload();
  }, [reload]);

  const addAnnotation = useCallback(
    async (ann) => {
      if (!docId) return;
      if (state) pushUndo(state);
      const result = await api.addAnnotation(docId, ann);
      await reload();
      return result;
    },
    [docId, state, pushUndo, reload]
  );

  const deleteAnnotation = useCallback(
    async (annId) => {
      if (!docId) return;
      if (state) pushUndo(state);
      await api.deleteAnnotation(docId, annId);
      await reload();
    },
    [docId, state, pushUndo, reload]
  );

  const clearPageAnnotations = useCallback(
    async (page) => {
      if (!docId) return;
      if (state) pushUndo(state);
      await api.clearAnnotations(docId, page);
      await reload();
    },
    [docId, state, pushUndo, reload]
  );

  const saveNote = useCallback(
    async (page, note) => {
      if (!docId) return;
      await api.saveNote(docId, page, { ...note, page });
      await reload();
    },
    [docId, reload]
  );

  const addTag = useCallback(
    async (tag) => {
      if (!docId) return;
      await api.createTag(docId, tag);
      await reload();
    },
    [docId, reload]
  );

  const removeTag = useCallback(
    async (tagId) => {
      if (!docId) return;
      await api.deleteTag(docId, tagId);
      await reload();
    },
    [docId, reload]
  );

  const tagSlide = useCallback(
    async (page, tagId) => {
      if (!docId) return;
      await api.addSlideTag(docId, { page, tag_id: tagId });
      await reload();
    },
    [docId, reload]
  );

  const untagSlide = useCallback(
    async (page, tagId) => {
      if (!docId) return;
      await api.removeSlideTag(docId, page, tagId);
      await reload();
    },
    [docId, reload]
  );

  const addDefLink = useCallback(
    async (link) => {
      if (!docId) return;
      await api.addLink(docId, link);
      await reload();
    },
    [docId, reload]
  );

  const removeDefLink = useCallback(
    async (linkId) => {
      if (!docId) return;
      await api.deleteLink(docId, linkId);
      await reload();
    },
    [docId, reload]
  );

  return {
    state,
    loading,
    reload,
    undo,
    addAnnotation,
    deleteAnnotation,
    clearPageAnnotations,
    saveNote,
    addTag,
    removeTag,
    tagSlide,
    untagSlide,
    addDefLink,
    removeDefLink,
  };
}
