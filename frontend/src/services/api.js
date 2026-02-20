const API = "http://localhost:8000/api";

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

// Documents
export const uploadDocument = async (file, onProgress) => {
  const form = new FormData();
  form.append("file", file);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API}/documents/upload`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
      else reject(new Error("Upload failed"));
    };
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(form);
  });
};

export const getDocuments = () => request("/documents/");
export const getDocument = (id) => request(`/documents/${id}`);
export const deleteDocument = (id) => request(`/documents/${id}`, { method: "DELETE" });
export const updatePageCount = (id, total) =>
  request(`/documents/${id}/pages?total_pages=${total}`, { method: "PATCH" });

// State
export const getState = (id) => request(`/state/${id}`);
export const addAnnotation = (id, ann) =>
  request(`/state/${id}/annotations`, { method: "POST", body: JSON.stringify(ann) });
export const deleteAnnotation = (id, annId) =>
  request(`/state/${id}/annotations/${annId}`, { method: "DELETE" });
export const clearAnnotations = (id, page) =>
  request(`/state/${id}/annotations${page != null ? `?page=${page}` : ""}`, { method: "DELETE" });

export const saveNote = (id, page, note) =>
  request(`/state/${id}/notes/${page}`, { method: "PUT", body: JSON.stringify(note) });
export const getNote = (id, page) => request(`/state/${id}/notes/${page}`);

export const getTags = (id) => request(`/state/${id}/tags`);
export const createTag = (id, tag) =>
  request(`/state/${id}/tags`, { method: "POST", body: JSON.stringify(tag) });
export const deleteTag = (id, tagId) =>
  request(`/state/${id}/tags/${tagId}`, { method: "DELETE" });
export const addSlideTag = (id, slideTag) =>
  request(`/state/${id}/slide-tags`, { method: "POST", body: JSON.stringify(slideTag) });
export const removeSlideTag = (id, page, tagId) =>
  request(`/state/${id}/slide-tags/${page}/${tagId}`, { method: "DELETE" });

export const getLinks = (id) => request(`/state/${id}/links`);
export const addLink = (id, link) =>
  request(`/state/${id}/links`, { method: "POST", body: JSON.stringify(link) });
export const deleteLink = (id, linkId) =>
  request(`/state/${id}/links/${linkId}`, { method: "DELETE" });

// Segments
export const getPageSegments = (docId, page) => request(`/documents/${docId}/segments/${page}`);

// Concept graph
export const getConceptGraph = (docId) => request(`/documents/${docId}/concepts`);

// AI
export const explainText = (docId, page, text) =>
  request("/ai/explain", {
    method: "POST",
    body: JSON.stringify({ document_id: docId, page, selected_text: text }),
  });
export const generateRecap = (docId, pages) =>
  request("/ai/recap", {
    method: "POST",
    body: JSON.stringify({ document_id: docId, pages }),
  });
export const alterContent = (docId, page, text, type) =>
  request("/ai/alter", {
    method: "POST",
    body: JSON.stringify({ document_id: docId, page, selected_text: text, alteration_type: type }),
  });

export const PDF_BASE_URL = "http://localhost:8000/uploads";
